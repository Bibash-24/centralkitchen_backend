const express = require("express");
const router = express.Router();
const createHttpError = require("http-errors");
const { isVerifiedUser } = require("../../middlewares/tokenVerification");
const RolePermission = require("../../models/superadmin/rolePermissionModel");
const {
    getRiderDeliveries,
    getRiderDeliveryById,
    updateRiderDeliveryStatus
} = require("../../controllers/rider/riderDeliveryController");

/**
 * RBAC Authorization Middleware for Rider Endpoints
 * Verifies that the authenticated user is either Superadmin/Admin, assigned the Rider role,
 * or has explicit delivery permissions configured in RolePermission.
 * Blocks unauthorized roles (Cashier, Kitchen Staff, Waiter, Accountant, etc.) with 403 Forbidden.
 */
const requireRiderOrAuthorizedDeliveryRole = async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return next(createHttpError(401, "Authentication required."));
        }

        const roleLower = String(user.role || "").toLowerCase().trim();

        // 1. Superadmin and company Admin get full access by default
        if (roleLower === "superadmin" || roleLower === "admin" || roleLower === "company admin") {
            return next();
        }

        // 2. Rider role has access to rider deliveries
        if (roleLower === "rider") {
            return next();
        }

        // 3. Check RolePermission table for custom roles with delivery permissions
        if (user.companySlug) {
            const perm = await RolePermission.findOne({
                role: new RegExp(`^${user.role}$`, "i"),
                companySlug: user.companySlug,
                isDeleted: { $ne: true }
            });

            if (perm) {
                const allowedMenus = perm.allowedMenus || [];
                const allowedSubMenus = perm.allowedSubMenus || [];
                if (
                    allowedMenus.includes("my-deliveries") ||
                    allowedMenus.includes("deliveries") ||
                    allowedSubMenus.includes("my-deliveries")
                ) {
                    return next();
                }
            }
        }

        // Unauthorized role
        return next(createHttpError(403, "Access denied. Rider or Delivery management permissions required."));
    } catch (err) {
        next(err);
    }
};

// Protect all rider routes with both authentication and strict RBAC authorization
router.use(isVerifiedUser, requireRiderOrAuthorizedDeliveryRole);

router.get("/", getRiderDeliveries);
router.get("/:id", getRiderDeliveryById);
router.post("/:id/status", updateRiderDeliveryStatus);

module.exports = router;
