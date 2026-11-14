"use strict";
const mongoose = require("mongoose");
const { StatusCodes } = require("http-status-codes");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const bookingValidator = require("../validators/BookingValidator");
const slotRepository = require("../repositories/SlotRepository");
const bookingRepository = require("../repositories/BookingRepository");
const idempotencyKeyRepository = require("../repositories/IdempotencyKeyRepository");
const { resolvePagination } = require("../utils/helpers");
const { SLOT_STATUS, SLOT_DURATION_MINUTES, PAGINATION } = require("../utils/constants");

dayjs.extend(utc);
dayjs.extend(timezone);

const CLINIC_TIMEZONE = () => process.env.CLINIC_TIMEZONE || "Africa/Lagos";
const DEFAULT_PRACTITIONERS = ["Dr. Ada Obi", "Dr. Tunde Bello"];


exports.fetchAvailableSlots = async (requestQuery = {}) => {
    try {
        const validatorError = await bookingValidator.fetchAvailableSlots(requestQuery);
        if (validatorError) return {
            error: validatorError,
            statusCode: StatusCodes.UNPROCESSABLE_ENTITY
        };

        const { page, limit } = resolvePagination(requestQuery, {
            defaultLimit: 50,
            maxLimit: PAGINATION.MAX_LIMIT
        });

        const now = new Date();
        const filter = { status: SLOT_STATUS.AVAILABLE, startTime: { $gt: now } };

        if (requestQuery.date) {
            const dayStart = dayjs.tz(requestQuery.date, CLINIC_TIMEZONE()).startOf("day");
            const dayEnd = dayStart.add(1, "day");
            filter.startTime = {
                $gt: dayStart.toDate() > now ? dayStart.toDate() : now,
                $lt: dayEnd.toDate()
            };
        }

        if (requestQuery.practitioner) filter.practitioner = requestQuery.practitioner.trim();

        const slots = await slotRepository.all(filter, { startTime: 1, practitioner: 1 }, page, limit);

        return {
            data: slots,
            statusCode: StatusCodes.OK
        };

    } catch (e) {
        console.log("An unknown error has occurred. Please try again later" + e);
        return {
            error: e.message,
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR
        };
    }
};


exports.generateSlots = ({
    days = 14,
    from = new Date(),
    practitioners = DEFAULT_PRACTITIONERS,
    startHour = 9,
    endHour = 17,
    durationMinutes = SLOT_DURATION_MINUTES,
    tz = CLINIC_TIMEZONE()
} = {}) => {
    const slots = [];
    const firstDay = dayjs(from).tz(tz).startOf("day");

    for (let d = 0; d < days; d++) {
        const day = firstDay.add(d, "day");
        if (day.day() === 0 || day.day() === 6) continue;

        let cursor = day.hour(startHour);
        const close = day.hour(endHour);

        while (cursor.add(durationMinutes, "minute").valueOf() <= close.valueOf()) {
            const end = cursor.add(durationMinutes, "minute");
            if (cursor.valueOf() > Date.now()) {
                for (const practitioner of practitioners) {
                    slots.push({ practitioner, startTime: cursor.toDate(), endTime: end.toDate() });
                }
            }
            cursor = end;
        }
    }

    return slots;
};

exports.seedSlots = async (options = {}) => {
    const slots = exports.generateSlots(options);
    const inserted = await slotRepository.bulkInsertMissing(slots);

    return { generated: slots.length, inserted };
};


exports.resetSlots = async (slotsInput) => {
    try {
        let rawSlots = slotsInput;
        if (rawSlots && !Array.isArray(rawSlots) && Array.isArray(rawSlots.slots)) {
            rawSlots = rawSlots.slots;
        }

        if (rawSlots === undefined || rawSlots === null) {
            rawSlots = [];
        }

        if (!Array.isArray(rawSlots)) {
            return {
                error: "Invalid input. Expected an array of slots or an object with a slots array",
                statusCode: StatusCodes.BAD_REQUEST
            };
        }

        const preparedSlots = [];
        const seen = new Set();

        for (let i = 0; i < rawSlots.length; i++) {
            const item = rawSlots[i];
            if (!item || typeof item !== "object") {
                return {
                    error: `Slot at index ${i} is invalid`,
                    statusCode: StatusCodes.BAD_REQUEST
                };
            }

            const startTimeRaw = item.startTime || item.start_time || item.start;
            if (!startTimeRaw) {
                return {
                    error: `Slot at index ${i} is missing startTime`,
                    statusCode: StatusCodes.BAD_REQUEST
                };
            }

            const parsedStart = new Date(startTimeRaw);
            if (isNaN(parsedStart.getTime())) {
                return {
                    error: `Slot at index ${i} has an invalid startTime`,
                    statusCode: StatusCodes.BAD_REQUEST
                };
            }

            const endTimeRaw = item.endTime || item.end_time || item.end;
            let parsedEnd = endTimeRaw ? new Date(endTimeRaw) : null;
            if (!parsedEnd || isNaN(parsedEnd.getTime())) {
                parsedEnd = new Date(parsedStart.getTime() + SLOT_DURATION_MINUTES * 60 * 1000);
            }

            const practitioner = (item.practitioner || item.doctor || item.practitionerName || "Dr. Practitioner").trim();
            const status = item.status || SLOT_STATUS.AVAILABLE;

            const dedupeKey = `${practitioner}:${parsedStart.getTime()}`;
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);

            const slotDoc = {
                practitioner,
                startTime: parsedStart,
                endTime: parsedEnd,
                status,
                booking: null
            };

            const rawId = item.id || item._id || item.slotId || item.slot_id;
            if (rawId && mongoose.isValidObjectId(rawId)) {
                slotDoc._id = new mongoose.Types.ObjectId(rawId);
            }

            preparedSlots.push(slotDoc);
        }

        await bookingRepository.deleteMany({});

        await slotRepository.deleteMany({});

        await idempotencyKeyRepository.deleteMany({});

        let inserted = [];
        if (preparedSlots.length > 0) {
            inserted = await slotRepository.massInsert(preparedSlots);
        }

        return {
            data: {
                message: "Slots reset successfully",
                count: inserted.length,
                slots: inserted
            },
            statusCode: StatusCodes.OK
        };
    } catch (e) {
        console.log("Oops unknown error has occurred while trying to reset slots " + e);
        return {
            error: e.message,
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR
        };
    }
};

