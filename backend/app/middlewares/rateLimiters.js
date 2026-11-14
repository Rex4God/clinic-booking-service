"use strict";
const rateLimit = require("express-rate-limit");
const { StatusCodes } = require("http-status-codes");

const minutes = (value) => value * 60 * 1000;
const envInt = (name, fallback) => parseInt(process.env[name]) || fallback;

const rateLimitHandler = (message) => (req, res, next, options) => {
    const resetTime = req.rateLimit && req.rateLimit.resetTime;
    const retryAfter = resetTime
        ? Math.max(1, Math.ceil((new Date(resetTime).getTime() - Date.now()) / 1000))
        : Math.ceil((options.windowMs || 60000) / 1000);
    res.setHeader("Retry-After", String(retryAfter));

    return res
        .status(options.statusCode || StatusCodes.TOO_MANY_REQUESTS)
        .json({ error: message });
};

const baseOptions = {
    standardHeaders: true,
    legacyHeaders: false,
    validate: false
};

exports.globalLimiter = rateLimit({
    ...baseOptions,
    windowMs: minutes(envInt("RATE_LIMIT_WINDOW_MINUTES", 15)),
    max: envInt("RATE_LIMIT_MAX", 300),
    handler: rateLimitHandler("Too many requests. Please slow down and try again later")
});

exports.bookingClientLimiter = rateLimit({
    ...baseOptions,
    windowMs: minutes(envInt("BOOKING_RATE_LIMIT_WINDOW_MINUTES", 15)),
    max: envInt("BOOKING_RATE_LIMIT_MAX", 10),
    keyGenerator: (req) => `${req.apiClientId || "anonymous"}:${req.ip}`,
    handler: rateLimitHandler("Too many booking attempts from this client. Please try again later")
});

exports.bookingPatientLimiter = rateLimit({
    ...baseOptions,
    windowMs: minutes(envInt("PATIENT_RATE_LIMIT_WINDOW_MINUTES", 1)),
    max: envInt("PATIENT_RATE_LIMIT_MAX", 5),
    skip: (req) => !req.body || typeof req.body.patientEmail !== "string",
    keyGenerator: (req) => `patient:${req.body.patientEmail.trim().toLowerCase()}`,
    handler: rateLimitHandler("Too many booking attempts for this patient. Please try again later")
});

