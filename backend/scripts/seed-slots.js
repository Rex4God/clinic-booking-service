"use strict";

require("dotenv").config();
const mongoose = require("mongoose");
const { seedSlots } = require("../app/services/SlotService");

const days = parseInt(process.argv[2]) || parseInt(process.env.SEED_SLOTS_DAYS) || 14;
const mongodbUrl = `${(process.env.MONGODB_URL || "").trim()}/${process.env.DATABASE_NAME}?retryWrites=true`;

(async () => {
    try {
        await mongoose.connect(mongodbUrl);

        await Promise.all(Object.values(mongoose.models).map(model => model.init()));

        const result = await seedSlots({ days });
        console.log(`Seeded slots for the next ${days} days`, result);
    } catch (e) {
        console.error("Slot seeding failed", e);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
})();

