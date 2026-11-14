"use strict";

exports.SLOT_STATUS = {
    AVAILABLE: "Available",
    BOOKED: "Booked"
};

exports.BOOKING_STATUS = {
    CONFIRMED: "Confirmed",
    CANCELLED: "Cancelled"
};

exports.IDEMPOTENCY_STATUS = {
    PROCESSING: "Processing",
    COMPLETED: "Completed"
};

exports.API_KEY_STATUS = {
    ACTIVE: "Active",
    REVOKED: "Revoked"
};

exports.SLOT_DURATION_MINUTES = parseInt(process.env.SLOT_DURATION_MINUTES || "60");

exports.MAX_ACTIVE_BOOKINGS_PER_PATIENT = parseInt(process.env.MAX_ACTIVE_BOOKINGS_PER_PATIENT || "5");

exports.IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

exports.PAGINATION = {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 100
};
