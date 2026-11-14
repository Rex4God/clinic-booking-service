"use strict";
const swaggerJsdoc = require("swagger-jsdoc");
const path = require("path");
require("dotenv").config();

const port = process.env.PORT || 9000;

const options = {
  swaggerDefinition: {
    openapi: "3.0.0",
    info: {
      title: "Clinic Booking API",
      version: "1.0.0",
      description: "Documentation for the Koya clinic appointment booking API. All /v1 endpoints require an `x-api-key` header.",
    },
    servers: [
      {
        url: process.env.PUBLIC_API_URL || `http://localhost:${port}`,
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
        },
      },
    },
    security: [{ApiKeyAuth: []}],
  },
  apis: [path.join(__dirname, "routes", "*.js")],
};

const specs = swaggerJsdoc(options);
module.exports = specs;
