"use strict";
const helmet = require("helmet");
const logger = require("morgan");
const cors = require("cors");
const { globalLimiter } = require("../app/middlewares/rateLimiters");

//Swagger 
const swaggerUi = require("swagger-ui-express");
const specs = require("../swagger");


const trustProxy = () => {
    const value = process.env.TRUST_PROXY;
    if (value === undefined || value === "") return 1;
    if (value === "false") return false;
    return isNaN(parseInt(value)) ? value : parseInt(value);
};

const corsOptions = () => {
    const origins = (process.env.CORS_ORIGINS || "").split(",").map(o => o.trim()).filter(Boolean);
    return {
        origin: origins.length ? origins : true,
        exposedHeaders: ["RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset", "Retry-After", "Idempotent-Replayed"],
    };
};

module.exports = (app, express) => {
    app.set("trust proxy", trustProxy());
    app.use(helmet());
    app.use(cors(corsOptions()));
    if (process.env.NODE_ENV !== "test") app.use(logger("dev"));
    app.use(express.json({ limit: "10kb" }));
    app.use(express.urlencoded({ extended: false, limit: "10kb" }));
    app.use(globalLimiter);

    // SWAGGER UI
    app.use('/clinic/api-docs', swaggerUi.serve, swaggerUi.setup(specs))

};
