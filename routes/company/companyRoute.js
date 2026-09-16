const express = require("express");
const router = express.Router();
const { createCompany, getCompanies, getCompanyBySlug, updateCompany, deleteCompany } = require("../../controllers/company/companyController");

/**
 * @swagger
 * components:
 *   schemas:
 *     Company:
 *       type: object
 *       required:
 *         - name
 *         - companySlug
 *       properties:
 *         _id:
 *           type: string
 *           description: Auto-generated MongoDB ObjectId
 *           example: 64e21a8f9b1c2d3e4f5a6b7c
 *         name:
 *           type: string
 *           description: Full registered name of the company tenant
 *           example: Fresh Bites Central Kitchen
 *         companySlug:
 *           type: string
 *           description: Unique URL-friendly slug identifier for tenant isolation
 *           example: fresh-bites
 *         contactEmail:
 *           type: string
 *           description: Contact email address for tenant administration
 *           example: admin@freshbites.com
 *         contactPhone:
 *           type: string
 *           description: Contact phone number for tenant administration
 *           example: "9800000000"
 *         isActive:
 *           type: boolean
 *           description: Whether the company tenant account is active
 *           example: true
 *         enabledModules:
 *           type: array
 *           items:
 *             type: string
 *           description: Enabled system module identifiers
 *           example: ["home", "sales", "expenses", "inventory"]
 *         createdBy:
 *           type: string
 *           description: Username or role of creator
 *           example: Superadmin
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/company:
 *   post:
 *     summary: Incorporate a new company tenant (Superadmin only)
 *     tags: [Company Management]
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
 *               - companySlug
 *             properties:
 *               name:
 *                 type: string
 *                 example: Fresh Bites Central Kitchen
 *               companySlug:
 *                 type: string
 *                 example: fresh-bites
 *               contactEmail:
 *                 type: string
 *                 example: admin@freshbites.com
 *               contactPhone:
 *                 type: string
 *                 example: "9800000000"
 *               enabledModules:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["home", "sales", "expenses", "accounts", "inventory"]
 *     responses:
 *       201:
 *         description: Company incorporated successfully
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
 *                   example: Company 'Fresh Bites' (fresh-bites) incorporated successfully!
 *                 data:
 *                   $ref: '#/components/schemas/Company'
 *       400:
 *         description: Invalid input or company slug already taken
 * 
 *   get:
 *     summary: Retrieve all incorporated company tenants (Superadmin only)
 *     tags: [Company Management]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of incorporated company tenants
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
 *                     $ref: '#/components/schemas/Company'
 */

/**
 * @swagger
 * /api/company/{slug}:
 *   get:
 *     summary: Retrieve single company tenant details by slug
 *     tags: [Company Management]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique company slug tag
 *         example: fresh-bites
 *     responses:
 *       200:
 *         description: Company tenant details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Company'
 *       404:
 *         description: Company tenant not found
 * 
 *   put:
 *     summary: Update incorporated company tenant details (Superadmin only)
 *     tags: [Company Management]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique company slug tag
 *         example: fresh-bites
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Fresh Bites Central Kitchen
 *               contactEmail:
 *                 type: string
 *                 example: info@freshbites.com
 *               contactPhone:
 *                 type: string
 *                 example: "9801234567"
 *               isActive:
 *                 type: boolean
 *                 example: true
 *               enabledModules:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["home", "sales", "expenses"]
 *     responses:
 *       200:
 *         description: Company details updated successfully
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
 *                   example: Company 'Fresh Bites' updated successfully!
 *                 data:
 *                   $ref: '#/components/schemas/Company'
 *       404:
 *         description: Company tenant not found
 */

router.post("/", createCompany);
router.get("/", getCompanies);
router.get("/:slug", getCompanyBySlug);
router.put("/:slug", updateCompany);
router.delete("/:slug", deleteCompany);

module.exports = router;
