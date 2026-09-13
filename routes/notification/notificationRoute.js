const express = require("express");
const {
    getNotifications,
    markRead,
    markAllRead,
    deleteNotification,
    clearAllNotifications
} = require("../../controllers/notification/notificationController");
const { isVerifiedUser } = require("../../middlewares/tokenVerification");
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: Real-time order and waiter request notification management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Notification:
 *       type: object
 *       required:
 *         - type
 *         - title
 *         - message
 *         - targetId
 *       properties:
 *         id:
 *           type: string
 *           description: MongoDB object ID
 *         type:
 *           type: string
 *           enum: [order, assistance]
 *         title:
 *           type: string
 *         message:
 *           type: string
 *         targetId:
 *           type: string
 *           description: The target Order ID or Assistance Request ID
 *         isRead:
 *           type: boolean
 *           default: false
 *         createdAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/notification:
 *   get:
 *     summary: Retrieve notifications list (Verified users only)
 *     tags: [Notifications]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Notifications retrieved successfully
 *       401:
 *         description: Unauthorized
 *   delete:
 *     summary: Clear all notifications logs (Verified users only)
 *     tags: [Notifications]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: All notifications cleared successfully
 *       401:
 *         description: Unauthorized
 */
router.get("/", isVerifiedUser, getNotifications);
router.delete("/", isVerifiedUser, clearAllNotifications);

/**
 * @swagger
 * /api/notification/read-all:
 *   put:
 *     summary: Mark all notifications as read (Verified users only)
 *     tags: [Notifications]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read successfully
 *       401:
 *         description: Unauthorized
 */
router.put("/read-all", isVerifiedUser, markAllRead);

/**
 * @swagger
 * /api/notification/{id}/read:
 *   put:
 *     summary: Toggle read/unread status for a specific notification (Verified users only)
 *     tags: [Notifications]
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
 *         description: Status updated successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Notification not found
 */
router.put("/:id/read", isVerifiedUser, markRead);
router.patch("/:id/read", isVerifiedUser, markRead);
router.post("/:id/read", isVerifiedUser, markRead);

/**
 * @swagger
 * /api/notification/{id}:
 *   delete:
 *     summary: Delete a specific notification log (Verified users only)
 *     tags: [Notifications]
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
 *         description: Notification deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Notification not found
 */
router.delete("/:id", isVerifiedUser, deleteNotification);

module.exports = router;
