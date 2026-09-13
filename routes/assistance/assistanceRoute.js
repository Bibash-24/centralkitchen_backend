const express = require("express");
const { createRequest, getRequests, completeRequest } = require("../../controllers/assistance/assistanceController");
const router = express.Router();
const { isVerifiedUser } = require("../../middlewares/tokenVerification");

/**
 * @swagger
 * tags:
 *   name: Assistance
 *   description: Guest call for assistance management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     AssistanceRequest:
 *       type: object
 *       required:
 *         - tableNo
 *       properties:
 *         tableNo:
 *           type: string
 *           description: The table requesting assistance
 *           example: "2"
 *         tableId:
 *           type: string
 *           description: Optional MongoDB ObjectId of the table
 *           example: "6650abc123def456ghi789"
 *         status:
 *           type: string
 *           enum: [Pending, Completed]
 *           default: Pending
 *         createdAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/assistance:
 *   post:
 *     summary: Request assistance for a table (Public Guest route)
 *     tags: [Assistance]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tableNo
 *             properties:
 *               tableNo:
 *                 type: string
 *                 example: "3"
 *               tableId:
 *                 type: string
 *                 example: "6650abc123def456ghi789"
 *     responses:
 *       201:
 *         description: Request registered successfully
 *       200:
 *         description: Request already exists/pending
 *       400:
 *         description: Bad request
 *   get:
 *     summary: Retrieve assistance requests (Verified users only)
 *     tags: [Assistance]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Requests retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.post("/", createRequest);
router.get("/", isVerifiedUser, getRequests);

/**
 * @swagger
 * /api/assistance/{id}/complete:
 *   patch:
 *     summary: Mark an assistance request as completed (Verified users only)
 *     tags: [Assistance]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The request ID
 *     responses:
 *       200:
 *         description: Request completed successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Request not found
 *   put:
 *     summary: Mark an assistance request as completed (Verified users only)
 *     tags: [Assistance]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The request ID
 *     responses:
 *       200:
 *         description: Request completed successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Request not found
 *   post:
 *     summary: Mark an assistance request as completed (Verified users only)
 *     tags: [Assistance]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The request ID
 *     responses:
 *       200:
 *         description: Request completed successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Request not found
 *   get:
 *     summary: Mark an assistance request as completed (Verified users only)
 *     tags: [Assistance]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The request ID
 *     responses:
 *       200:
 *         description: Request completed successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Request not found
 */
router.patch("/:id/complete", isVerifiedUser, completeRequest);
router.put("/:id/complete", isVerifiedUser, completeRequest);
router.post("/:id/complete", isVerifiedUser, completeRequest);
router.get("/:id/complete", isVerifiedUser, completeRequest);

module.exports = router;
