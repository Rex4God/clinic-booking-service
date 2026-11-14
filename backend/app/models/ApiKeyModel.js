"use strict";
const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate");
const dayjs = require("dayjs");
const { API_KEY_STATUS } = require("../utils/constants");


const schema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true,
        default: ""
    },
    keyPrefix: {
        type: String,
        required: true
    },
    keyHash: {
        type: String,
        required: true,
        unique: true
    },
    status: {
        type: String,
        enum: [API_KEY_STATUS.ACTIVE, API_KEY_STATUS.REVOKED],
        default: API_KEY_STATUS.ACTIVE,
        required: true
    },
    expiresAt: {
        type: Date,
        default: null
    },
    lastUsedAt: {
        type: Date,
        default: null
    },
    revokedAt: {
        type: Date,
        default: null
    }
}, {
    toJSON: {
        transform: function (doc, ret) {
            ret.id = ret._id.toString();
            ret.createdAt = dayjs(ret.createdAt).unix();
            ret.updatedAt = dayjs(ret.updatedAt).unix();
            delete ret.keyHash;
            delete ret.__v;
            delete ret._id;
        }
    },
    timestamps: true
});

schema.index({ status: 1, keyHash: 1 });

schema.plugin(mongoosePaginate);
module.exports = mongoose.model("ApiKey", schema);

