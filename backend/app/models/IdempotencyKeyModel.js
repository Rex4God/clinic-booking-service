"use strict";
const mongoose = require("mongoose");
const {IDEMPOTENCY_STATUS, IDEMPOTENCY_TTL_SECONDS} = require("../utils/constants");


const schema = new mongoose.Schema({
          // Scoped key: `${apiKeyFingerprint}:${Idempotency-Key header}`
          key: {
            type: String,
            unique: true,
            required: true
          },
          // Hash of the request body, so a key reused with a different payload is rejected
          requestHash: {
            type: String,
            required: true
          },
          status: {
            type: String,
            enum: [IDEMPOTENCY_STATUS.PROCESSING, IDEMPOTENCY_STATUS.COMPLETED],
            default: IDEMPOTENCY_STATUS.PROCESSING
          },
          responseStatusCode: Number,
          responseBody: mongoose.Schema.Types.Mixed,
          // When the current request started processing; a stale lock (crashed request) can be taken over
          lockedAt: {
            type: Date,
            default: Date.now
          },
          createdAt: {
            type: Date,
            default: Date.now,
            // MongoDB TTL monitor removes the record after this many seconds
            expires: IDEMPOTENCY_TTL_SECONDS
          }
        });

module.exports = mongoose.model("IdempotencyKey", schema);
