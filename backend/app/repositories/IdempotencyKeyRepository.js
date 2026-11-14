"use strict";
const Model = require("../models/IdempotencyKeyModel");
const Repository = require("./MongoDBRepository");

class IdempotencyKeyRepository extends Repository{
    constructor(){
        super(Model);
    }
}
module.exports = (new IdempotencyKeyRepository());

