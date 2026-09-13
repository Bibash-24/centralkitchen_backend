const express = require("express");
const { createIssue, getIssues, updateIssueStatus, deleteIssue, clearAllIssues } = require("../../controllers/issue/issueController");
const { isVerifiedUser, isAdmin } = require("../../middlewares/tokenVerification");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Issues
 *   description: System issue reporting and support ticket management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     IssueRequest:
 *       type: object
 *       required:
 *         - title
 *         - description
 *       properties:
 *         title:
 *           type: string
 *           description: Summary title of the issue
 *           example: "Receipt printer not responding during checkout"
 *         category:
 *           type: string
 *           enum: ["Bug / Technical Error", "UI / Display Issue", "Performance / Speed", "Billing / License", "Feature Request", "Other"]
 *           example: "Bug / Technical Error"
 *         priority:
 *           type: string
 *           enum: ["Low", "Medium", "High", "Critical"]
 *           example: "High"
 *         description:
 *           type: string
 *           description: Detailed explanation of the reported issue
 *           example: "When clicking process checkout on Table 4, the receipt printer times out."
 *     IssueResponse:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         title:
 *           type: string
 *         category:
 *           type: string
 *         priority:
 *           type: string
 *         description:
 *           type: string
 *         status:
 *           type: string
 *           example: "Pending"
 *         reporterName:
 *           type: string
 *         reporterEmail:
 *           type: string
 *         restaurantName:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/issue:
 *   post:
 *     summary: Submit a new system issue & notify support@genvixtech.com via email
 *     tags: [Issues]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/IssueRequest'
 *     responses:
 *       201:
 *         description: Issue reported successfully and email sent
 *       400:
 *         description: Bad request (missing title or description)
 *       401:
 *         description: Unauthorized
 *   get:
 *     summary: Retrieve reported issues (User gets their own issues, Admin gets all)
 *     tags: [Issues]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of reported issues
 *       401:
 *         description: Unauthorized
 */
router.route("/")
    .post(isVerifiedUser, createIssue)
    .get(isVerifiedUser, getIssues);

/**
 * @swagger
 * /api/issue/{id}/status:
 *   patch:
 *     summary: Update issue status (Admin / Superadmin only)
 *     tags: [Issues]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The issue ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: ["Pending", "In Progress", "Resolved", "Closed"]
 *                 example: "In Progress"
 *     responses:
 *       200:
 *         description: Issue status updated successfully
 *       400:
 *         description: Invalid status value
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Admin only)
 *       404:
 *         description: Issue not found
 */
/**
 * @swagger
 * /api/issue/clear-all:
 *   delete:
 *     summary: Clear all reported issue records from the database (Admin / Superadmin only)
 *     tags: [Issues]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: All issue records deleted successfully from database
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Admin / Superadmin only)
 */
router.route("/clear-all")
    .delete(isVerifiedUser, isAdmin, clearAllIssues);

/**
 * @swagger
 * /api/issue/{id}:
 *   delete:
 *     summary: Delete a single reported issue by ID (Admin / Superadmin only)
 *     tags: [Issues]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The issue ID to delete
 *     responses:
 *       200:
 *         description: Issue deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Admin / Superadmin only)
 *       404:
 *         description: Issue not found
 */
router.route("/:id")
    .delete(isVerifiedUser, isAdmin, deleteIssue);

/**
 * @swagger
 * /api/issue/{id}/status:
 *   patch:
 *     summary: Update issue status (Admin / Superadmin only)
 *     tags: [Issues]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The issue ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: ["Pending", "In Progress", "Resolved", "Closed"]
 *                 example: "In Progress"
 *     responses:
 *       200:
 *         description: Issue status updated successfully
 *       400:
 *         description: Invalid status value
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Admin only)
 *       404:
 *         description: Issue not found
 */
router.route("/:id/status")
    .patch(isVerifiedUser, isAdmin, updateIssueStatus);

module.exports = router;
