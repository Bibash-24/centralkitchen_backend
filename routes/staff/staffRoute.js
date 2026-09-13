const express = require("express");
const router = express.Router();
const { isVerifiedUser, isAdmin } = require("../../middlewares/tokenVerification");
const { getStaffList, createStaff, updateStaff, deleteStaff } = require("../../controllers/staff/staffController");

/**
 * @swagger
 * tags:
 *   name: Staff
 *   description: Staff management module
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Staff:
 *       type: object
 *       required:
 *         - name
 *         - phone
 *       properties:
 *         id:
 *           type: string
 *           description: Unique database ID of the staff record
 *           example: "60c72b2f9b1d8b2bad18abc0"
 *         name:
 *           type: string
 *           description: Full name of the staff member
 *           example: "John Doe"
 *         email:
 *           type: string
 *           description: Email address of the staff member
 *           example: "john.doe@example.com"
 *         phone:
 *           type: string
 *           description: 10-digit contact number starting with 98 or 97
 *           example: "9876543210"
 *         panNumber:
 *           type: string
 *           description: PAN card number
 *           example: "123456789"
 *         citizenshipNumber:
 *           type: string
 *           description: Citizenship card number
 *           example: "45-02-79-12345"
 *         salary:
 *           type: number
 *           description: Monthly salary amount
 *           example: 25000
 *         isCurrentlyEmployed:
 *           type: boolean
 *           description: Whether the staff member is currently working with the organization
 *           example: true
 *         role:
 *           type: string
 *           description: Dynamically fetched user role if email/phone exists in User Management
 *           example: "cashier"
 */

/**
 * @swagger
 * /api/staff:
 *   get:
 *     summary: Retrieve list of all staff members (Admin & Superadmin only)
 *     tags: [Staff]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Staff list retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Admin access required)
 *   post:
 *     summary: Add a new staff member (Admin & Superadmin only)
 *     tags: [Staff]
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
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               panNumber:
 *                 type: string
 *               citizenshipNumber:
 *                 type: string
 *               salary:
 *                 type: number
 *               isCurrentlyEmployed:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Staff member created successfully
 *       400:
 *         description: Validation failed or duplicate staff
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Admin access required)
 */

/**
 * @swagger
 * /api/staff/{id}:
 *   put:
 *     summary: Update staff member details (Admin & Superadmin only)
 *     tags: [Staff]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Staff MongoDB ID
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
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               panNumber:
 *                 type: string
 *               citizenshipNumber:
 *                 type: string
 *               salary:
 *                 type: number
 *               isCurrentlyEmployed:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Staff member updated successfully
 *       400:
 *         description: Validation failed or duplicate constraint
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Admin access required)
 *       404:
 *         description: Staff member not found
 *   delete:
 *     summary: Mark a staff member as deleted (Admin & Superadmin only)
 *     tags: [Staff]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Staff MongoDB ID
 *     responses:
 *       200:
 *         description: Staff member deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Admin access required)
 *       404:
 *         description: Staff member not found
 */

router.route("/")
    .get(isVerifiedUser, isAdmin, getStaffList)
    .post(isVerifiedUser, isAdmin, createStaff);

router.route("/:id")
    .put(isVerifiedUser, isAdmin, updateStaff)
    .delete(isVerifiedUser, isAdmin, deleteStaff);

module.exports = router;
