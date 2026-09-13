const express = require("express");
const router = express.Router();
const {
    getInventoryItems,
    getInventoryItemById,
    createInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    getInventoryPurchases,
    deductInventoryItem
} = require("../../controllers/inventory/inventoryController");
const { isVerifiedUser } = require("../../middlewares/tokenVerification");

/**
 * @swagger
 * tags:
 *   name: Inventory
 *   description: Stock and inventory item management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     InventoryItem:
 *       type: object
 *       required:
 *         - name
 *         - unit
 *       properties:
 *         id:
 *           type: string
 *           description: Unique database ID of the item
 *           example: "60c72b2f9b1d8b2bad18abc9"
 *         name:
 *           type: string
 *           description: Unique item name
 *           example: "Tea Leaves"
 *         unit:
 *           type: string
 *           enum: [kg, g, L, ml, pcs, box, pack]
 *           description: Item packaging unit
 *           example: "kg"
 *         currentStock:
 *           type: number
 *           description: Total quantity currently in stock
 *           example: 45
 *         lowStockThreshold:
 *           type: number
 *           nullable: true
 *           description: Alert threshold when stock falls below this level
 *           example: 10
 *         targetStock:
 *           type: number
 *           nullable: true
 *           description: Reorder target quantity
 *           example: 100
 *         cost:
 *           type: number
 *           description: Cost per unit
 *           example: 250
 *         category:
 *           type: string
 *           description: Categorization of the item
 *           example: "Ingredients"
 *         vendor:
 *           type: string
 *           nullable: true
 *           description: Linked vendor MongoDB ID
 *           example: "60c72b2f9b1d8b2bad18abc8"
 */

/**
 * @swagger
 * /api/inventory:
 *   get:
 *     summary: Retrieve list of all inventory items
 *     tags: [Inventory]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Inventory list retrieved successfully
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
 *                     $ref: '#/components/schemas/InventoryItem'
 *       401:
 *         description: Unauthorized
 *   post:
 *     summary: Create a new inventory item
 *     tags: [Inventory]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - unit
 *             properties:
 *               name:
 *                 type: string
 *               unit:
 *                 type: string
 *                 enum: [kg, g, L, ml, pcs, box, pack]
 *               currentStock:
 *                 type: number
 *               lowStockThreshold:
 *                 type: number
 *               targetStock:
 *                 type: number
 *               cost:
 *                 type: number
 *               category:
 *                 type: string
 *               vendor:
 *                 type: string
 *               paymentStatus:
 *                 type: string
 *                 enum: [Paid, Credit, Partial]
 *               paymentMethod:
 *                 type: string
 *                 enum: [Cash, Online, Card]
 *               paidAmount:
 *                 type: number
 *     responses:
 *       201:
 *         description: Inventory item created successfully
 *       400:
 *         description: Bad request / validation failed
 *       401:
 *         description: Unauthorized
 * 
 * /api/inventory/{id}:
 *   put:
 *     summary: Update an inventory item
 *     tags: [Inventory]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Inventory item ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               unit:
 *                 type: string
 *                 enum: [kg, g, L, ml, pcs, box, pack]
 *               currentStock:
 *                 type: number
 *               lowStockThreshold:
 *                 type: number
 *               targetStock:
 *                 type: number
 *               cost:
 *                 type: number
 *               category:
 *                 type: string
 *               vendor:
 *                 type: string
 *               paymentStatus:
 *                 type: string
 *                 enum: [Paid, Credit, Partial]
 *               paymentMethod:
 *                 type: string
 *                 enum: [Cash, Online, Card]
 *               paidAmount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Inventory item updated successfully
 *       400:
 *         description: Bad request / validation failed
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Inventory item not found
 *   get:
 *     summary: Retrieve single inventory item by ID including its transaction/adjustment logs
 *     tags: [Inventory]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Inventory item MongoDB ID
 *     responses:
 *       200:
 *         description: Inventory item details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/InventoryItem'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Inventory item not found
 *   delete:
 *     summary: Soft delete an inventory item
 *     tags: [Inventory]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Inventory item ID
 *     responses:
 *       200:
 *         description: Inventory item deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Inventory item not found
 * 
 * /api/inventory/{id}/purchases:
 *   get:
 *     summary: Retrieve purchase history logs for a specific inventory item
 *     tags: [Inventory]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Inventory item ID
 *     responses:
 *       200:
 *         description: Item purchase history retrieved successfully
 *       401:
 *         description: Unauthorized
 * 
 * /api/inventory/{id}/deduct:
 *   post:
 *     summary: Record a manual inventory stock deduction
 *     tags: [Inventory]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Inventory item ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - deductAmount
 *             properties:
 *               deductAmount:
 *                 type: number
 *                 description: Quantity to deduct from stock
 *                 example: 5
 *               reason:
 *                 type: string
 *                 description: Rationale for deduction
 *                 example: "Wastage / Spoiled"
 *     responses:
 *       200:
 *         description: Inventory stock deducted successfully
 *       400:
 *         description: Invalid input or insufficient stock
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Inventory item not found
 */

router.route("/")
    .get(isVerifiedUser, getInventoryItems)
    .post(isVerifiedUser, createInventoryItem);

router.route("/:id")
    .get(isVerifiedUser, getInventoryItemById)
    .put(isVerifiedUser, updateInventoryItem)
    .delete(isVerifiedUser, deleteInventoryItem);

router.route("/:id/purchases")
    .get(isVerifiedUser, getInventoryPurchases);

router.route("/:id/deduct")
    .post(isVerifiedUser, deductInventoryItem);

module.exports = router;
