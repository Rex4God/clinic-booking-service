"use strict";
const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate");
const dayjs = require("dayjs");
const { SLOT_STATUS } = require("../utils/constants");


const schema = new mongoose.Schema({
  practitioner: {
    type: String,
    required: true,
    trim: true
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: [SLOT_STATUS.AVAILABLE, SLOT_STATUS.BOOKED],
    default: SLOT_STATUS.AVAILABLE,
    required: true
  },
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Booking",
    default: null
  }
}, {
  toJSON: {
    transform: function (doc, ret) {
      ret.id = ret._id.toString();
      ret.createdAt = dayjs(ret.createdAt)
        .unix();
      ret.updatedAt = dayjs(ret.updatedAt)
        .unix();
      delete ret.booking;
      delete ret.__v;
      delete ret._id;
    }
  },
  timestamps: true
});

// A practitioner can only have one slot starting at a given time
schema.index({ practitioner: 1, startTime: 1 }, { unique: true });
// Supports "list available upcoming slots"
schema.index({ status: 1, startTime: 1 });

schema.plugin(mongoosePaginate);
module.exports = mongoose.model("Slot", schema);

