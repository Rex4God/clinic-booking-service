"use strict";
const mongoose = require("mongoose");
const { StatusCodes } = require("http-status-codes");
const bookingValidator = require("../validators/BookingValidator");
const bookingRepository = require("../repositories/BookingRepository");
const slotRepository = require("../repositories/SlotRepository");
const {
    generateBookingReference,
    resolvePagination,
    isDuplicateKeyError
} = require("../utils/helpers");
const {
    BOOKING_STATUS,
    MAX_ACTIVE_BOOKINGS_PER_PATIENT,
    PAGINATION
} = require("../utils/constants");

const UNKNOWN_ERROR = "An unknown error has occurred. Please try again later";
const MAX_REFERENCE_ATTEMPTS = 3;





const resolveUnclaimableSlot = async (slotId) => {
    if (!mongoose.isValidObjectId(slotId)) {
        return {
            error: "Oops! This slot was not found. Please check the slotId and try again",
            statusCode: StatusCodes.NOT_FOUND
        };
    }

    const slot = await slotRepository.findById(slotId);

    if (!slot) return {
        error: "Oops! This slot was not found. Please check the slotId and try again",
        statusCode: StatusCodes.NOT_FOUND
    };

    if (slot.startTime <= new Date()) return {
        error: "This slot has already started and can no longer be booked",
        statusCode: StatusCodes.BAD_REQUEST
    };

    return {
        error: "Sorry, this slot has already been booked. Please choose another slot",
        statusCode: StatusCodes.CONFLICT
    };
};

exports.createBooking = async (body = {}) => {
    try {
        const validatorError = await bookingValidator.createBooking(body);
        if (validatorError) return {
            error: validatorError,
            statusCode: StatusCodes.BAD_REQUEST
        };

        if (!mongoose.isValidObjectId(body.slotId)) {
            return {
                error: "Oops! This slot was not found. Please check the slotId and try again",
                statusCode: StatusCodes.NOT_FOUND
            };
        }

        const patientEmail = body.patientEmail.trim().toLowerCase();

        const activeBookings = await bookingRepository.count({
            patientEmail,
            status: BOOKING_STATUS.CONFIRMED,
            startTime: { $gt: new Date() }
        });
        if (activeBookings >= MAX_ACTIVE_BOOKINGS_PER_PATIENT) return {
            error: `You already have ${activeBookings} upcoming bookings. ` +
                `A maximum of ${MAX_ACTIVE_BOOKINGS_PER_PATIENT} is allowed. Please cancel one before booking another`,
            statusCode: StatusCodes.CONFLICT
        };

        const bookingId = new mongoose.Types.ObjectId();
        const slot = await slotRepository.claim(body.slotId, bookingId);
        if (!slot) return resolveUnclaimableSlot(body.slotId);

        const overlappingBooking = await bookingRepository.findOne({
            patientEmail,
            status: BOOKING_STATUS.CONFIRMED,
            startTime: { $lt: slot.endTime },
            endTime: { $gt: slot.startTime }
        });
        if (overlappingBooking) {
            await slotRepository.release(slot._id, bookingId);
            return {
                error: `You already have a confirmed appointment with ${overlappingBooking.practitioner} during this time slot`,
                statusCode: StatusCodes.CONFLICT
            };
        }

        let booking;
        try {
            for (let attempt = 1; !booking; attempt++) {
                try {
                    booking = await bookingRepository.create({
                        _id: bookingId,
                        reference: generateBookingReference(),
                        slot: slot._id,
                        patientName: body.patientName,
                        patientEmail,
                        patientPhone: body.patientPhone,
                        reason: body.reason,
                        startTime: slot.startTime,
                        endTime: slot.endTime,
                        practitioner: slot.practitioner,
                        status: BOOKING_STATUS.CONFIRMED
                    });
                } catch (e) {
                    const referenceClash = isDuplicateKeyError(e) && e.keyPattern && e.keyPattern.reference;
                    if (!referenceClash || attempt >= MAX_REFERENCE_ATTEMPTS) throw e;
                }
            }
        } catch (e) {
            await slotRepository.release(slot._id, bookingId);

            if (isDuplicateKeyError(e)) {
                const isPatientTimeClash = e.keyPattern && e.keyPattern.patientEmail;
                return {
                    error: isPatientTimeClash
                        ? "You already have a confirmed appointment at this time with another practitioner"
                        : "Sorry, this slot has already been booked. Please choose another slot",
                    statusCode: StatusCodes.CONFLICT
                };
            }
            throw e;
        }

        return {
            data: {
                booking
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

exports.resolveBooking = async (reference) => {
    try {
        const validatorError = await bookingValidator.bookingReference(reference);
        if (validatorError) return {
            error: "Oops! This booking was not found. Please check the reference and try again",
            statusCode: StatusCodes.NOT_FOUND
        };

        const booking = await bookingRepository.findOne({ reference });

        if (!booking) return {
            error: "Oops! This booking was not found. Please check the reference and try again",
            statusCode: StatusCodes.NOT_FOUND
        };

        return {
            data: {
                booking
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

exports.cancelBooking = async (reference) => {
    try {
        const validatorError = await bookingValidator.bookingReference(reference);
        if (validatorError) return {
            error: "Oops! This booking was not found. Please check the reference and try again",
            statusCode: StatusCodes.NOT_FOUND
        };

        const booking = await bookingRepository.findOneAndUpdate(
            { reference, status: BOOKING_STATUS.CONFIRMED, startTime: { $gt: new Date() } },
            { $set: { status: BOOKING_STATUS.CANCELLED, cancelledAt: new Date() } }
        );

        if (!booking) {
            const existing = await bookingRepository.findOne({ reference });

            if (!existing) return {
                error: "Oops! This booking was not found. Please check the reference and try again",
                statusCode: StatusCodes.NOT_FOUND
            };

            if (existing.status === BOOKING_STATUS.CANCELLED) return {
                error: "This booking has already been cancelled",
                statusCode: StatusCodes.CONFLICT
            };

            return {
                error: "This appointment has already started or passed and can no longer be cancelled",
                statusCode: StatusCodes.CONFLICT
            };
        }

        await slotRepository.release(booking.slot, booking._id);

        return {
            data: {
                booking
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

exports.fetchPatientBookings = async (requestQuery = {}) => {
    try {
        const validatorError = await bookingValidator.fetchPatientBookings(requestQuery);
        if (validatorError) return {
            error: validatorError,
            statusCode: StatusCodes.UNPROCESSABLE_ENTITY
        };

        const { page, limit } = resolvePagination(requestQuery, {
            defaultLimit: PAGINATION.DEFAULT_LIMIT,
            maxLimit: PAGINATION.MAX_LIMIT
        });

        const filter = { patientEmail: requestQuery.email.trim().toLowerCase() };
        if (requestQuery.status) filter.status = requestQuery.status;

        const bookings = await bookingRepository.all(filter, { startTime: -1, _id: -1 }, page, limit);

        return {
            data: bookings,
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
