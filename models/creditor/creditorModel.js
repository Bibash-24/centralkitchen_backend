const mongoose = require("mongoose");

const creditorSchema = new mongoose.Schema({
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
        default: ""
    },
    address: {
        type: String,
        required: true
    },
    creditLimit: {
        type: Number,
        default: 5000
    },
    currentBalance: {
        type: Number,
        default: 0
    },
    isBlacklisted: {
        type: Boolean,
        default: false
    },
    blacklistReason: {
        type: String,
        default: ""
    },
    creditHistory: [
        {
            type: { type: String, enum: ["credit", "payment", "waiver"], required: true },
            amount: { type: Number, required: true },
            orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
            orderNo: { type: String },
            note: { type: String, default: "" },
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

module.exports = mongoose.model("Creditor", creditorSchema);
