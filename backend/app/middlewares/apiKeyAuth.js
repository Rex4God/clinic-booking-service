"use strict";
const crypto = require("crypto");
const mongoose = require("mongoose");
const response = require("../utils/responses");
const { StatusCodes } = require("http-status-codes");
const { sha256 } = require("../utils/helpers");
const { API_KEY_STATUS } = require("../utils/constants");
const apiKeyRepository = require("../repositories/ApiKeyRepository");

const API_KEY_HEADER = "x-api-key";

const configuredKeyHashes = () => (process.env.API_KEYS || "")
    .split(",")
    .map(key => key.trim())
    .filter(Boolean)
    .map(key => Buffer.from(sha256(key), "hex"));


module.exports = async (req, res, next) => {
    const providedKey = req.get(API_KEY_HEADER);

    if (!providedKey) return response.error(res,
        `Missing API key. Provide your key in the '${API_KEY_HEADER}' header`, StatusCodes.UNAUTHORIZED);

    const providedHashHex = sha256(providedKey);
    const providedHash = Buffer.from(providedHashHex, "hex");

    const validKeyHashes = configuredKeyHashes();
    const matchedEnvKey = validKeyHashes.some(hash => crypto.timingSafeEqual(hash, providedHash));

    if (matchedEnvKey) {
        req.apiClientId = providedHashHex.slice(0, 16);
        return next();
    }

    if (mongoose.connection.readyState === 1) {
        try {
            const dbKey = await apiKeyRepository.findOne({ keyHash: providedHashHex });

            if (dbKey) {
                if (dbKey.status === API_KEY_STATUS.REVOKED) {
                    return response.error(res, "This API key has been revoked", StatusCodes.UNAUTHORIZED);
                }

                if (dbKey.expiresAt && dbKey.expiresAt <= new Date()) {
                    return response.error(res, "This API key has expired", StatusCodes.UNAUTHORIZED);
                }

                apiKeyRepository.findOneAndUpdate(
                    { _id: dbKey._id },
                    { $set: { lastUsedAt: new Date() } }
                ).catch(() => { });

                req.apiClientId = providedHashHex.slice(0, 16);
                req.apiKey = dbKey;
                return next();
            }
        } catch (e) {
            console.error("Error verifying API key:", e);
        }
    }

    return response.error(res, "Invalid API key", StatusCodes.UNAUTHORIZED);
};
