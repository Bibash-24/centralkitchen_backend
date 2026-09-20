const mongoose = require("mongoose");

const globalModuleConfigSchema = new mongoose.Schema({
    key: {
        type: String,
        default: "global_modules_config",
        unique: true
    },
    enabledModules: {
        type: [String],
        default: [
            "home", "deliveries", "sales", "expenses", "accounts", 
            "inventory", "creditors", "vendors", "staff", "menuSetup", 
            "settings", "reports", "support"
        ]
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
    updatedBy: {
        type: String,
        default: "System"
    }
}, { timestamps: true });

module.exports = mongoose.model("GlobalModuleConfig", globalModuleConfigSchema);
