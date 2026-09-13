const express = require("express");
const router = express.Router();
const { addMenuItem, getMenuItems, updateMenuItem, deleteMenuItem } = require("../../controllers/menuItem/menuItemController");
const { isVerifiedUser } = require("../../middlewares/tokenVerification");

/**
 * @swagger
 * tags:
 *   name: Menu Items
 *   description: Menu item management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     MenuItem:
 *       type: object
 *       required:
 *         - name
 *         - price
 *         - categoryId
 *       properties:
 *         name:
 *           type: string
 *           description: Unique name of the menu item
 *           example: "Masala Chai"
 *         price:
 *           type: number
 *           description: Price of the item (must be > 0)
 *           example: 60
 *         categoryId:
 *           type: string
 *           description: MongoDB ObjectId of the parent MenuCategory
 *           example: "6650abc123def456ghi789"
 *         isActive:
 *           type: boolean
 *           description: Whether the item is currently available
 *           default: true
 *         isSalesHourItem:
 *           type: boolean
 *           description: Whether the item has sale timing restrictions
 *           default: false
 *         startTime:
 *           type: string
 *           description: Start hour in HH:MM format (24-hour time)
 *           example: "12:00"
 *         endTime:
 *           type: string
 *           description: End hour in HH:MM format (24-hour time)
 *           example: "22:00"
 *         salePrice:
 *           type: number
 *           description: Special promotional sale price during timing windows
 *           example: 45
 *         recipe:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               inventoryItem:
 *                 type: string
 *                 description: MongoDB ObjectId of the inventory commodity
 *                 example: "6650abc123def456ghi789"
 *               ratio:
 *                 type: number
 *                 description: Consumption deduction ratio quantity
 *                 example: 150
 */

/**
 * @swagger
 * /api/menu-item:
 *   get:
 *     summary: Retrieve all active menu items (with category populated)
 *     tags: [Menu Items]
 *     responses:
 *       200:
 *         description: Menu items retrieved successfully
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
 *                     $ref: '#/components/schemas/MenuItem'
 *   post:
 *     summary: Create a new menu item
 *     tags: [Menu Items]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MenuItem'
 *     responses:
 *       201:
 *         description: Menu item created successfully
 *       400:
 *         description: Bad request (missing fields, invalid price, or duplicate name)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Category not found
 */
router.get("/", getMenuItems);
router.post("/", isVerifiedUser, addMenuItem);

/**
 * @swagger
 * /api/menu-item/{id}:
 *   put:
 *     summary: Update an existing menu item
 *     tags: [Menu Items]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The menu item ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Ginger Tea"
 *               price:
 *                 type: number
 *                 example: 70
 *               categoryId:
 *                 type: string
 *                 example: "6650abc123def456ghi789"
 *               isActive:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Menu item updated successfully
 *       400:
 *         description: Bad request (invalid ID or duplicate name)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Menu item or category not found
 *   delete:
 *     summary: Soft delete a menu item
 *     tags: [Menu Items]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The menu item ID to delete
 *     responses:
 *       200:
 *         description: Menu item deleted successfully
 *       400:
 *         description: Bad request (invalid ID)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Menu item not found
 */
router.put("/:id", isVerifiedUser, updateMenuItem);
router.delete("/:id", isVerifiedUser, deleteMenuItem);

module.exports = router;
