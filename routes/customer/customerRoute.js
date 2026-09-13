const express = require("express");
const router = express.Router();
const { isVerifiedUser } = require("../../middlewares/tokenVerification");
const { getCustomers, createCustomer, updateCustomer, deleteCustomer } = require("../../controllers/customer/customerController");

/**
 * @swagger
 * tags:
 *   name: Customer
 *   description: Customer Loyalty CRM management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Customer:
 *       type: object
 *       required:
 *         - name
 *         - phone
 *         - email
 *       properties:
 *         name:
 *           type: string
 *           description: Name of the customer
 *           example: "Prasanna Shrestha"
 *         phone:
 *           type: string
 *           description: Phone number of the customer
 *           example: "9841526374"
 *         email:
 *           type: string
 *           description: Email address of the customer
 *           example: "prasanna@example.com"
 *         visits:
 *           type: number
 *           description: Number of visits
 *           example: 24
 *         spent:
 *           type: number
 *           description: Total amount spent in rupees
 *           example: 12450
 *         points:
 *           type: number
 *           description: Current loyalty points
 *           example: 249
 */

/**
 * @swagger
 * /api/customer:
 *   get:
 *     summary: Retrieve list of all customers
 *     tags: [Customer]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Customers list retrieved successfully
 *       401:
 *         description: Unauthorized
 *   post:
 *     summary: Add a new loyalty customer
 *     tags: [Customer]
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
 *               - email
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       201:
 *         description: Customer created successfully
 *       400:
 *         description: Invalid input or customer exists
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/customer/{id}:
 *   put:
 *     summary: Update an existing customer
 *     tags: [Customer]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Customer ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - phone
 *               - email
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Customer updated successfully
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Customer not found
 *   delete:
 *     summary: Soft delete a customer
 *     tags: [Customer]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Customer ID
 *     responses:
 *       200:
 *         description: Customer deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Customer not found
 */

router.route("/")
    .get(isVerifiedUser, getCustomers)
    .post(isVerifiedUser, createCustomer);

router.route("/:id")
    .put(isVerifiedUser, updateCustomer)
    .delete(isVerifiedUser, deleteCustomer);

module.exports = router;
