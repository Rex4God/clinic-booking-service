"use strict";
const { StatusCodes } = require("http-status-codes");
require("dotenv")
    .config({});


global.isProduction = process.env.NODE_ENV === "production";
global.isDevelopment = process.env.NODE_ENV === "development";
global.isStaging = process.env.NODE_ENV === "staging";


let express = require("express");
require("express-async-errors");
let app = express();
require("./lib")(app, express);




//routes
require("./routes")(app);



app.use((req, res) => {
    return res.status(StatusCodes.NOT_FOUND)
        .json({ error: `Route ${req.method} ${req.path} not found` });
});

app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;

    if (status < StatusCodes.INTERNAL_SERVER_ERROR)
        return res.status(status).json({ error: err.type === "entity.parse.failed" ? "Malformed JSON body" : err.message });

    console.log("Error", err);
    res.status(status)
        .json({ error: global.isProduction ? "An unknown error has occurred. Please try again later" : err.message });
});

module.exports = app;
