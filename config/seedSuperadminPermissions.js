const RolePermission = require("../models/superadmin/rolePermissionModel");
const RestaurantConfig = require("../models/restaurant/restaurantModel");
const Company = require("../models/company/companyModel");

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
        // 1. Seed EXCLUSIVELY Superadmin in rolepermissions collection
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
            { upsert: true, returnDocument: 'after' }
        );

        // 2. Remove any non-Superadmin entries from rolepermissions collection
        await RolePermission.deleteMany({
            role: { $nin: ["Superadmin", "superadmin", "SuperAdmin"] }
        });

        // 3. Enable all system modules & submenus in global RestaurantConfig
        await RestaurantConfig.updateMany(
            {},
            {
                $set: {
                    enabledModules: allModules,
                    enabledSubMenus: allSubMenus,
                    updatedBy: "System Seed"
                }
            }
        );

        // 4. Enable all system modules & submenus in incorporated Companies
        await Company.updateMany(
            {},
            {
                $set: {
                    enabledModules: allModules,
                    enabledSubMenus: allSubMenus
                }
            }
        );

        console.log("Superadmin permissions seeded strictly in rolepermissions. Non-Superadmin roles cleared from rolepermissions table.");
    } catch (error) {
        console.error("Error seeding Superadmin role permissions:", error.message);
    }
};

module.exports = seedSuperadminPermissions;
