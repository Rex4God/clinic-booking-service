"use strict";
const express = require("express");
const router = express.Router();
const controller = require("../app/controllers/ApiKeyController");
const apiKeyAuth = require("../app/middlewares/apiKeyAuth");


/**
 * @swagger
 * components:
 *   schemas:
 *     ApiKey:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *           example: Koya Patient Portal
 *         description:
 *           type: string
 *           example: Frontend web application
 *         keyPrefix:
 *           type: string
 *           example: koya_live_9f8e7d6c...
 *         status:
 *           type: string
 *           enum: [Active, Revoked]
 *         expiresAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         lastUsedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         revokedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         createdAt:
 *           type: integer
 *         updatedAt:
 *           type: integer
 */

// // GENERATE API KEY
// /**
//  * @swagger
//  * /v1/api-keys:
//  *   post:
//  *     summary: Generate a new API key for an application
//  *     description: >
//  *       Generates a new cryptographically secure API key (`koya_live_...`) for an external or internal application.
//  *       The plaintext `apiKey` is returned ONLY once in this response — copy it and pass it in the `x-api-key` header.
//  *     security: []
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             required: [name]
//  *             properties:
//  *               name:
//  *                 type: string
//  *                 example: Koya Frontend Web App
//  *               description:
//  *                 type: string
//  *                 example: Web client for patient appointment booking
//  *               expiresInDays:
//  *                 type: integer
//  *                 example: 365
//  *     responses:
//  *       '201':
//  *         description: API key generated successfully
//  *       '400':
//  *         description: Invalid request body
//  */
router.post("/", controller.createApiKey);
// router.post("/generate", controller.createApiKey);

// // LIST API KEYS
// /**
//  * @swagger
//  * /v1/api-keys:
//  *   get:
//  *     summary: List registered API keys
//  *     description: Returns metadata for all generated API keys (key prefix, status, lastUsedAt). Never exposes the raw secret.
//  *     security:
//  *       - ApiKeyAuth: []
//  *     parameters:
//  *       - name: status
//  *         in: query
//  *         schema:
//  *           type: string
//  *           enum: [Active, Revoked]
//  *       - name: page
//  *         in: query
//  *         schema:
//  *           type: integer
//  *           default: 1
//  *       - name: limit
//  *         in: query
//  *         schema:
//  *           type: integer
//  *           default: 10
//  *     responses:
//  *       '200':
//  *         description: Paginated list of API keys
//  *       '401':
//  *         description: Missing or invalid API key
//  */
// router.get("/", apiKeyAuth, controller.fetchApiKeys);

// REVOKE API KEY
/**
 * @swagger
 * /v1/api-keys/{id}/revoke:
 *   patch:
 *     summary: Revoke an API key
 *     description: Immediately revokes an API key so it can no longer access the booking API.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: API key revoked
 *       '401':
 *         description: Missing or invalid API key
 *       '404':
 *         description: API key not found
 *       '409':
 *         description: API key already revoked
 */
router.patch("/:keyId/revoke", apiKeyAuth, controller.revokeApiKey);
router.delete("/:keyId", apiKeyAuth, controller.revokeApiKey);


module.exports = router;

