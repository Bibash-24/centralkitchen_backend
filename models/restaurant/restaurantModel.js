const mongoose = require("mongoose");

const restaurantConfigSchema = new mongoose.Schema({
    companySlug: {
        type: String,
        required: false,
        lowercase: true,
        trim: true,
        index: true
    },
    name: {
        type: String,
        default: ""
    },
    contactNumbers: {
        type: [String],
        default: []
    },
    address: {
        type: String,
        default: ""
    },
    panNumber: {
        type: String,
        default: ""
    },
    enableCommodityRatio: { type: Boolean, default: true },
    defaultCurrency: {
        type: String,
        default: "रु"
    },
    isVatApplicable: {
        type: Boolean,
        default: true
    },
    vatPercentage: {
        type: Number,
        default: 13
    },
    wifiPrinterIp: {
        type: String,
        default: ""
    },
    wifiPrinterPort: {
        type: Number,
        default: ""
    },
    thermalPaperWidth: {
        type: Number,
        default: "" // 48 for 80mm, 32 for 58mm
    },
    creditEnabled: { type: Boolean },
    creditMaxLimit: { type: Number },
    creditGracePeriod: { type: Number },
    creditAlertThreshold: { type: Number },
    creditOverdueNotificationEnabled: { type: Boolean },
    creditOverdueDays: { type: Number },
    creditOverdueNotifyRoles: { type: [String] },
    creditWaiverEnabled: { type: Boolean },
    creditWaiverRoles: { type: [String] },
    lowStockAlertEnabled: { type: Boolean },
    lowStockNotificationEnabled: { type: Boolean },
    lowStockNotifyRoles: { type: [String] },
    lowStockReminderPercentage: { type: Number },
    lowStockAlertPercentage: { type: Number },
    chequeNotificationEnabled: { type: Boolean },
    chequeNotifyRoles: { type: [String] },
    chequeDueDaysNotify: { type: Number },
    // Delivery & Dispatch Configuration
    deliveryNotificationEnabled: { type: Boolean, default: true },
    notifyRoles: { type: [String], default: [] },
    deliveryNotifyRoles: { type: [String], default: [] },
    notifyUsers: { type: [String], default: [] },
    deliveryAssignEnabled: { type: Boolean, default: true },
    assignRoles: { type: [String], default: [] },
    assignUsers: { type: [String], default: [] },
    deliveryTrackEnabled: { type: Boolean, default: true },
    trackRoles: { type: [String], default: [] },
    trackUsers: { type: [String], default: [] },
    deliveryRescheduleEnabled: { type: Boolean, default: true },
    rescheduleRoles: { type: [String], default: [] },
    rescheduleUsers: { type: [String], default: [] },
    deliveryApproveEnabled: { type: Boolean, default: true },
    approveRejectRoles: { type: [String], default: [] },
    approveRejectUsers: { type: [String], default: [] },
    deliveryCancelEnabled: { type: Boolean, default: true },
    cancelRoles: { type: [String], default: [] },
    cancelUsers: { type: [String], default: [] },
    deliveryReturnEnabled: { type: Boolean, default: true },
    returnRoles: { type: [String], default: [] },
    returnUsers: { type: [String], default: [] },
    deliveryRefundEnabled: { type: Boolean, default: true },
    refundRoles: { type: [String], default: [] },
    refundUsers: { type: [String], default: [] },
    logo: {
        type: String, // Base64 formatted logo image string
        default: ""
    },
    paymentQrCode: {
        type: String, // Base64 formatted payment QR code image string
        default: ""
    },
        hasOperatingHours: {
        type: Boolean,
        default: false
    },
    openingTime: {
        type: String,
        default: "08:00 AM"
    },
    closingTime: {
        type: String,
        default: "09:00 PM"
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

module.exports = mongoose.model("RestaurantConfig", restaurantConfigSchema);
