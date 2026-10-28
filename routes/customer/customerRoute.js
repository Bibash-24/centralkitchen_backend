const express = require("express");
const router = express.Router();
const { getCustomers, createCustomer, updateCustomer, deleteCustomer, recordPayment } = require("../../controllers/customer/customerController");
const { isVerifiedUser } = require("../../middlewares/tokenVerification");

/**
 * @swagger
 * components:
 *   schemas:
 *     CustomerCreditHistory:
 *       type: object
 *       properties:
 *         type:
 *           type: string
 *           enum: ["credit", "payment", "waiver"]
 *           example: payment
 *         amount:
 *           type: number
 *           example: 500
 *         orderId:
 *           type: string
 *           example: 64e21a8f9b1c2d3e4f5a6b7c
 *         orderNo:
 *           type: string
 *           example: CK-0001
 *         note:
 *           type: string
 *           example: Cash repayment
 *         timestamp:
 *           type: string
 *           format: date-time
 * 
 *     Customer:
 *       type: object
 *       required:
 *         - name
 *         - phone
 *       properties:
 *         _id:
 *           type: string
 *           example: 64e21a8f9b1c2d3e4f5a6b7c
 *         companySlug:
 *           type: string
 *           example: fresh-bites
 *         name:
 *           type: string
 *           example: Sita Sharma
 *         phone:
 *           type: string
 *           example: "9841234567"
 *         email:
 *           type: string
 *           example: sita@example.com
 *         address:
 *           type: string
 *           example: Lazimpat, Kathmandu
 *         creditLimit:
 *           type: number
 *           example: 10000
 *         currentBalance:
 *           type: number
 *           example: 1500
 *         isBlacklisted:
 *           type: boolean
 *           example: false
 *         blacklistReason:
 *           type: string
 *           example: ""
 *         creditHistory:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/CustomerCreditHistory'
 */

/**
 * @swagger
 * tags:
 *   name: Customer Management
 *   description: Customer profiles, credit limits, balance tracking, and repayment ledger management
 */

/**
 * @swagger
 * /api/customers:
 *   get:
 *     summary: Retrieve list of customers
 *     tags: [Customer Management]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: companySlug
 *         schema:
 *           type: string
 *         description: Company slug tag
 *         example: fresh-bites
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search query matching name, phone, email, or address
 *     responses:
 *       200:
 *         description: List of customers
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
 *                     $ref: '#/components/schemas/Customer'
 * 
 *   post:
 *     summary: Create a new customer profile
 *     tags: [Customer Management]
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
 *               - phone
 *             properties:
 *               name:
 *                 type: string
 *                 example: Sita Sharma
 *               phone:
 *                 type: string
 *                 example: "9841234567"
 *               email:
 *                 type: string
 *                 example: sita@example.com
 *               address:
 *                 type: string
 *                 example: Lazimpat, Kathmandu
 *               creditLimit:
 *                 type: number
 *                 example: 10000
 *               currentBalance:
 *                 type: number
 *                 example: 0
 *               isBlacklisted:
 *                 type: boolean
 *                 example: false
 *               blacklistReason:
 *                 type: string
 *                 example: ""
 *               companySlug:
 *                 type: string
 *                 example: fresh-bites
 *     responses:
 *       201:
 *         description: Customer created successfully
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
 *                   example: Customer created successfully
 *                 data:
 *                   $ref: '#/components/schemas/Customer'
 *       400:
 *         description: Validation error or phone number already exists
 */

/**
 * @swagger
 * /api/customers/{id}:
 *   put:
 *     summary: Update an existing customer profile
 *     tags: [Customer Management]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Customer MongoDB ObjectId
 *         example: 64e21a8f9b1c2d3e4f5a6b7c
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Sita Sharma
 *               phone:
 *                 type: string
 *                 example: "9841234567"
 *               email:
 *                 type: string
 *                 example: sita@example.com
 *               address:
 *                 type: string
 *                 example: Lazimpat, Kathmandu
 *               creditLimit:
 *                 type: number
 *                 example: 15000
 *               currentBalance:
 *                 type: number
 *                 example: 500
 *               isBlacklisted:
 *                 type: boolean
 *                 example: false
 *               blacklistReason:
 *                 type: string
 *                 example: ""
 *     responses:
 *       200:
 *         description: Customer updated successfully
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
 *                   example: Customer Sita Sharma updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/Customer'
 *       404:
 *         description: Customer not found
 * 
 *   delete:
 *     summary: Soft delete a customer profile
 *     tags: [Customer Management]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Customer MongoDB ObjectId
 *         example: 64e21a8f9b1c2d3e4f5a6b7c
 *     responses:
 *       200:
 *         description: Customer deleted successfully
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
 *                   example: Customer Sita Sharma deleted successfully
 *       404:
 *         description: Customer not found
 */

/**
 * @swagger
 * /api/customers/{id}/pay:
 *   patch:
 *     summary: Record customer repayment to reduce outstanding credit balance
 *     tags: [Customer Management]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Customer MongoDB ObjectId
 *         example: 64e21a8f9b1c2d3e4f5a6b7c
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *             properties:
 *               amount:
 *                 type: number
 *                 description: Repayment amount
 *                 example: 500
 *               note:
 *                 type: string
 *                 description: Payment note / receipt reference
 *                 example: Cash settlement at store
 *               date:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Payment recorded and balance updated successfully
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
 *                   example: Payment of Rs 500 recorded successfully
 *                 data:
 *                   $ref: '#/components/schemas/Customer'
 *       400:
 *         description: Payment amount must be greater than 0
 *       404:
 *         description: Customer not found
 */

router.get("/", isVerifiedUser, getCustomers);
router.post("/", isVerifiedUser, createCustomer);
router.put("/:id", isVerifiedUser, updateCustomer);
router.delete("/:id", isVerifiedUser, deleteCustomer);
router.patch("/:id/pay", isVerifiedUser, recordPayment);

module.exports = router;
