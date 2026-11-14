"use strict";
const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate");
const dayjs = require("dayjs");
const { BOOKING_STATUS } = require("../utils/constants");


const schema = new mongoose.Schema({
  reference: {
    type: String,
    unique: true,
    required: true
  },
  slot: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Slot",
    required: true
  },
  patientName: {
    type: String,
    required: true,
    trim: true
  },
  patientEmail: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  patientPhone: {
    type: String,
    trim: true
  },
  reason: {
    type: String,
    trim: true
  },
  // Denormalised from the slot so a patient's bookings can be listed/sorted without a join
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    required: true
  },
  practitioner: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.CANCELLED],
    default: BOOKING_STATUS.CONFIRMED,
    required: true
  },
  cancelledAt: {
    type: Date,
    default: null
  }
}, {
  toJSON: {
    transform: function (doc, ret) {
      ret.id = ret._id.toString();
      ret.slotId = ret.slot && ret.slot.toString();
      ret.createdAt = dayjs(ret.createdAt)
        .unix();
      ret.updatedAt = dayjs(ret.updatedAt)
        .unix();
      delete ret.slot;
      delete ret.__v;
      delete ret._id;
    }
  },
  timestamps: true
});


schema.index(
  { slot: 1 },
  { unique: true, partialFilterExpression: { status: BOOKING_STATUS.CONFIRMED } }
);
schema.index(
  { patientEmail: 1, startTime: 1 },
  { unique: true, partialFilterExpression: { status: BOOKING_STATUS.CONFIRMED } }
);
schema.index({ patientEmail: 1, startTime: -1 });

schema.plugin(mongoosePaginate);
module.exports = mongoose.model("Booking", schema);

