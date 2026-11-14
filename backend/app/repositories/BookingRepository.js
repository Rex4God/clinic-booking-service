"use strict";
const Model = require("../models/BookingModel");
const Repository = require("./MongoDBRepository");

class BookingRepository extends Repository{
    constructor(){
        super(Model);
    }
}
module.exports = (new BookingRepository());

