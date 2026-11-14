"use strict";
const home = require("./home");
const apiKeyAuth = require("../app/middlewares/apiKeyAuth");

module.exports = (app) => {
    app.use("/", home);

    app.use("/v1/api-keys", require("./apiKeys"));
    app.use("/v1/slots", apiKeyAuth, require("./slots"));
    app.use("/v1/bookings", apiKeyAuth, require("./bookings"));
    app.post("/v1/reset", apiKeyAuth, require("../app/controllers/SlotController").resetSlots);
    app.post("/reset", require("../app/controllers/SlotController").resetSlots);
};
