const express = require("express");
const { superadminLogin, getActiveTenants, getLicenseConfig, updateLicenseConfig, getGlobalModules, updateGlobalModules } = require("../../controllers/superadmin/superadminController");
const { isVerifiedUser, isSuperadmin } = require("../../middlewares/tokenVerification");
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Superadmin
 *   description: Superadmin authentication, licensing controls, and system settings
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     TenantDetails:
 *       type: object
 *       properties:
 *         dbSource:
 *           type: string
 *           example: "Primary DB"
 *         name:
 *           type: string
 *           example: "Chiya Town POS"
 *         contactNumbers:
 *           type: array
 *           items:
 *             type: string
 *           example: ["+977 9812345678"]
 *         address:
 *           type: string
 *           example: "Mid Baneshwor, Kathmandu, Nepal"
 *         panNumber:
 *           type: string
 *           example: "609548231"
 *         defaultCurrency:
 *           type: string
 *           example: "रु"
 *         slogan:
 *           type: string
 *           example: "Fresh flavors, delivered to your table"
 *         enabledModules:
 *           type: array
 *           items:
 *             type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *     SuperadminLoginRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           description: Superadmin email address or phone number
 *           example: "info@genvixtech.com"
 *         password:
 *           type: string
 *           description: Superadmin password
 *           example: "Genvix@Tech123_"
 *     SuperadminLoginResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: "Superadmin logged in successfully!"
 *         data:
 *           type: object
 *           properties:
 *             user:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 name:
 *                   type: string
 *                   example: "Genvix Tech"
 *                 email:
 *                   type: string
 *                   example: "info@genvixtech.com"
 *                 phone:
 *                   type: number
 *                   example: 9762688171
 *                 role:
 *                   type: string
 *                   example: "Superadmin"
 *             accessToken:
 *               type: string
 *     LicenseConfig:
 *       type: object
 *       properties:
 *         isTrialActive:
 *           type: boolean
 *           description: Active status of the trial period evaluation
 *           example: true
 *         trialStartDate:
 *           type: string
 *           description: Trial period start date (YYYY-MM-DD)
 *           example: "2026-06-01"
 *         trialEndDate:
 *           type: string
 *           description: Trial period end date (YYYY-MM-DD)
 *           example: "2026-06-30"
 *         isSystemActivated:
 *           type: boolean
 *           description: Active status of the full system license
 *           example: false
 *         activationStartDate:
 *           type: string
 *           description: System license activation start date (YYYY-MM-DD)
 *           example: null
 *         activationEndDate:
 *           type: string
 *           description: System license activation end date (YYYY-MM-DD)
 *           example: null
 */

/**
 * @swagger
 * /api/superuser/login:
 *   post:
 *     summary: Log in Superadmin using Superadmin credentials
 *     tags: [Superadmin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SuperadminLoginRequest'
 *     responses:
 *       200:
 *         description: Superadmin logged in successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuperadminLoginResponse'
 *       400:
 *         description: Bad request (missing email or password)
 *       401:
 *         description: Invalid credentials
 */
router.route("/login").post(superadminLogin);

/**
 * @swagger
 * /api/superuser/license:
 *   get:
 *     summary: Retrieve system licensing and trial configuration details
 *     tags: [Superadmin]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: License config retrieved successfully
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
 *                   $ref: '#/components/schemas/LicenseConfig'
 *       401:
 *         description: Unauthorized
 */
router.route("/license").get(isVerifiedUser, getLicenseConfig);

/**
 * @swagger
 * /api/superuser/license:
 *   patch:
 *     summary: Update system licensing and trial configuration details (Superadmin only)
 *     tags: [Superadmin]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LicenseConfig'
 *     responses:
 *       200:
 *         description: License config updated successfully
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
 *                   $ref: '#/components/schemas/LicenseConfig'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Superadmin only)
 */
router.route("/license").patch(isVerifiedUser, isSuperadmin, updateLicenseConfig);

/**
 * @swagger
 * /api/superuser/active-tenants:
 *   get:
 *     summary: Retrieve list of all active tenant restaurants using DeliGati across database clusters
 *     tags: [Superadmin]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Active tenant restaurants retrieved successfully
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
 *                 count:
 *                   type: number
 *                   example: 1
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/TenantDetails'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Superadmin only)
 */
router.route("/active-tenants").get(isVerifiedUser, isSuperadmin, getActiveTenants);

module.exports = router;

router.route("/global-modules").get(getGlobalModules);
router.route("/global-modules").patch(isVerifiedUser, isSuperadmin, updateGlobalModules);
router.route("/global-modules").put(isVerifiedUser, isSuperadmin, updateGlobalModules);
