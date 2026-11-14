"use strict";
const express = require("express");
const router = express.Router();
const controller = require("../app/controllers/SlotController");


// LIST AVAILABLE SLOTS
/**
 * @swagger
 * /v1/slots:
 *   get:
 *     summary: List available appointment slots
 *     description: Returns upcoming slots that are still available, earliest first.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: date
 *         in: query
 *         description: Only slots on this day (clinic timezone), format YYYY-MM-DD
 *         schema:
 *           type: string
 *       - name: practitioner
 *         in: query
 *         schema:
 *           type: string
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           default: 1
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Paginated list of available slots
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       practitioner:
 *                         type: string
 *                       startTime:
 *                         type: string
 *                         format: date-time
 *                       endTime:
 *                         type: string
 *                         format: date-time
 *                       status:
 *                         type: string
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 pages:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *       401:
 *         description: Missing or invalid API key
 *       422:
 *         description: Invalid query parameters
 */
router.get("/", controller.fetchAvailableSlots);

// RESET SLOTS
/**
 * @swagger
 * /v1/slots/reset:
 *   post:
 *     summary: Reset slots and delete all bookings
 *     description: Deletes every booking and replaces all slots with the ones you send, including slots in the past.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *               properties:
 *                 practitioner:
 *                   type: string
 *                 startTime:
 *                   type: string
 *                   format: date-time
 *                 endTime:
 *                   type: string
 *                   format: date-time
 *     responses:
 *       200:
 *         description: Slots reset successfully
 *       400:
 *         description: Invalid slot input
 */
router.post("/reset", controller.resetSlots);
router.post("/", controller.resetSlots);
router.put("/", controller.resetSlots);

module.exports = router;

