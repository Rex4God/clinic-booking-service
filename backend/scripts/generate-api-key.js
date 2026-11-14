#!/usr/bin/env node
"use strict";
/**
 * Generates a new API key for an external or internal application and stores its SHA-256 hash in MongoDB.
 *
 *   npm run generate-key
 *   npm run generate-key -- "Partner Clinic Portal" "External integration"
 */
require("dotenv").config();
const mongoose = require("mongoose");
const apiKeyService = require("../app/services/ApiKeyService");

const name = process.argv[2] || "Default Application";
const description = process.argv[3] || "Generated via CLI";
const mongodbUrl = `${(process.env.MONGODB_URL || "").trim()}/${process.env.DATABASE_NAME}?retryWrites=true`;

(async () => {
    try {
        await mongoose.connect(mongodbUrl);
        await Promise.all(Object.values(mongoose.models).map(model => model.init()));

        const { error, data } = await apiKeyService.createApiKey({ name, description });
        if (error) {
            console.error("Failed to generate API key:", error);
            process.exitCode = 1;
            return;
        }

        console.log("\n========================================================");
        console.log("  NEW API KEY GENERATED");
        console.log("========================================================");
        console.log(`  App Name : ${data.details.name}`);
        console.log(`  Key ID   : ${data.details.id}`);
        console.log(`  Prefix   : ${data.details.keyPrefix}`);
        console.log(`  API Key  : ${data.apiKey}`);
        console.log("========================================================");
        console.log("  Pass this key in the 'x-api-key' request header.");
        console.log("  Save it now — the full key will not be shown again.\n");
    } catch (e) {
        console.error("Error generating API key:", e.message);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
})();

