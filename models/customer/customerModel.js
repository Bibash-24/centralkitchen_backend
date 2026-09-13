const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: false,
        sparse: true
    },
    visits: {
        type: Number,
        default: 0
    },
    spent: {
        type: Number,
        default: 0
    },
    points: {
        type: Number,
        default: 0
    },
    pointsRedeemed: {
        type: Number,
        default: 0
    },
    pointsHistory: [
        {
            type: { type: String, enum: ["earned", "redeemed"], required: true },
            points: { type: Number, required: true },
            amount: { type: Number },
            orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
            orderNo: { type: String },
            timestamp: { type: Date, default: Date.now }
        }
    ],
    isDeleted: {
        type: Boolean,
        default: false
    },
    createdBy: {
        type: String,
        required: false
    },
    createdOn: {
        type: Date,
        default: Date.now
    },
    updatedBy: {
        type: String,
        required: false
    },
    updatedOn: {
        type: Date,
        required: false
    },
    deletedBy: {
        type: String,
        required: false
    },
    deletedOn: {
        type: Date,
        required: false
    }
}, { timestamps: true });

module.exports = mongoose.model("Customer", customerSchema);
