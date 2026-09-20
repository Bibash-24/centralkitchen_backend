const express = require("express");
const { getRestaurantConfig, updateRestaurantConfig } = require("../../controllers/restaurant/restaurantController");
const { isVerifiedUser, isAdmin } = require("../../middlewares/tokenVerification");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Restaurant
 *   description: Restaurant configuration management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     RestaurantConfig:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           description: Name of the restaurant
 *           example: ""
 *         contactNumbers:
 *           type: array
 *           items:
 *             type: string
 *           description: List of contact telephone numbers
 *           example: ["+977 9812345678", "01-445566"]
 *         address:
 *           type: string
 *           description: Physical address
 *           example: ""
 *         panNumber:
 *           type: string
 *           description: PAN/VAT registration number
 *           example: ""
 *         defaultCurrency:
 *           type: string
 *           description: Default currency symbol
 *           example: "रु"
 *         crmEnabled:
 *           type: boolean
 *           description: Toggle if CRM points system is enabled in the restaurant
 *           example: false
 *         crmPointsEarnRate:
 *           type: number
 *           description: Amount spent to earn 1 loyalty point
 *           example: 100
 *         crmPointsRedeemRate:
 *           type: number
 *           description: Rupees equivalent of 1 loyalty point during redemption
 *           example: 1
 *         logo:
 *           type: string
 *           description: Base64 formatted logo image data URL
 *           example: "data:image/png;base64,iVBORw0KGg..."
 *         slogan:
 *           type: string
 *           description: Slogan or tagline for print templates
 *           example: ""
 *         creditEnabled:
 *           type: boolean
 *           description: Toggle if credit transactions system is enabled restaurant-wide
 *           example: false
 *         creditMaxLimit:
 *           type: number
 *           description: Default maximum credit limit allowed per customer ledger
 *           example: 5000
 *         creditGracePeriod:
 *           type: number
 *           description: Default grace period in days for credit repayments
 *           example: 30
 *         creditAlertThreshold:
 *           type: number
 *           description: Threshold percentage of credit limit usage to trigger alert status
 *           example: 80
 *         creditOverdueNotificationEnabled:
 *           type: boolean
 *           description: Toggle whether overdue credit system-wide alerts are active
 *           example: false
 *         creditOverdueDays:
 *           type: number
 *           description: Age limit in days that classifies credit balance as overdue
 *           example: 20
 *         creditOverdueNotifyRoles:
 *           type: array
 *           items:
 *             type: string
 *           description: Authorized roles allowed to view overdue notifications
 *           example: ["Admin", "Cashier"]
 */

/**
 * @swagger
 * /api/restaurant:
 *   get:
 *     summary: Retrieve restaurant details configuration
 *     tags: [Restaurant]
 *     responses:
 *       200:
 *         description: Restaurant configuration retrieved successfully
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
 *                   $ref: '#/components/schemas/RestaurantConfig'
 */
const optionalAuth = (req, res, next) => {
    isVerifiedUser(req, res, (err) => {
        next();
    });
};

router.route("/").get(optionalAuth, getRestaurantConfig);

/**
 * @swagger
 * /api/restaurant:
 *   patch:
 *     summary: Update restaurant details configuration (Admin only)
 *     tags: [Restaurant]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RestaurantConfig'
 *     responses:
 *       200:
 *         description: Restaurant configuration updated successfully
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
 *                   $ref: '#/components/schemas/RestaurantConfig'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Admin only)
 */
router.route("/").patch(isVerifiedUser, isAdmin, updateRestaurantConfig);

module.exports = router;
