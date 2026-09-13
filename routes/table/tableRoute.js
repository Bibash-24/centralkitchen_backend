const express = require("express");
const { addTable, getTables, updateTable, getTableById, deleteTable, saveTableQr, duplicateTable } = require("../../controllers/table/tableController");
const router = express.Router();
const { isVerifiedUser } = require("../../middlewares/tokenVerification");

/**
 * @swagger
 * components:
 *   schemas:
 *     Table:
 *       type: object
 *       required:
 *         - tableNo
 *         - seats
 *         - tableArea
 *       properties:
 *         tableNo:
 *           type: number
 *         seats:
 *           type: number
 *         tableArea:
 *           type: string
 *           description: ObjectId of TableArea
 *         status:
 *           type: string
 *           default: Available
 */

/**
 * @swagger
 * /api/table:
 *   post:
 *     summary: Create a new table
 *     tags: [Tables]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Table'
 *     responses:
 *       201:
 *         description: Table added successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *   get:
 *     summary: Retrieve all tables
 *     tags: [Tables]
 *     responses:
 *       200:
 *         description: Tables retrieved successfully
 */
router.route("/").post(isVerifiedUser, addTable);
router.route("/").get(getTables);

/**
 * @swagger
 * /api/table/{id}:
 *   get:
 *     summary: Get table by ID
 *     tags: [Tables]
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
 *         description: Table retrieved successfully
 *       404:
 *         description: Table not found
 *       401:
 *         description: Unauthorized
 *   put:
 *     summary: Update table status/order/area/seats/number
 *     tags: [Tables]
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
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *               orderId:
 *                 type: string
 *               tableNo:
 *                 type: number
 *               seats:
 *                 type: number
 *               tableArea:
 *                 type: string
 *     responses:
 *       200:
 *         description: Table updated successfully
 *       404:
 *         description: Table not found
 *       401:
 *         description: Unauthorized
 */
router.route("/:id").get(isVerifiedUser, getTableById);
router.route("/:id").put(isVerifiedUser, updateTable);

/**
 * @swagger
 * /api/table/{id}:
 *   delete:
 *     summary: Soft delete a table
 *     tags: [Tables]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The table ID to delete
 *     responses:
 *       200:
 *         description: Table deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Table not found
 */
router.route("/:id").delete(isVerifiedUser, deleteTable);

/**
 * @swagger
 * /api/table/{id}/qr:
 *   patch:
 *     summary: Save or replace a generated QR code URL for a specific table
 *     tags: [Tables]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The table ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - qrLink
 *             properties:
 *               qrLink:
 *                 type: string
 *                 description: The full URL encoded in the QR code
 *                 example: "http://localhost:5173/order?table=Table%201"
 *               qrImage:
 *                 type: string
 *                 description: The base64 data-URL string of the QR code image
 *                 example: "data:image/png;base64,iVBORw0KGgoAAAANS..."
 *     responses:
 *       200:
 *         description: QR link and image saved successfully
 *       400:
 *         description: Bad request (invalid ID or missing qrLink)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Table not found
 */
router.route("/:id/qr").patch(isVerifiedUser, saveTableQr);

/**
 * @swagger
 * /api/table/{id}/duplicate:
 *   post:
 *     summary: Duplicate a table space for multiple groups (sharing)
 *     tags: [Tables]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The table ID to duplicate
 *     responses:
 *       201:
 *         description: Table space duplicated successfully
 *       400:
 *         description: Bad request / Sitting capacity limit reached
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (insufficient permissions)
 *       404:
 *         description: Table not found
 */
router.route("/:id/duplicate").post(isVerifiedUser, duplicateTable);

module.exports = router;