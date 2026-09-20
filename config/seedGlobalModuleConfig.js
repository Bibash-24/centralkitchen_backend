const GlobalModuleConfig = require("../models/superadmin/globalModuleConfigModel");

const allModules = [
    "home", "deliveries", "sales", "expenses", "accounts", 
    "inventory", "creditors", "vendors", "staff", "menuSetup", 
    "settings", "reports", "support"
];

const allSubMenus = [
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
];

const seedGlobalModuleConfig = async () => {
    try {
        await GlobalModuleConfig.findOneAndUpdate(
            { key: "global_modules_config" },
            {
                $set: {
                    key: "global_modules_config",
                    enabledModules: allModules,
                    enabledSubMenus: allSubMenus,
                    updatedBy: "System Seed"
                }
            },
            { upsert: true, returnDocument: 'after' }
        );
        console.log("GlobalModuleConfig seeded successfully into dedicated collection!");
    } catch (error) {
        console.error("Error seeding GlobalModuleConfig:", error.message);
    }
};

module.exports = seedGlobalModuleConfig;
