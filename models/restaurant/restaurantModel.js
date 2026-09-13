const mongoose = require("mongoose");

const restaurantConfigSchema = new mongoose.Schema({
    name: {
        type: String,
        default: "Chiya Town POS"
    },
    contactNumbers: {
        type: [String],
        default: ["+977 9812345678"]
    },
    address: {
        type: String,
        default: "Mid Baneshwor, Kathmandu, Nepal"
    },
    panNumber: {
        type: String,
        default: "609548231"
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
        default: 9100
    },
    thermalPaperWidth: {
        type: Number,
        default: 48 // 48 for 80mm, 32 for 58mm
    },
    enabledModules: {
        type: [String],
        default: ["home", "orders", "tables", "sales", "expenses", "accounts", "inventory", "customers", "creditors", "vendors", "menuSetup", "tableSetup", "inquiries", "settings"]
    },
    enabledSubMenus: {
        type: [String],
        default: [
            "home-foh", "home-boh", "home-date-filter", "home-popular-dishes", "home-revenue-breakdown", "home-payment-mix", "home-expense-trend", "home-expense-breakdown", "home-order-distribution", "home-creditors-ledger", "home-loyalty-lifecycle",
            "items", "categories", "combos", "qr", "timings",
            "areas", "tables",
            "details", "ratios", "users", "superuser", "permissions",
            "inventory-stock", "inventory-purchases", "inventory-vendors",
            "customers-list", "customers-loyalty",
            "creditors-list", "creditors-ledger",
            "vendors-list", "vendors-cheques",
            "inquiries-franchise", "inquiries-reservation", "inquiries-contact"
        ]
    },
    crmEnabled: {
        type: Boolean,
        default: false
    },
    crmPointsEarnRate: {
        type: Number,
        default: 100 // 100 Rs spent = 1 point
    },
    crmPointsRedeemRate: {
        type: Number,
        default: 1 // 1 point = 1 Rs when redeemed
    },
    creditEnabled: {
        type: Boolean,
        default: false
    },
    creditMaxLimit: {
        type: Number,
        default: 5000
    },
    creditGracePeriod: {
        type: Number,
        default: 30
    },
    creditAlertThreshold: {
        type: Number,
        default: 80
    },
    creditOverdueNotificationEnabled: {
        type: Boolean,
        default: false
    },
    creditOverdueDays: {
        type: Number,
        default: 20
    },
    creditOverdueNotifyRoles: {
        type: [String],
        default: ["Admin", "Cashier"]
    },
    creditWaiverEnabled: {
        type: Boolean,
        default: true
    },
    creditWaiverRoles: {
        type: [String],
        default: ["Admin"]
    },
    lowStockAlertEnabled: {
        type: Boolean,
        default: true
    },
    lowStockNotificationEnabled: {
        type: Boolean,
        default: false
    },
    lowStockNotifyRoles: {
        type: [String],
        default: ["Admin"]
    },
    lowStockReminderPercentage: {
        type: Number,
        default: 20
    },
    lowStockAlertPercentage: {
        type: Number,
        default: 30
    },
    chequeNotificationEnabled: {
        type: Boolean,
        default: true
    },
    chequeNotifyRoles: {
        type: [String],
        default: ["Admin", "Cashier"]
    },
    chequeDueDaysNotify: {
        type: Number,
        default: 2
    },
    logo: {
        type: String, // Base64 formatted logo image string
        default: ""
    },
    paymentQrCode: {
        type: String, // Base64 formatted payment QR code image string
        default: ""
    },
    slogan: {
        type: String,
        default: "Fresh flavors, delivered to your table"
    },
    openingTime: {
        type: String,
        default: "08:00 AM"
    },
    closingTime: {
        type: String,
        default: "09:00 PM"
    },
    primaryColor: {
        type: String,
        default: "#D9822B"
    },
    secondaryColor: {
        type: String,
        default: "#BD3E1D"
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
