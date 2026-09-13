const express = require("express");
const {
    addTableArea,
    getTableAreas,
    getTableAreaById,
    updateTableArea,
    deleteTableArea
} = require("../../controllers/tableArea/tableAreaController");
const router = express.Router();
const { isVerifiedUser } = require("../../middlewares/tokenVerification");

/**
 * @swagger
 * components:
 *   schemas:
 *     TableArea:
 *       type: object
 *       required:
 *         - tableArea
 *         - noOfTables
 *       properties:
 *         tableArea:
 *           type: string
 *         noOfTables:
 *           type: number
 *         description:
 *           type: string
 */

/**
 * @swagger
 * /api/table-area:
 *   post:
 *     summary: Create a new table area
 *     tags: [Table Areas]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TableArea'
 *     responses:
 *       201:
 *         description: Table area added successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *   get:
 *     summary: Retrieve all table areas
 *     tags: [Table Areas]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Table areas retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.route("/").post(isVerifiedUser, addTableArea);
router.route("/").get(isVerifiedUser, getTableAreas);

/**
 * @swagger
 * /api/table-area/{id}:
 *   get:
 *     summary: Get a table area by ID
 *     tags: [Table Areas]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Table area retrieved successfully
 *       404:
 *         description: Table area not found
 *       401:
 *         description: Unauthorized
 *   put:
 *     summary: Update a table area by ID
 *     tags: [Table Areas]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TableArea'
 *     responses:
 *       200:
 *         description: Table area updated successfully
 *       404:
 *         description: Table area not found
 *       401:
 *         description: Unauthorized
 */
router.route("/:id").get(isVerifiedUser, getTableAreaById);
router.route("/:id").put(isVerifiedUser, updateTableArea);

/**
 * @swagger
 * /api/table-area/{id}:
 *   delete:
 *     summary: Soft delete a table area and its associated tables
 *     tags: [Table Areas]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The table area ID to delete
 *     responses:
 *       200:
 *         description: Table area and its associated tables deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Table area not found
 */
router.route("/:id").delete(isVerifiedUser, deleteTableArea);

module.exports = router;
