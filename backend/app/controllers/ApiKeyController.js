"use strict";
const response = require("../utils/responses");
const apiKeyService = require("../services/ApiKeyService");


exports.createApiKey = async (req, res) => {
    const {
        error,
        data,
        statusCode
    } = await apiKeyService.createApiKey(req.body);

    if (error) return response.error(res, error, statusCode);

    return response.success(res, data, statusCode);
};

exports.fetchApiKeys = async (req, res) => {
    const {
        error,
        data,
        statusCode
    } = await apiKeyService.fetchApiKeys(req.query);

    if (error) return response.error(res, error, statusCode);

    return response.paginated(res, data, statusCode);
};

exports.revokeApiKey = async (req, res) => {
    const {
        error,
        data,
        statusCode
    } = await apiKeyService.revokeApiKey(req.params.keyId);

    if (error) return response.error(res, error, statusCode);

    return response.success(res, data, statusCode);
};

