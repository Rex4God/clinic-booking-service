"use strict";
const Model = require("../models/SlotModel");
const Repository = require("./MongoDBRepository");
const { SLOT_STATUS } = require("../utils/constants");

class SlotRepository extends Repository {
    constructor() {
        super(Model);
    }

    claim(slotId, bookingId, now = new Date()) {
        return this.findOneAndUpdate(
            { _id: slotId, status: SLOT_STATUS.AVAILABLE, startTime: { $gt: now } },
            { $set: { status: SLOT_STATUS.BOOKED, booking: bookingId } }
        );
    }

    release(slotId, bookingId) {
        return this.findOneAndUpdate(
            { _id: slotId, booking: bookingId },
            { $set: { status: SLOT_STATUS.AVAILABLE, booking: null } }
        );
    }

    async bulkInsertMissing(slots = []) {
        if (slots.length === 0) return 0;

        const result = await this.Model.bulkWrite(slots.map(slot => ({
            updateOne: {
                filter: { practitioner: slot.practitioner, startTime: slot.startTime },
                update: { $setOnInsert: { ...slot, status: SLOT_STATUS.AVAILABLE, booking: null } },
                upsert: true
            }
        })), { ordered: false });

        return result.upsertedCount || 0;
    }
}
module.exports = (new SlotRepository());
