const RolePermission = require("../models/superadmin/rolePermissionModel");

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

const seedSuperadminPermissions = async () => {
    try {
        // Seed Superadmin role in rolepermissions collection for global scope
        await RolePermission.findOneAndUpdate(
            { companySlug: "global", role: "Superadmin" },
            {
                $set: {
                    companySlug: "global",
                    role: "Superadmin",
                    allowedMenus: allModules,
                    allowedSubMenus: allSubMenus,
                    updatedBy: "System Seed",
                    isDeleted: false
                }
            },
            { upsert: true, returnDocument: "after" }
        );

        console.log("Superadmin global permissions seeded successfully.");
    } catch (error) {
        console.error("Error seeding Superadmin role permissions: ", error.message);
    }
};

module.exports = seedSuperadminPermissions;