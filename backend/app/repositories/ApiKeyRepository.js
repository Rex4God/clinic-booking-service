"use strict";
const Model = require("../models/ApiKeyModel");
const Repository = require("./MongoDBRepository");

class ApiKeyRepository extends Repository {
    constructor() {
        super(Model);
    }
}
module.exports = (new ApiKeyRepository());

