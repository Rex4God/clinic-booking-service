"use strict";

process.env.NODE_ENV = "test";
process.env.API_KEYS = "test-api-key,second-test-key";
process.env.MAX_ACTIVE_BOOKINGS_PER_PATIENT = process.env.MAX_ACTIVE_BOOKINGS_PER_PATIENT || "3";
process.env.RATE_LIMIT_MAX = process.env.RATE_LIMIT_MAX || "100000";
process.env.BOOKING_RATE_LIMIT_MAX = process.env.BOOKING_RATE_LIMIT_MAX || "100000";
process.env.PATIENT_RATE_LIMIT_MAX = process.env.PATIENT_RATE_LIMIT_MAX || "100000";

const crypto = require("crypto");
const Slot = require("../../app/models/SlotModel");

const API_KEY = "test-api-key";

const createSlot = (overrides = {}) => {
    const startTime = overrides.startTime || new Date(Date.now() + 24 * 60 * 60 * 1000 + Math.floor(Math.random() * 1e9));
    return Slot.create({
        practitioner: "Dr. Test",
        startTime,
        endTime: new Date(startTime.getTime() + 30 * 60 * 1000),
        ...overrides
    });
};

const bookingPayload = (slotId, overrides = {}) => ({
    slotId: slotId.toString(),
    patientName: "Ada Lovelace",
    patientEmail: "ada@example.com",
    patientPhone: "+2348012345678",
    reason: "Check-up",
    ...overrides
});

const newIdempotencyKey = () => crypto.randomUUID();

module.exports = { API_KEY, createSlot, bookingPayload, newIdempotencyKey };

