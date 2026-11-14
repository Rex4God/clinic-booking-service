"use strict";
const response = require("../utils/responses");
const slotService = require("../services/SlotService");


exports.fetchAvailableSlots = async (req, res) => {
   const {
      error,
      data,
      statusCode
   } = await slotService.fetchAvailableSlots(req.query);

   if (error) return response.error(res, error, statusCode);

   return response.paginated(res, data, statusCode);
};

exports.resetSlots = async (req, res) => {
   const {
      error,
      data,
      statusCode
   } = await slotService.resetSlots(req.body);

   if (error) return response.error(res, error, statusCode);

   return response.success(res, data, statusCode);
};

