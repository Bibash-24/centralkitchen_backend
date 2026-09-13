const express = require("express");
const router = express.Router();
const { isVerifiedUser, isSuperadmin } = require("../../middlewares/tokenVerification");
const {
    getDropdownOptions,
    createDropdownOption,
    updateDropdownOption,
    deleteDropdownOption
} = require("../../controllers/dropdownOption/dropdownOptionController");

/**
 * @swagger
 * tags:
 *   name: DropdownOption
 *   description: Dynamic dropdown configurations managed by Superadmin
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     DropdownOption:
 *       type: object
 *       required:
 *         - name
 *         - value
 *         - usedFor
 *       properties:
 *         _id:
 *           type: string
 *           description: Unique database ID of the dropdown option
 *           example: "60c72b2f9b1d8b2bad18abc0"
 *         name:
 *           type: string
 *           description: Human-readable display label
 *           example: "Ingredients"
 *         value:
 *           type: string
 *           description: Stored system value
 *           example: "Ingredients"
 *         usedFor:
 *           type: string
 *           description: Category group indicator (e.g. expense_category, payment_method, inventory_unit, area_type)
 *           example: "expense_category"
 *         isActive:
 *           type: boolean
 *           description: Active/inactive status toggle
 *           example: true
 *         isDeleted:
 *           type: boolean
 *           description: Soft delete status flag
 *           example: false
 *         createdBy:
 *           type: string
 *           description: Username of the creator
 *           example: "admin"
 *         updatedBy:
 *           type: string
 *           description: Username of the last updater
 *           example: "admin"
 *         deletedBy:
 *           type: string
 *           description: Username of the soft deleter
 *           example: null
 */

/**
 * @swagger
 * /api/dropdown-options:
 *   get:
 *     summary: Retrieve list of dropdown options (optionally filtered by group)
 *     tags: [DropdownOption]
 *     parameters:
 *       - in: query
 *         name: usedFor
 *         schema:
 *           type: string
 *         required: false
 *         description: Optional group filter identifier (e.g. expense_category, payment_method, inventory_unit, area_type)
 *     responses:
 *       200:
 *         description: Successfully retrieved dropdown options list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/DropdownOption'
 *   post:
 *     summary: Create a new dropdown option (Superadmin only)
 *     tags: [DropdownOption]
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
 *               - value
 *               - usedFor
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Marketing"
 *               value:
 *                 type: string
 *                 example: "Marketing"
 *               usedFor:
 *                 type: string
 *                 example: "expense_category"
 *     responses:
 *       210:
 *         description: Dropdown option created successfully
 */
router.route("/")
    .get(isVerifiedUser, getDropdownOptions)
    .post(isVerifiedUser, isSuperadmin, createDropdownOption);

/**
 * @swagger
 * /api/dropdown-options/{id}:
 *   put:
 *     summary: Update an existing dropdown option details/status (Superadmin only)
 *     tags: [DropdownOption]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The dropdown option ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Digital Marketing"
 *               value:
 *                 type: string
 *                 example: "Digital Marketing"
 *               isActive:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Dropdown option updated successfully
 *   delete:
 *     summary: Soft delete a dropdown option (Superadmin only)
 *     tags: [DropdownOption]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The dropdown option ID
 *     responses:
 *       200:
 *         description: Dropdown option soft-deleted successfully
 */
router.route("/:id")
    .put(isVerifiedUser, isSuperadmin, updateDropdownOption)
    .delete(isVerifiedUser, isSuperadmin, deleteDropdownOption);

module.exports = router;
