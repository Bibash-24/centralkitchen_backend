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
    enabledModules: {
        type: [String],
        default: ["home", "deliveries", "sales", "expenses", "accounts", "inventory", "creditors", "vendors", "staff", "menuSetup", "settings", "reports", "support"]
    },
    enabledSubMenus: {
        type: [String],
        default: [
            "home-boh", "home-date-filter", "home-popular-dishes", "home-revenue-breakdown", 
            "home-payment-mix", "home-expense-trend", "home-expense-breakdown", "home-creditors-ledger",
            "items", "categories",
            "details", "ratios", "users", "superuser", "permissions",
            "list", "credit-setup",
            "inventory-list", "inventory-setup",
            "vendors-directory", "cheque-setup",
            "staff-list", "staff-attendance", "staff-payroll",
            "sales-revenue", "financial-payments", "stock-inventory", "expenses-costs", "profitability",
            "support-guide", "issues"
        ]
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
        openingTime: {
        type: String,
        default: "08:00 AM"
    },
    closingTime: {
        type: String,
        default: "09:00 PM"
    },
    yearlyFee: {
        type: Number,
        default: 25000
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
