const express = require("express");
const router = express.Router();
const { isVerifiedUser } = require("../../middlewares/tokenVerification");
const { getExpenses, createExpense, deleteExpense } = require("../../controllers/expense/expenseController");

/**
 * @swagger
 * tags:
 *   name: Expense
 *   description: Financial expense tracking and transaction logs
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Expense:
 *       type: object
 *       required:
 *         - description
 *         - amount
 *       properties:
 *         id:
 *           type: string
 *           description: Unique database ID of the expense log
 *           example: "60c72b2f9b1d8b2bad18abc0"
 *         description:
 *           type: string
 *           description: Brief description of the expense
 *           example: "Initial purchase of Tea Leaves (10 kg) from Vortex Chips Ltd"
 *         category:
 *           type: string
 *           description: Category classification (e.g. Ingredients, Utilities, Rent)
 *           example: "Ingredients"
 *         amount:
 *           type: number
 *           description: Financial cost/amount of the expense
 *           example: 2500
 *         date:
 *           type: string
 *           format: date-time
 *           description: Date of transaction
 *           example: "2026-07-11T12:00:00Z"
 *         method:
 *           type: string
 *           enum: [Cash, Online, Card]
 *           description: Transaction payment method
 *           example: "Cash"
 *         createdBy:
 *           type: string
 *           description: Identifier of the user who recorded this expense
 *           example: "admin@genvix.com"
 */

/**
 * @swagger
 * /api/expense:
 *   get:
 *     summary: Retrieve list of all expense records
 *     tags: [Expense]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Expense list retrieved successfully
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
 *                     $ref: '#/components/schemas/Expense'
 *       401:
 *         description: Unauthorized
 *   post:
 *     summary: Create a new manual expense record
 *     tags: [Expense]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - description
 *               - amount
 *             properties:
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *               amount:
 *                 type: number
 *               date:
 *                 type: string
 *                 format: date-time
 *               method:
 *                 type: string
 *                 enum: [Cash, Online, Card]
 *     responses:
 *       201:
 *         description: Expense logged successfully
 *       400:
 *         description: Bad request / validation failed
 *       401:
 *         description: Unauthorized
 * 
 * /api/expense/{id}:
 *   delete:
 *     summary: Delete an expense record
 *     tags: [Expense]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Expense ID
 *     responses:
 *       200:
 *         description: Expense deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Expense not found
 */

router.route("/")
    .get(isVerifiedUser, getExpenses)
    .post(isVerifiedUser, createExpense);

router.route("/:id")
    .delete(isVerifiedUser, deleteExpense);

module.exports = router;
