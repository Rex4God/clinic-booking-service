"use strict";
const express = require("express");
const router = express.Router();
const controller = require("../app/controllers/BookingController");
const idempotency = require("../app/middlewares/idempotency");
const { bookingClientLimiter, bookingPatientLimiter } = require("../app/middlewares/rateLimiters");


/**
 * @swagger
 * components:
 *   schemas:
 *     Booking:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         reference:
 *           type: string
 *           example: BK-7KQ2M9XA
 *         slotId:
 *           type: string
 *         patientName:
 *           type: string
 *         patientEmail:
 *           type: string
 *         patientPhone:
 *           type: string
 *         reason:
 *           type: string
 *         practitioner:
 *           type: string
 *         startTime:
 *           type: string
 *           format: date-time
 *         endTime:
 *           type: string
 *           format: date-time
 *         status:
 *           type: string
 *           enum: [Confirmed, Cancelled]
 *         cancelledAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         createdAt:
 *           type: integer
 *         updatedAt:
 *           type: integer
 *     Error:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 */

// CREATE BOOKING
/**
 * @swagger
 * /v1/bookings:
 *   post:
 *     summary: Book an appointment slot
 *     description: >
 *       Books a slot for a patient. Only one booking can ever hold a slot, even under concurrent requests.
 *       Send a unique Idempotency-Key per booking attempt; retries with the same key return the original
 *       response instead of creating a duplicate booking.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: Idempotency-Key
 *         in: header
 *         required: false
 *         description: Optional unique key for this booking attempt (e.g. a UUID). Reuse it when retrying.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [slotId, patientName, patientEmail]
 *             properties:
 *               slotId:
 *                 type: string
 *               patientName:
 *                 type: string
 *               patientEmail:
 *                 type: string
 *               patientPhone:
 *                 type: string
 *               reason:
 *                 type: string
 *     responses:
 *       '201':
 *         description: Booking confirmed
 *       '400':
 *         description: Missing/invalid booking details, slot already started, or malformed Idempotency-Key
 *       '401':
 *         description: Missing or invalid API key
 *       '404':
 *         description: Slot not found
 *       '409':
 *         description: Slot already booked, patient booking limit reached, or same key still processing
 *       '422':
 *         description: Idempotency-Key reused with a different payload
 *       '429':
 *         description: Too many booking attempts
 */
router.post("/", bookingClientLimiter, bookingPatientLimiter, idempotency, controller.createBooking);

// LIST A PATIENT'S BOOKINGS
/**
 * @swagger
 * /v1/bookings:
 *   get:
 *     summary: Page through a patient's bookings
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: email
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [Confirmed, Cancelled]
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           default: 1
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Paginated list of bookings (data, total, page, pages, limit)
 *       422:
 *         description: Invalid query parameters
 */
router.get("/", controller.fetchPatientBookings);

// GET BOOKING BY REFERENCE
/**
 * @swagger
 * /v1/bookings/{reference}:
 *   get:
 *     summary: Look up a booking by its reference
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: reference
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The booking
 *       404:
 *         description: Booking not found
 */
router.get("/:reference", controller.resolveBooking);

// CANCEL BOOKING
/**
 * @swagger
 * /v1/bookings/{reference}/cancel:
 *   patch:
 *     summary: Cancel a booking and release its slot
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: reference
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Booking cancelled
 *       404:
 *         description: Booking not found
 *       409:
 *         description: Booking already cancelled or appointment already started
 */
router.patch("/:reference/cancel", controller.cancelBooking);


module.exports = router;

