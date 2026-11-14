"use strict";
const { StatusCodes } = require("http-status-codes");
const response = require("../utils/responses");
const idempotencyKeyRepository = require("../repositories/IdempotencyKeyRepository");
const { sha256, stableStringify, isDuplicateKeyError } = require("../utils/helpers");
const { IDEMPOTENCY_STATUS } = require("../utils/constants");

const IDEMPOTENCY_HEADER = "Idempotency-Key";
const KEY_PATTERN = /^[A-Za-z0-9_\-:.]{8,128}$/;
const LOCK_TIMEOUT_MS = 30 * 1000;


module.exports = async (req, res, next) => {
    const idempotencyKey = req.get(IDEMPOTENCY_HEADER);

    if (!idempotencyKey) {
        return next();
    }

    if (!KEY_PATTERN.test(idempotencyKey)) return response.error(res,
        `The '${IDEMPOTENCY_HEADER}' header must be 8-128 characters of letters, numbers, '-', '_', ':' or '.'`,
        StatusCodes.BAD_REQUEST);

    const key = `${req.apiClientId || "anonymous"}:${req.method}:${req.baseUrl}${req.path}:${idempotencyKey}`;
    const requestHash = sha256(stableStringify(req.body || {}));

    try {
        await idempotencyKeyRepository.create({ key, requestHash, status: IDEMPOTENCY_STATUS.PROCESSING });
    } catch (e) {
        if (!isDuplicateKeyError(e)) throw e;

        const existing = await idempotencyKeyRepository.findOne({ key });

        if (!existing) return response.error(res,
            "A request with this Idempotency-Key is being processed. Please retry shortly", StatusCodes.CONFLICT);

        if (existing.requestHash !== requestHash) return response.error(res,
            "This Idempotency-Key has already been used with a different request payload",
            StatusCodes.UNPROCESSABLE_ENTITY);

        if (existing.status === IDEMPOTENCY_STATUS.PROCESSING) {
            const takenOver = await idempotencyKeyRepository.findOneAndUpdate(
                { key, status: IDEMPOTENCY_STATUS.PROCESSING, lockedAt: { $lt: new Date(Date.now() - LOCK_TIMEOUT_MS) } },
                { $set: { lockedAt: new Date() } }
            );

            if (!takenOver) return response.error(res,
                "A request with this Idempotency-Key is being processed. Please retry shortly", StatusCodes.CONFLICT);
        } else {
            res.set("Idempotent-Replayed", "true");
            return res.status(existing.responseStatusCode).json(existing.responseBody);
        }
    }

    const originalJson = res.json.bind(res);
    res.json = async (body) => {
        res.json = originalJson;
        try {
            if (res.statusCode >= 500) {
                await idempotencyKeyRepository.deleteMany({ key });
            } else {
                await idempotencyKeyRepository.update({ key }, {
                    $set: {
                        status: IDEMPOTENCY_STATUS.COMPLETED,
                        responseStatusCode: res.statusCode,
                        responseBody: JSON.parse(JSON.stringify(body))
                    }
                });
            }
        } catch (e) {
            console.log("Failed to persist idempotency record " + e);
        }

        return originalJson(body);
    };

    return next();
};
