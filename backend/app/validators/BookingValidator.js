"use strict";
const Joi = require("joi");
const dayjs = require("dayjs");
const customParseFormat = require("dayjs/plugin/customParseFormat");
const { validate } = require("../utils/helpers");
const { BOOKING_STATUS, PAGINATION } = require("../utils/constants");

dayjs.extend(customParseFormat);

const objectId = Joi.string().hex().length(24);
const page = Joi.number().integer().min(1);
const limit = Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT);

exports.createBooking = async (payload) => {
    const schema = {
        slotId: Joi.string().trim().required(),
        patientName: Joi.string().trim().min(2).max(100).required(),
        patientEmail: Joi.string().trim().email().max(254).required(),
        patientPhone: Joi.string().trim().pattern(/^\+?[0-9\s\-()]{7,20}$/)
            .messages({ "string.pattern.base": "patientPhone must be a valid phone number" }),
        reason: Joi.string().trim().max(500).allow(""),
    };
    return validate(schema, payload);
};

exports.fetchPatientBookings = async (query) => {
    const schema = {
        email: Joi.string().trim().email().max(254).required(),
        status: Joi.string().valid(BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.CANCELLED),
        page,
        limit,
    };
    return validate(schema, query);
};

exports.fetchAvailableSlots = async (query) => {
    const schema = {
        date: Joi.string().custom((value, helpers) => {
            if (!dayjs(value, "YYYY-MM-DD", true).isValid())
                return helpers.message("date must be in the format YYYY-MM-DD");
            return value;
        }),
        practitioner: Joi.string().trim().max(100),
        page,
        limit,
    };
    return validate(schema, query);
};

exports.bookingReference = async (reference) => {
    const schema = {
        reference: Joi.string().pattern(/^BK-[A-Z0-9]{8}$/).required()
            .messages({ "string.pattern.base": "reference must look like BK-XXXXXXXX" }),
    };
    return validate(schema, { reference });
};

