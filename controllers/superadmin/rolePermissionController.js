const RolePermission = require("../../models/superadmin/rolePermissionModel");
const createHttpError = require("http-errors");

const defaultRolesList = [
    {
        role: "Admin",
        allowedMenus: ["home", "orders", "sales", "expenses", "accounts", "customers", "vendors", "creditors", "inventory", "menuSetup", "settings", "reports", "support"],
        allowedSubMenus: ["home-boh", "home-date-filter", "home-popular-dishes", "home-revenue-breakdown", "home-payment-mix", "home-expense-trend", "home-expense-breakdown", "home-creditors-ledger", "items", "categories", "details", "ratios", "users", "permissions", "sales-revenue", "financial-payments", "stock-inventory", "expenses-costs", "profitability", "support-guide", "issues"]
    }
];

const getRolePermissions = async (req, res, next) => {
    try {
        const querySlug = req.query.companySlug;
        const userSlug = req.user ? req.user.companySlug : null;
        const targetSlug = querySlug || (req.user && req.user.role !== "Superadmin" ? userSlug : "global") || "global";

        let permissions = await RolePermission.find({ companySlug: targetSlug, isDeleted: { $ne: true } });

        if (!permissions || permissions.length === 0) {
            let companyEnabledModules = null;
            let companyEnabledSubMenus = null;
            if (targetSlug !== "global") {
                const Company = require("../../models/company/companyModel");
                const compDoc = await Company.findOne({ companySlug: targetSlug, isDeleted: { $ne: true } });
                if (compDoc) {
                    companyEnabledModules = Array.isArray(compDoc.enabledModules) ? compDoc.enabledModules : [];
                    companyEnabledSubMenus = Array.isArray(compDoc.enabledSubMenus) ? compDoc.enabledSubMenus : [];
                }
            }

            const defaults = defaultRolesList.map(item => {
                let allowedMenus = item.allowedMenus;
                let allowedSubMenus = item.allowedSubMenus;

                if (targetSlug !== "global") {
                    allowedMenus = (companyEnabledModules || []).filter(m => m === "settings" || m === "support" || (companyEnabledModules && companyEnabledModules.includes(m)));
                    if (!allowedMenus.includes("settings")) allowedMenus.push("settings");
                    allowedSubMenus = (companyEnabledSubMenus || []).filter(s => s === "details" || (companyEnabledSubMenus && companyEnabledSubMenus.includes(s)));
                    if (!allowedSubMenus.includes("details")) allowedSubMenus.push("details");
                }

                return {
                    companySlug: targetSlug,
                    role: item.role,
                    allowedMenus,
                    allowedSubMenus,
                    actions: {
                        canView: true,
                        canCreate: true,
                        canEdit: true,
                        canDelete: true,
                        canExport: true
                    },
                    createdBy: "System",
                    createdOn: new Date(),
                    updatedBy: "System",
                    updatedOn: new Date()
                };
            });

            try {
                await RolePermission.insertMany(defaults, { ordered: false });
            } catch (e) {}

            permissions = await RolePermission.find({ companySlug: targetSlug, isDeleted: { $ne: true } });
        }

        res.status(200).json({
            success: true,
            message: "Role permissions retrieved successfully!",
            data: permissions,
            companySlug: targetSlug
        });
    } catch (error) {
        next(error);
    }
};

const updateRolePermissions = async (req, res, next) => {
    try {
        let updates = req.body || {};
        if (updates.role && (Array.isArray(updates.allowedMenus) || Array.isArray(updates.allowedSubMenus))) {
            updates = {
                [updates.role]: {
                    allowedMenus: updates.allowedMenus,
                    allowedSubMenus: updates.allowedSubMenus,
                    actions: updates.actions
                }
            };
        }
        const querySlug = req.query.companySlug;
        const userSlug = req.user ? req.user.companySlug : null;
        const targetSlug = querySlug || (req.user && req.user.role !== "Superadmin" ? userSlug : "global") || "global";

        const updaterRole = req.user ? req.user.role : "Superadmin";
        const updaterName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";

        let adminAllowedMenus = null;

        if (updaterRole && updaterRole.toLowerCase() === "admin") {
            const forbiddenKeys = Object.keys(updates).filter(roleKey => 
                roleKey.toLowerCase() === "admin" || roleKey.toLowerCase() === "superadmin"
            );
            if (forbiddenKeys.length > 0) {
                return next(createHttpError(403, "Forbidden. Admins can only change permissions for roles below them."));
            }

            const adminPerm = await RolePermission.findOne({ 
                companySlug: targetSlug,
                role: { $regex: /^admin$/i }, 
                isDeleted: { $ne: true } 
            });
            adminAllowedMenus = adminPerm ? (adminPerm.allowedMenus || []) : [];
        }

        for (const [role, config] of Object.entries(updates)) {
            if (config && (Array.isArray(config.allowedMenus) || Array.isArray(config.allowedSubMenus))) {
                let allowedMenus = (config.allowedMenus || []).filter(m => m !== "tables" && m !== "tableSetup");
                let allowedSubMenus = config.allowedSubMenus || [];

                if (updaterRole && updaterRole.toLowerCase() === "admin" && Array.isArray(adminAllowedMenus)) {
                    allowedMenus = allowedMenus.filter(m => m === "settings" || adminAllowedMenus.includes(m));
                }

                if (!allowedMenus.includes("settings")) {
                    allowedMenus = ["settings", ...allowedMenus];
                }
                if (!allowedSubMenus.includes("details")) {
                    allowedSubMenus = ["details", ...allowedSubMenus];
                }

                const escapedRole = role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                let perm = await RolePermission.findOne({ 
                    companySlug: targetSlug,
                    role: { $regex: new RegExp("^" + escapedRole + "$", "i") }, 
                    isDeleted: { $ne: true } 
                });
                if (!perm) {
                    perm = new RolePermission({ companySlug: targetSlug, role, createdBy: updaterName, createdOn: new Date() });
                } else if (perm.isDeleted) {
                    perm.isDeleted = false;
                    perm.deletedBy = undefined;
                    perm.deletedOn = undefined;
                }
                perm.allowedMenus = allowedMenus;
                perm.allowedSubMenus = allowedSubMenus;
                const inputActions = config.actions || {};
                perm.actions = {
                    canView: inputActions.canView !== undefined ? Boolean(inputActions.canView) : (config.canView !== undefined ? Boolean(config.canView) : true),
                    canCreate: inputActions.canCreate !== undefined ? Boolean(inputActions.canCreate) : (config.canCreate !== undefined ? Boolean(config.canCreate) : true),
                    canEdit: inputActions.canEdit !== undefined ? Boolean(inputActions.canEdit) : (config.canEdit !== undefined ? Boolean(config.canEdit) : true),
                    canDelete: inputActions.canDelete !== undefined ? Boolean(inputActions.canDelete) : (config.canDelete !== undefined ? Boolean(config.canDelete) : true),
                    canExport: inputActions.canExport !== undefined ? Boolean(inputActions.canExport) : (config.canExport !== undefined ? Boolean(config.canExport) : true)
                };
                perm.markModified("allowedMenus");
                perm.markModified("allowedSubMenus");
                perm.markModified("actions");
                perm.updatedBy = updaterName;
                perm.updatedOn = new Date();
                await perm.save();
            }
        }

        const permissions = await RolePermission.find({ companySlug: targetSlug, isDeleted: { $ne: true } });

        res.status(200).json({
            success: true,
            message: "Role permissions updated successfully!",
            data: permissions,
            companySlug: targetSlug
        });
    } catch (error) {
        next(error);
    }
};

const deleteRolePermission = async (req, res, next) => {
    try {
        const { role } = req.params;
        const querySlug = req.query.companySlug;
        const userSlug = req.user ? req.user.companySlug : null;
        const targetSlug = querySlug || (req.user && req.user.role !== "Superadmin" ? userSlug : "global") || "global";

        const updaterRole = req.user ? req.user.role : "Superadmin";

        if (["superadmin", "admin"].includes(role.toLowerCase())) {
            const error = createHttpError(400, "System roles cannot be deleted!");
            return next(error);
        }

        const checkRole = (updaterRole || "").toLowerCase();
        if (checkRole !== "superadmin" && checkRole !== "admin") {
            const error = createHttpError(403, "Forbidden. Only Superadmin or Admin can delete roles.");
            return next(error);
        }

        const updaterName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
        const deleted = await RolePermission.findOneAndUpdate(
            { companySlug: targetSlug, role, isDeleted: { $ne: true } },
            {
                role: role + "_deleted_" + Date.now(),
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
            message: "Role '" + role + "' deleted successfully for company " + targetSlug + "."
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { getRolePermissions, updateRolePermissions, deleteRolePermission };