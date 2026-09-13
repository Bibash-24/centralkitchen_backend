const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
    customerDetails: {
        guests: { type: Number, required: true },
    },
    orderStatus: {
        type: String,
        required: true
    },
    orderDate: {
        type: Date,
        default: Date.now()
    },
    bills: {
        total: { type: Number, required: true },
        discount: { type: Number, default: 0 },
        tax: { type: Number, required: true },
        totalWithTax: { type: Number, required: true },
        receivedAmount: { type: Number, default: 0 },
        cabinCharge: { type: Number, default: 0 }
    },
    items: [],
    orderType: {
        type: String,
        enum: ["Dine In", "Takeaway"],
        default: "Dine In"
    },
    table: { type: mongoose.Schema.Types.ObjectId, ref: "TableDetails" },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
    creditor: { type: mongoose.Schema.Types.ObjectId, ref: "Creditor" },
    creditAmount: { type: Number, default: 0 },
    paymentMethod: String,
    paymentType: String,
    guestSessionId: String,
    remarks: { type: String, default: "" },
    redeemedPoints: { type: Number, default: 0 },
    redeemedPointsValue: { type: Number, default: 0 },
    timeline: [
        {
            action: { type: String, required: true },
            details: { type: String },
            timestamp: { type: Date, default: Date.now },
            user: { type: String }
        }
    ],
    cabinStartedAt: {
        type: Date,
        default: null
    },
    accumulatedCabinMinutes: {
        type: Number,
        default: 0
    },
    accumulatedCabinCharge: {
        type: Number,
        default: 0
    },
    orderNo: {
        type: Number,
        required: false
    }
}, { timestamps: true });

// Database Index Verification Optimization
orderSchema.index({ orderStatus: 1, createdAt: -1 });
orderSchema.index({ table: 1, orderStatus: 1 });
orderSchema.index({ customer: 1 });
orderSchema.index({ creditor: 1 });
orderSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Order", orderSchema);