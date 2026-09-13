const express = require("express");
const router = express.Router();
const { addCombo, getCombos, updateCombo, deleteCombo } = require("../../controllers/combo/comboController");
const { isVerifiedUser } = require("../../middlewares/tokenVerification");

/**
 * @swagger
 * tags:
 *   name: Combo Deals
 *   description: Combo deal management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Combo:
 *       type: object
 *       required:
 *         - name
 *         - itemsList
 *         - price
 *         - original
 *       properties:
 *         name:
 *           type: string
 *           description: Unique title of the combo deal
 *           example: "Chiya & Samosa Deal"
 *         itemsList:
 *           type: string
 *           description: List of items in the deal bundle
 *           example: "2 Masala Chai, 1 Samosa"
 *         price:
 *           type: number
 *           description: Promotional price of the combo deal
 *           example: 130
 *         original:
 *           type: number
 *           description: Sum of original items prices
 *           example: 150
 *         isActive:
 *           type: boolean
 *           description: Whether the combo is active
 *           default: true
 */

/**
 * @swagger
 * /api/combo:
 *   get:
 *     summary: Retrieve all active combo deals
 *     tags: [Combo Deals]
 *     responses:
 *       200:
 *         description: Combo deals retrieved successfully
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
 *                     $ref: '#/components/schemas/Combo'
 *   post:
 *     summary: Create a new combo deal
 *     tags: [Combo Deals]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Combo'
 *     responses:
 *       201:
 *         description: Combo deal created successfully
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
 *                   $ref: '#/components/schemas/Combo'
 *       400:
 *         description: Invalid input or duplicate name
 *       401:
 *         description: Unauthorized
 * 
 * /api/combo/{id}:
 *   put:
 *     summary: Update an existing combo deal
 *     tags: [Combo Deals]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The combo deal ID to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Combo'
 *     responses:
 *       200:
 *         description: Combo deal updated successfully
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
 *                   $ref: '#/components/schemas/Combo'
 *       400:
 *         description: Invalid ID or duplicate name
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Combo deal not found
 *   delete:
 *     summary: Soft delete a combo deal
 *     tags: [Combo Deals]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The combo deal ID to delete
 *     responses:
 *       200:
 *         description: Combo deal deleted successfully
 *       400:
 *         description: Invalid ID
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Combo deal not found
 */

router.post("/", isVerifiedUser, addCombo);
router.get("/", getCombos);
router.put("/:id", isVerifiedUser, updateCombo);
router.delete("/:id", isVerifiedUser, deleteCombo);

module.exports = router;
