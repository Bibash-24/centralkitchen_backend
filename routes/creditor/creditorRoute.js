const express = require("express");
const router = express.Router();
const { getCreditors, createCreditor, updateCreditor, deleteCreditor, recordPayment, waiveCredit } = require("../../controllers/creditor/creditorController");
const { isVerifiedUser } = require("../../middlewares/tokenVerification");

/**
 * @swagger
 * tags:
 *   name: Creditor
 *   description: Creditor Directory & Credit settings management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Creditor:
 *       type: object
 *       required:
 *         - name
 *         - phone
 *         - address
 *       properties:
 *         name:
 *           type: string
 *           description: Name of the creditor
 *           example: "Harish Thapa"
 *         phone:
 *           type: string
 *           description: Unique contact number
 *           example: "9801234567"
 *         email:
 *           type: string
 *           description: Email address
 *           example: "harish@example.com"
 *         address:
 *           type: string
 *           description: Location/Address details
 *           example: "Lalitpur, Nepal"
 *         creditLimit:
 *           type: number
 *           description: Maximum allowed outstanding debt limit
 *           example: 5000
 *         currentBalance:
 *           type: number
 *           description: Current outstanding debt amount
 *           example: 1200
 *         isBlacklisted:
 *           type: boolean
 *           description: Blacklist suspension status flag
 *           example: false
 *         blacklistReason:
 *           type: string
 *           description: Reason for blacklist suspension
 *           example: "Frequent defaults"
 */

/**
 * @swagger
 * /api/creditor:
 *   get:
 *     summary: Retrieve list of all creditors
 *     tags: [Creditor]
 *     responses:
 *       200:
 *         description: Creditors list retrieved successfully
 *       500:
 *         description: Internal server error
 *   post:
 *     summary: Create a new creditor profile
 *     tags: [Creditor]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - phone
 *               - address
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *               address:
 *                 type: string
 *               creditLimit:
 *                 type: number
 *               isBlacklisted:
 *                 type: boolean
 *               blacklistReason:
 *                 type: string
 *     responses:
 *       201:
 *         description: Creditor profile created successfully
 *       400:
 *         description: Invalid input or creditor profile already exists
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/creditor/{id}:
 *   put:
 *     summary: Update an existing creditor profile
 *     tags: [Creditor]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Creditor ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - phone
 *               - address
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *               address:
 *                 type: string
 *               creditLimit:
 *                 type: number
 *               isBlacklisted:
 *                 type: boolean
 *               blacklistReason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Creditor profile updated successfully
 *       400:
 *         description: Invalid input or validation failed
 *       404:
 *         description: Creditor profile not found
 *       500:
 *         description: Internal server error
 *   delete:
 *     summary: Soft delete a creditor profile
 *     tags: [Creditor]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Creditor ID
 *     responses:
 *       200:
 *         description: Creditor profile deleted successfully
 *       404:
 *         description: Creditor profile not found
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/creditor/{id}/pay:
 *   patch:
 *     summary: Record a debt repayment for a creditor
 *     tags: [Creditor]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Creditor ID
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
 *                 description: Amount paid back
 *                 example: 500
 *               note:
 *                 type: string
 *                 description: Optional payment note
 *                 example: "Cash repayment"
 *     responses:
 *       200:
 *         description: Repayment recorded successfully
 *       400:
 *         description: Invalid repayment amount
 *       404:
 *         description: Creditor profile not found
 *       500:
 *         description: Internal server error
 */

router.get("/", getCreditors);
router.post("/", createCreditor);
router.put("/:id", updateCreditor);
router.delete("/:id", deleteCreditor);
router.patch("/:id/pay", recordPayment);
/**
 * @swagger
 * /api/creditor/{id}/waive-off:
 *   post:
 *     summary: Apply a credit waiver on creditor balance
 *     tags: [Creditors]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Creditor ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - passwordOrPin
 *               - note
 *             properties:
 *               passwordOrPin:
 *                 type: string
 *                 description: User security PIN or Password
 *                 example: "1234"
 *               note:
 *                 type: string
 *                 description: Required waiver remarks/reason
 *                 example: "Credit waiver approved by manager"
 *     responses:
 *       200:
 *         description: Credit waiver approved successfully
 *       400:
 *         description: Invalid input or verification failure
 *       403:
 *         description: Unauthorized role
 *       404:
 *         description: Creditor profile not found
 *       500:
 *         description: Internal server error
 */
router.post("/:id/waive-off", isVerifiedUser, waiveCredit);

module.exports = router;
