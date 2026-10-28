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


/**
 * @swagger
 * tags:
 *   name: Rider Deliveries
 *   description: Rider active dispatch operations, real-time status transitions, GPS location tracking, and receiver handover verification
 */

/**
 * @swagger
 * /api/rider/deliveries:
 *   get:
 *     summary: Get deliveries assigned to the authenticated rider
 *     tags: [Rider Deliveries]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Optional status filter (e.g. Ready for Dispatch, Out for Delivery, ARRIVED, Delivered)
 *         example: Out for Delivery
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search query matching recipient name, phone, order number, or address
 *       - in: query
 *         name: companySlug
 *         schema:
 *           type: string
 *         description: Multi-tenant company slug (Superadmin only)
 *     responses:
 *       200:
 *         description: List of assigned delivery dispatches
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/DeliveryOrder'
 *                 total:
 *                   type: integer
 *                   example: 5
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Access denied (requires Rider role or delivery permissions)
 */

/**
 * @swagger
 * /api/rider/deliveries/{id}:
 *   get:
 *     summary: Get specific delivery order details by ID for rider execution
 *     tags: [Rider Deliveries]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Delivery Order MongoDB ObjectId
 *         example: 64e21a8f9b1c2d3e4f5a6b7c
 *     responses:
 *       200:
 *         description: Full delivery order details for rider drop-off
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/DeliveryOrder'
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Access denied or order belongs to another rider
 *       404:
 *         description: Delivery order not found
 */

/**
 * @swagger
 * /api/rider/deliveries/{id}/status:
 *   post:
 *     summary: Update rider delivery status, GPS location, and recipient handover proof
 *     tags: [Rider Deliveries]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Delivery Order MongoDB ObjectId
 *         example: 64e21a8f9b1c2d3e4f5a6b7c
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: ["Out for Delivery", "ARRIVED", "PENDING_RECEIVER_CONFIRMATION", "Delivered", "Cancelled"]
 *                 example: Delivered
 *               receiverName:
 *                 type: string
 *                 description: Name of person receiving the order handover
 *                 example: Sita Sharma
 *               receiverPhone:
 *                 type: string
 *                 description: Phone number of the receiver
 *                 example: "9841234567"
 *               signature:
 *                 type: string
 *                 description: Base64 data URL string representing recipient signature proof
 *                 example: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg..."
 *               notes:
 *                 type: string
 *                 description: Delivery completion remarks or handover notes
 *                 example: Handed over at 2nd floor reception
 *               location:
 *                 type: object
 *                 description: GPS coordinates of rider at status update
 *                 properties:
 *                   latitude:
 *                     type: number
 *                     example: 27.7172
 *                   longitude:
 *                     type: number
 *                     example: 85.3240
 *                   accuracy:
 *                     type: number
 *                     example: 10.5
 *                   address:
 *                     type: string
 *                     example: Thamel Marg, Kathmandu
 *     responses:
 *       200:
 *         description: Delivery status and handover proof saved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Delivery marked as Delivered successfully.
 *                 data:
 *                   $ref: '#/components/schemas/DeliveryOrder'
 *       400:
 *         description: Target delivery status is required or invalid
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Access denied or unauthorized rider
 *       404:
 *         description: Delivery order not found
 */

// Protect all rider routes with both authentication and strict RBAC authorization
router.use(isVerifiedUser, requireRiderOrAuthorizedDeliveryRole);

router.get("/", getRiderDeliveries);
router.get("/:id", getRiderDeliveryById);
router.post("/:id/status", updateRiderDeliveryStatus);

module.exports = router;
