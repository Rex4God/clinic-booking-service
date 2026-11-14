"use strict";
const response = require("../utils/responses");
const bookingService = require("../services/BookingService");


exports.createBooking = async(req, res)=>{
     const{
        error,
        data,
        statusCode
        } = await bookingService.createBooking(req.body);

        if(error) return response.error(res, error, statusCode);

        return response.success(res, data, statusCode);
};

exports.resolveBooking = async(req, res)=>{
     const{
        error,
        data,
        statusCode
        } = await bookingService.resolveBooking(req.params.reference);

        if(error) return response.error(res, error, statusCode);

        return response.success(res, data, statusCode);
};

exports.cancelBooking = async(req, res)=>{
     const{
        error,
        data,
        statusCode
        } = await bookingService.cancelBooking(req.params.reference);

        if(error) return response.error(res, error, statusCode);

        return response.success(res, data, statusCode);
};

exports.fetchPatientBookings = async(req, res)=>{
     const{
        error,
        data,
        statusCode
         } = await bookingService.fetchPatientBookings(req.query);

         if(error) return response.error(res, error, statusCode);

         return response.paginated(res, data, statusCode);
};

