"use strict";
const Joi = require("joi");
const { validate } = require("../utils/helpers");
const { API_KEY_STATUS, PAGINATION } = require("../utils/constants");

const page = Joi.number().integer().min(1);
const limit = Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT);

exports.createApiKey = async (payload) => {
    const schema = {
        name: Joi.string().trim().min(2).max(100).required(),
        description: Joi.string().trim().max(500).allow(""),
        expiresInDays: Joi.number().integer().min(1).max(3650)
    };
    return validate(schema, payload);
};

exports.fetchApiKeys = async (query) => {
    const schema = {
        status: Joi.string().valid(API_KEY_STATUS.ACTIVE, API_KEY_STATUS.REVOKED),
        page,
        limit
    };
    return validate(schema, query);
};

