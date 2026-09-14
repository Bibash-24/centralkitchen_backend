const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  companySlug: { type: String, default: "main-kitchen", required: true, index: true },
    type: {
        type: String,
        enum: ["credit", "cheque", "inventory"],
        required: true
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
        required: true
    },
    isRead: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Database Index Verification Optimization
notificationSchema.index({ type: 1, targetId: 1 });
notificationSchema.index({ isRead: 1 });
notificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
