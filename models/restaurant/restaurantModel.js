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
