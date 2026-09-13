const express = require("express");
const router = express.Router();
const { isVerifiedUser } = require("../../middlewares/tokenVerification");
const { getVendors, createVendor, updateVendor, deleteVendor, getVendorHistory, settleVendorBalance, getAllPurchases } = require("../../controllers/vendor/vendorController");

/**
 * @swagger
 * tags:
 *   name: Vendor
 *   description: Vendor details directory management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Vendor:
 *       type: object
 *       required:
 *         - name
 *         - contactNumber
 *         - address
 *       properties:
 *         name:
 *           type: string
 *           description: Name of the vendor
 *           example: "Vortex Chips Ltd"
 *         contactNumber:
 *           type: string
 *           description: 10 digit Nepali phone number starting with 98 or 97
 *           example: "9812345678"
 *         address:
 *           type: string
 *           description: Location address
 *           example: "Kathmandu, Nepal"
 *         email:
 *           type: string
 *           description: Email address of the vendor
 *           example: "info@vortexchips.com"
 *     Purchase:
 *       type: object
 *       required:
 *         - item
 *         - vendor
 *         - quantity
 *         - unitCost
 *         - totalCost
 *       properties:
 *         id:
 *           type: string
 *           description: Unique database ID of the purchase record
 *           example: "60c72b2f9b1d8b2bad18abc1"
 *         item:
 *           type: string
 *           description: Linked inventory item MongoDB ID
 *           example: "60c72b2f9b1d8b2bad18abc9"
 *         vendor:
 *           type: string
 *           description: Linked vendor MongoDB ID
 *           example: "60c72b2f9b1d8b2bad18abc8"
 *         quantity:
 *           type: number
 *           description: Quantity of item purchased
 *           example: 20
 *         unitCost:
 *           type: number
 *           description: Cost per single unit of the item
 *           example: 250
 *         totalCost:
 *           type: number
 *           description: Total cost of purchase (quantity * unitCost)
 *           example: 5000
 *         paidAmount:
 *           type: number
 *           description: Amount actually paid to the vendor
 *           example: 5000
 *         paymentStatus:
 *           type: string
 *           enum: [Paid, Credit, Partial]
 *           description: Payment completion status
 *           example: "Paid"
 *         paymentMethod:
 *           type: string
 *           enum: [Cash, Online, Card, Credit]
 *           description: Payment method used
 *           example: "Cash"
 *         purchaseDate:
 *           type: string
 *           format: date-time
 *           description: Purchase date timestamp
 *           example: "2026-07-11T12:00:00Z"
 */

/**
 * @swagger
 * /api/vendor:
 *   get:
 *     summary: Retrieve list of all active vendors
 *     tags: [Vendor]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Vendors retrieved successfully
 *       401:
 *         description: Unauthorized
 *   post:
 *     summary: Create a new vendor
 *     tags: [Vendor]
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
 *               - contactNumber
 *               - address
 *             properties:
 *               name:
 *                 type: string
 *               contactNumber:
 *                 type: string
 *               address:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       201:
 *         description: Vendor created successfully
 *       400:
 *         description: Validation failed or duplicate vendor
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/vendor/{id}:
 *   put:
 *     summary: Update vendor details
 *     tags: [Vendor]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vendor ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - contactNumber
 *               - address
 *             properties:
 *               name:
 *                 type: string
 *               contactNumber:
 *                 type: string
 *               address:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Vendor updated successfully
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Vendor not found
 *   delete:
 *     summary: Soft delete a vendor profile
 *     tags: [Vendor]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vendor ID
 *     responses:
 *       200:
 *         description: Vendor deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Vendor not found
 * 
 * /api/vendor/{id}/history:
 *   get:
 *     summary: Retrieve purchase history logs for a specific vendor
 *     tags: [Vendor]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vendor ID
 *     responses:
 *       200:
 *         description: Vendor purchase history retrieved successfully
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
 *                     $ref: '#/components/schemas/Purchase'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Vendor not found
 * 
 * /api/vendor/settle:
 *   post:
 *     summary: Settle an outstanding balance for a specific vendor, distributing payments across credit purchases and logging an expense
 *     tags: [Vendor]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - vendorId
 *               - amount
 *               - paymentMethod
 *             properties:
 *               vendorId:
 *                 type: string
 *                 description: Vendor ID
 *                 example: "60c72b2f9b1d8b2bad18abc8"
 *               amount:
 *                 type: number
 *                 description: Settle payment amount in rupees
 *                 example: 3000
 *               paymentMethod:
 *                 type: string
 *                 enum: [Cash, Online, Card, Cheque]
 *                 description: Method of payment
 *                 example: "Cash"
 *               paymentDate:
 *                 type: string
 *                 format: date-time
 *                 description: Optional custom settlement timestamp
 *                 example: "2026-07-11T12:00:00Z"
 *               chequeDate:
 *                 type: string
 *                 format: date-time
 *                 description: Required if paymentMethod is Cheque
 *                 example: "2026-07-20T12:00:00Z"
 *     responses:
 *       200:
 *         description: Balance settled successfully
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Vendor not found
 * 
 * /api/vendor/purchases/all:
 *   get:
 *     summary: Retrieve list of all vendor purchases across the entire system, optionally filtered by date/period
 *     tags: [Vendor]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [today, yesterday, 7days, month]
 *         description: Shortcut filter period
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *         description: Filter start date (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *         description: Filter end date (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: List of purchases retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Purchase'
 *       401:
 *         description: Unauthorized
 */


router.route("/")
    .get(isVerifiedUser, getVendors)
    .post(isVerifiedUser, createVendor);

router.route("/settle")
    .post(isVerifiedUser, settleVendorBalance);

router.route("/purchases/all")
    .get(isVerifiedUser, getAllPurchases);

router.route("/:id")
    .put(isVerifiedUser, updateVendor)
    .delete(isVerifiedUser, deleteVendor);

router.route("/:id/history")
    .get(isVerifiedUser, getVendorHistory);

module.exports = router;
