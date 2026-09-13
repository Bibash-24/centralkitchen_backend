const RolePermission = require("../../models/superadmin/rolePermissionModel");
const User = require("../../models/user/userModel");
const createHttpError = require("http-errors");

// Fetch active role permissions (auto-seed if empty or missing new schema fields)
const getRolePermissions = async (req, res, next) => {
    try {
        let permissions = await RolePermission.find({ isDeleted: { $ne: true } });

        // Dynamically fetch all user roles currently assigned to users
        const assignedRoles = await User.distinct("role", {
            isDeleted: { $ne: true },
            role: { $exists: true, $ne: null, $ne: "" }
        });

        // Combine assigned roles with default system roles to verify (all lowercase for robustness)
        const allSystemRoles = Array.from(new Set([...assignedRoles, "Admin", "cashier", "waiter"].map(r => r.toLowerCase())));

        // Check if DB is empty
        const needsSeed = permissions.length === 0;

        if (needsSeed) {
            // If completely empty, seed defaults
            const defaults = [
                {
                    role: "Superadmin",
                    allowedMenus: ["home", "orders", "tables", "sales", "expenses", "accounts", "customers", "vendors", "creditors", "inventory", "menuSetup", "tableSetup", "inquiries", "settings", "reports"],
                    allowedSubMenus: ["items", "categories", "combos", "qr", "timings", "details", "ratios", "users", "superuser", "permissions", "areas", "tables", "inventory-list", "inventory-setup", "directory", "setup", "list", "credit-setup", "vendors-directory", "cheque-setup", "inquiries-franchise", "inquiries-reservation", "inquiries-contact", "home-foh", "home-boh", "home-date-filter", "home-popular-dishes", "home-revenue-breakdown", "home-payment-mix", "home-expense-trend", "home-expense-breakdown", "home-order-distribution", "home-creditors-ledger", "home-loyalty-lifecycle", "duplicateTable", "sales-revenue", "financial-payments", "stock-inventory", "expenses-costs", "profitability", "crm-loyalty"],
                    createdBy: "System",
                    createdOn: new Date(),
                    updatedBy: "System",
                    updatedOn: new Date()
                },
                {
                    role: "Admin",
                    allowedMenus: ["home", "orders", "tables", "sales", "expenses", "accounts", "customers", "vendors", "creditors", "inventory", "menuSetup", "tableSetup", "inquiries", "settings", "reports"],
                    allowedSubMenus: ["items", "categories", "combos", "qr", "timings", "details", "ratios", "users", "superuser", "permissions", "areas", "tables", "inventory-list", "inventory-setup", "directory", "setup", "list", "credit-setup", "vendors-directory", "cheque-setup", "inquiries-franchise", "inquiries-reservation", "inquiries-contact", "home-foh", "home-boh", "home-date-filter", "home-popular-dishes", "home-revenue-breakdown", "home-payment-mix", "home-expense-trend", "home-expense-breakdown", "home-order-distribution", "home-creditors-ledger", "home-loyalty-lifecycle", "duplicateTable", "sales-revenue", "financial-payments", "stock-inventory", "expenses-costs", "profitability", "crm-loyalty"],
                    createdBy: "System",
                    createdOn: new Date(),
                    updatedBy: "System",
                    updatedOn: new Date()
                },
                {
                    role: "cashier",
                    allowedMenus: ["home", "orders", "tables", "sales", "expenses", "accounts", "customers", "vendors", "creditors", "inventory", "menuSetup", "settings"],
                    allowedSubMenus: ["items", "categories", "combos", "qr", "timings", "details", "inventory-list", "directory", "list", "vendors-directory", "home-foh", "home-popular-dishes", "duplicateTable"],
                    createdBy: "System",
                    createdOn: new Date(),
                    updatedBy: "System",
                    updatedOn: new Date()
                },
                {
                    role: "waiter",
                    allowedMenus: ["home", "orders", "tables", "sales", "expenses", "accounts", "customers", "vendors", "creditors", "inventory", "menuSetup", "settings"],
                    allowedSubMenus: ["items", "categories", "combos", "qr", "timings", "details", "inventory-list", "directory", "list", "vendors-directory", "home-foh", "home-popular-dishes", "duplicateTable"],
                    createdBy: "System",
                    createdOn: new Date(),
                    updatedBy: "System",
                    updatedOn: new Date()
                }
            ];

            // Dynamically append any other roles currently assigned to users in the DB
            for (const userRole of assignedRoles) {
                const existsInDefaults = defaults.some(d => d.role.toLowerCase() === userRole.toLowerCase());
                if (!existsInDefaults) {
                    defaults.push({
                        role: userRole,
                        allowedMenus: ["home", "orders", "tables", "sales", "expenses", "accounts", "customers", "vendors", "creditors", "inventory", "menuSetup", "tableSetup", "settings"],
                        allowedSubMenus: ["items", "categories", "combos", "qr", "timings", "details", "inventory-list", "directory", "list", "vendors-directory", "home-foh", "home-popular-dishes"],
                        createdBy: "System",
                        createdOn: new Date(),
                        updatedBy: "System",
                        updatedOn: new Date()
                    });
                }
            }
            await RolePermission.insertMany(defaults);
            permissions = await RolePermission.find({ isDeleted: { $ne: true } });
        } else {
            // Check if any assigned user role is missing from permissions DB entirely
            let createdNew = false;
            for (const userRole of assignedRoles) {
                const exists = permissions.some(p => p.role.toLowerCase() === userRole.toLowerCase());
                if (!exists) {
                    const newPermission = new RolePermission({
                        role: userRole,
                        allowedMenus: ["home", "orders", "tables", "sales", "expenses", "accounts", "customers", "vendors", "creditors", "inventory", "menuSetup", "tableSetup", "settings"],
                        allowedSubMenus: ["items", "categories", "combos", "qr", "timings", "details", "inventory-list", "directory", "list", "vendors-directory", "home-foh", "home-popular-dishes"],
                        createdBy: "System",
                        createdOn: new Date()
                    });
                    await newPermission.save();
                    createdNew = true;
                }
            }
            if (createdNew) {
                permissions = await RolePermission.find({ isDeleted: { $ne: true } });
            }
        }



        res.status(200).json({
            success: true,
            message: "Role permissions retrieved successfully!",
            data: permissions
        });
    } catch (error) {
        next(error);
    }
};

// Update role permissions configurations (Superadmin can update all; Admin can only update below it)
const updateRolePermissions = async (req, res, next) => {
    try {
        const updates = req.body || {};
        const updaterRole = req.user.role;
        const updaterName = req.user.email || String(req.user.phone || req.user.role);

        // Enforce hierarchy check
        if (updaterRole && updaterRole.toLowerCase() === "admin") {
            const forbiddenKeys = Object.keys(updates).filter(roleKey => 
                roleKey.toLowerCase() === "admin" || roleKey.toLowerCase() === "superadmin"
            );
            if (forbiddenKeys.length > 0) {
                return next(createHttpError(403, "Forbidden. Admins can only change permissions for roles below them (cashier, waiter)."));
            }
        }

        for (const [role, config] of Object.entries(updates)) {
            if (config && (Array.isArray(config.allowedMenus) || Array.isArray(config.allowedSubMenus))) {
                let allowedMenus = config.allowedMenus || [];
                let allowedSubMenus = config.allowedSubMenus || [];

                // Fallback guarantee: Settings and Details tab must always be allowed
                if (!allowedMenus.includes("settings")) {
                    allowedMenus = ["settings", ...allowedMenus];
                }
                if (!allowedSubMenus.includes("details")) {
                    allowedSubMenus = ["details", ...allowedSubMenus];
                }

                let perm = await RolePermission.findOne({ 
                    role: { $regex: new RegExp(`^${role}$`, 'i') }, 
                    isDeleted: { $ne: true } 
                });
                if (!perm) {
                    perm = new RolePermission({ role, createdBy: updaterName, createdOn: new Date() });
                } else if (perm.isDeleted) {
                    perm.isDeleted = false;
                    perm.deletedBy = undefined;
                    perm.deletedOn = undefined;
                }
                perm.allowedMenus = allowedMenus;
                perm.allowedSubMenus = allowedSubMenus;
                perm.updatedBy = updaterName;
                perm.updatedOn = new Date();
                await perm.save();
            }
        }

        const permissions = await RolePermission.find({ isDeleted: { $ne: true } });

        res.status(200).json({
            success: true,
            message: "Role permissions updated successfully!",
            data: permissions
        });
    } catch (error) {
        next(error);
    }
};

const deleteRolePermission = async (req, res, next) => {
    try {
        const { role } = req.params;
        const updaterRole = req.user.role;

        // Enforce system roles cannot be deleted
        if (["superadmin", "admin", "cashier", "waiter"].includes(role.toLowerCase())) {
            const error = createHttpError(400, "System roles cannot be deleted!");
            return next(error);
        }

        // Enforce hierarchy check: Only Superadmin and Admin can delete roles
        const checkRole = (updaterRole || "").toLowerCase();
        if (checkRole !== "superadmin" && checkRole !== "admin") {
            const error = createHttpError(403, "Forbidden. Only Superadmin or Admin can delete roles.");
            return next(error);
        }

        const updaterName = req.user.email || String(req.user.phone || req.user.role);
        const deleted = await RolePermission.findOneAndUpdate(
            { role, isDeleted: { $ne: true } },
            {
                role: `${role}_deleted_${Date.now()}`,
                isDeleted: true,
                deletedBy: updaterName,
                deletedOn: new Date()
            },
            { new: true }
        );
        if (!deleted) {
            const error = createHttpError(404, "Role permission config not found.");
            return next(error);
        }

        res.status(200).json({
            success: true,
            message: `Role '${role}' deleted successfully.`
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { getRolePermissions, updateRolePermissions, deleteRolePermission };
