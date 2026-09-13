const express = require("express");
const { getRolePermissions, updateRolePermissions, deleteRolePermission } = require("../../controllers/superadmin/rolePermissionController");
const { isVerifiedUser, isAdmin } = require("../../middlewares/tokenVerification");

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     RolePermission:
 *       type: object
 *       properties:
 *         role:
 *           type: string
 *           description: The user role name (e.g. Admin, cashier, waiter)
 *           example: "Admin"
 *         allowedMenus:
 *           type: array
 *           items:
 *             type: string
 *           description: Allowed main navigation menus (e.g. inventory, sales, expenses, accounts, vendors)
 *           example: ["inventory", "sales", "expenses", "accounts", "vendors"]
 *         allowedSubMenus:
 *           type: array
 *           items:
 *             type: string
 *           description: Allowed submenu items (e.g. items, categories, details, permissions)
 *           example: ["items", "categories", "details", "permissions"]
 */

/**
 * @swagger
 * /api/superuser/role-permissions:
 *   get:
 *     summary: Retrieve tab access permissions for all roles
 *     tags: [Superadmin]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Role permissions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/RolePermission'
 *       401:
 *         description: Unauthorized
 */
router.route("/").get(isVerifiedUser, getRolePermissions);

/**
 * @swagger
 * /api/superuser/role-permissions:
 *   patch:
 *     summary: Update tab access permissions for specific roles (Superadmin only)
 *     tags: [Superadmin]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Key-value map of role names and allowed tabs
 *             example:
 *               Admin: ["details", "ratios", "superuser"]
 *               cashier: ["details"]
 *               waiter: ["details"]
 *     responses:
 *       200:
 *         description: Role permissions updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/RolePermission'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Superadmin only)
 */
router.route("/").patch(isVerifiedUser, isAdmin, updateRolePermissions);
router.route("/:role").delete(isVerifiedUser, isAdmin, deleteRolePermission);

module.exports = router;
