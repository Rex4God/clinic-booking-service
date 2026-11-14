"use strict";
const mongoose = require("mongoose");
const { StatusCodes } = require("http-status-codes");
const apiKeyValidator = require("../validators/ApiKeyValidator");
const apiKeyRepository = require("../repositories/ApiKeyRepository");
const { generateApiKey, resolvePagination } = require("../utils/helpers");
const { API_KEY_STATUS, PAGINATION } = require("../utils/constants");

const UNKNOWN_ERROR = "An unknown error has occurred. Please try again later";


exports.createApiKey = async (body = {}) => {
    try {
        const validatorError = await apiKeyValidator.createApiKey(body);
        if (validatorError) return {
            error: validatorError,
            statusCode: StatusCodes.BAD_REQUEST
        };

        const { apiKey, keyPrefix, keyHash } = generateApiKey("clinical_live");

        let expiresAt = null;
        if (body.expiresInDays) {
            expiresAt = new Date(Date.now() + Number(body.expiresInDays) * 24 * 60 * 60 * 1000);
        }

        const keyRecord = await apiKeyRepository.create({
            name: body.name.trim(),
            description: body.description ? body.description.trim() : "",
            keyPrefix,
            keyHash,
            status: API_KEY_STATUS.ACTIVE,
            expiresAt
        });

        return {
            data: {
                message: "Store this API key securely. It will not be shown again.",
                apiKey,
                details: keyRecord
            },
            statusCode: StatusCodes.CREATED
        };
    } catch (e) {
        console.log(UNKNOWN_ERROR + e);
        return {
            error: UNKNOWN_ERROR,
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR
        };
    }
};

exports.fetchApiKeys = async (requestQuery = {}) => {
    try {
        const validatorError = await apiKeyValidator.fetchApiKeys(requestQuery);
        if (validatorError) return {
            error: validatorError,
            statusCode: StatusCodes.BAD_REQUEST
        };

        const { page, limit } = resolvePagination(requestQuery, {
            defaultLimit: PAGINATION.DEFAULT_LIMIT,
            maxLimit: PAGINATION.MAX_LIMIT
        });

        const filter = {};
        if (requestQuery.status) filter.status = requestQuery.status;

        const keys = await apiKeyRepository.all(filter, { _id: -1 }, page, limit);

        return {
            data: keys,
            statusCode: StatusCodes.OK
        };
    } catch (e) {
        console.log(UNKNOWN_ERROR + e);
        return {
            error: UNKNOWN_ERROR,
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR
        };
    }
};

exports.revokeApiKey = async (keyId) => {
    try {
        if (!mongoose.isValidObjectId(keyId)) {
            return {
                error: "API key not found",
                statusCode: StatusCodes.NOT_FOUND
            };
        }

        const existing = await apiKeyRepository.findById(keyId);
        if (!existing) {
            return {
                error: "API key not found",
                statusCode: StatusCodes.NOT_FOUND
            };
        }

        if (existing.status === API_KEY_STATUS.REVOKED) {
            return {
                error: "This API key has already been revoked",
                statusCode: StatusCodes.CONFLICT
            };
        }

        const updated = await apiKeyRepository.findOneAndUpdate(
            { _id: keyId },
            { $set: { status: API_KEY_STATUS.REVOKED, revokedAt: new Date() } }
        );

        return {
            data: {
                message: "API key has been revoked successfully",
                apiKey: updated
            },
            statusCode: StatusCodes.OK
        };
    } catch (e) {
        console.log(UNKNOWN_ERROR + e);
        return {
            error: UNKNOWN_ERROR,
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR
        };
    }
};

