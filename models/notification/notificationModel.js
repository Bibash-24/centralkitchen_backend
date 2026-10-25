const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
    companySlug: { type: String, required: true, index: true },
    type: {
        type: String,
        enum: ["credit", "cheque", "inventory", "dispatch", "order", "delivery"],
        required: true,
        index: true
    },
    event: {
        type: String,
        default: "OTHER",
        index: true
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    targetId: {
        type: String,
        required: true,
        index: true
    },
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
        default: null,
        index: true
    },
    orderNo: { type: String, default: "", index: true },
    doNumber: { type: String, default: "" },
    source: { type: String, default: "" },
    destination: { type: String, default: "" },
    branch: { type: String, default: "" },
    franchise: { type: String, default: "" },
    rider: {
        staffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff", default: null },
        name: { type: String, default: "" },
        phone: { type: String, default: "" }
    },
    createdByUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
        index: true
    },
    recipientUserIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }],
    allowedRoles: [{
        type: String
    }],
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    isRead: {
        type: Boolean,
        default: false
    },
    readBy: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        readAt: { type: Date, default: Date.now }
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Database Index Verification Optimization
notificationSchema.index({ type: 1, targetId: 1 });
notificationSchema.index({ companySlug: 1, createdAt: -1 });
notificationSchema.index({ isRead: 1 });
notificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
