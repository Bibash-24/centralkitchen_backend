const mongoose = require("mongoose");

const purchaseSchema = new mongoose.Schema({
    item: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Inventory",
        required: true
    },
    vendor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Vendor",
        required: false
    },
    quantity: {
        type: Number,
        required: true
    },
    unitCost: {
        type: Number,
        required: true
    },
    totalCost: {
        type: Number,
        required: true
    },
    paidAmount: {
        type: Number,
        default: 0
    },
    paymentStatus: {
        type: String,
        enum: ["Paid", "Pending", "Partial", "Credit"],
        default: "Paid"
    },
    paymentMethod: {
        type: String,
        default: "Cash"
    },
    purchaseDate: {
        type: Date,
        default: Date.now
    },
    chequeDate: {
        type: Date,
        required: false
    }
}, { timestamps: true });

// Database Index Verification Optimization
purchaseSchema.index({ purchaseDate: -1 });
purchaseSchema.index({ vendor: 1 });
purchaseSchema.index({ paymentMethod: 1 });
purchaseSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Purchase", purchaseSchema);
