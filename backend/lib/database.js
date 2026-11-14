"use strict";
const mongoose = require("mongoose");

if (process.env.NODE_ENV !== "test") {

    if (process.env.NODE_ENV == "development")
        mongoose.set("debug", true);

    const mongodbUrl = `${(process.env.MONGODB_URL || "").trim()}/${process.env.DATABASE_NAME}?retryWrites=true`;

    mongoose.connect(mongodbUrl, {
        // useNewUrlParser: true,
        // useCreateIndex: true,
        // useFindAndModify: false,
        // useUnifiedTopology: true
    });

    mongoose.Promise = global.Promise;
    let db = mongoose.connection;
    db.on("connected", async () => {
        console.log("DATABASE CONNECTED");

        if (process.env.SEED_SLOTS_ON_START === "true") {
            try {
                const { seedSlots } = require("../app/services/SlotService");
                const result = await seedSlots({ days: parseInt(process.env.SEED_SLOTS_DAYS) || 14 });
                console.log("SLOTS SEEDED", result);
            } catch (e) {
                console.log("Slot seeding failed " + e);
            }
        }
    });


    db.on("error", (error) => {
        console.error("An error occurred", JSON.stringify(error));
        console.log(error.message, new Error(error.message).stack, true);
        process.exit(1);
    });

    process.on("SIGINT", function () {
        db.close();
        console.log("DATABASE DISCONNECTED");
        process.exit(1);
    });

    global.db = db;
}
