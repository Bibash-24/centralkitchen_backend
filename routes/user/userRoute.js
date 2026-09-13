const express = require("express");
const { 
    register, 
    checkUserExists,
    login, 
    getUserData, 
    logout, 
    getAllUsers, 
    toggleAccess, 
    updateCredentials, 
    updateProfile,
    adminUpdateUser,
    adminResetPassword,
    deleteUser
} = require("../../controllers/user/userController");
const { isVerifiedUser, isAdmin } = require("../../middlewares/tokenVerification");
const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       required:
 *         - name
 *         - email
 *         - phone
 *         - password
 *         - role
 *       properties:
 *         name:
 *           type: string
 *         email:
 *           type: string
 *           format: email
 *         phone:
 *           type: number
 *         password:
 *           type: string
 *         role:
 *           type: string
 *     UserLoginRequest:
 *       type: object
 *       required:
 *         - email
 *       properties:
 *         email:
 *           type: string
 *           description: Email address or 10-digit phone number
 *         password:
 *           type: string
 *         pin:
 *           type: string
 *           description: 4-digit Quick Login PIN
 */


/**
 * @swagger
 * /api/user/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/User'
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Bad request
 */
router.route("/register").post(register);

/**
 * @swagger
 * /api/user/check-exists:
 *   post:
 *     summary: Check if a user already exists in the system
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - contactInfo
 *             properties:
 *               contactInfo:
 *                 type: string
 *                 description: Email address or phone number to check
 *     responses:
 *       200:
 *         description: User status retrieved successfully
 *       400:
 *         description: Bad request
 */
router.route("/check-exists").post(checkUserExists);

/**
 * @swagger
 * /api/user/login:
 *   post:
 *     summary: Log in a user
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserLoginRequest'
 *     responses:
 *       200:
 *         description: User logged in successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Invalid credentials
 */
router.route("/login").post(login);

/**
 * @swagger
 * /api/user/logout:
 *   post:
 *     summary: Log out current user
 *     tags: [Users]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: User logged out successfully
 */
router.route("/logout").post(isVerifiedUser, logout);

/**
 * @swagger
 * /api/user:
 *   get:
 *     summary: Get current user profile data
 *     tags: [Users]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.route("/").get(isVerifiedUser, getUserData);

/**
 * @swagger
 * /api/user/all:
 *   get:
 *     summary: Retrieve all users (Admin only)
 *     tags: [Users]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: All users retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Admin only)
 */
router.route("/all").get(isVerifiedUser, isAdmin, getAllUsers);

/**
 * @swagger
 * /api/user/{id}/toggle-access:
 *   patch:
 *     summary: Toggle system access permissions for a user (Admin only)
 *     tags: [Users]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID
 *     responses:
 *       200:
 *         description: User access status updated successfully
 *       400:
 *         description: Bad request (e.g. self-modification check)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Admin only)
 *       404:
 *         description: User not found
 */
router.route("/:id/toggle-access").patch(isVerifiedUser, isAdmin, toggleAccess);

/**
 * @swagger
 * /api/user/update-credentials:
 *   patch:
 *     summary: Update password and/or Quick Login PIN for the authenticated user
 *     tags: [Users]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               password:
 *                 type: string
 *                 example: "newpassword123"
 *               confirmPassword:
 *                 type: string
 *                 example: "newpassword123"
 *               pin:
 *                 type: string
 *                 example: "4321"
 *               confirmPin:
 *                 type: string
 *                 example: "4321"
 *     responses:
 *       200:
 *         description: Credentials updated successfully
 *       400:
 *         description: Bad request (mismatch, short length, invalid format, or no fields provided)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.route("/update-credentials").patch(isVerifiedUser, updateCredentials);
router.route("/update-profile").patch(isVerifiedUser, updateProfile);
router.route("/:id/admin-update").patch(isVerifiedUser, isAdmin, adminUpdateUser);

/**
 * @swagger
 * /api/user/{id}/admin-reset-password:
 *   patch:
 *     summary: Reset user password to default Reset@12345 (Admin only)
 *     tags: [Users]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Target user ID
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: User not found
 */
router.route("/:id/admin-reset-password").patch(isVerifiedUser, isAdmin, adminResetPassword);

/**
 * @swagger
 * /api/user/{id}:
 *   delete:
 *     summary: Soft delete a user (Admin only)
 *     tags: [Users]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID to delete
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       400:
 *         description: Bad request (e.g. attempting to delete self)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Admin access required)
 *       404:
 *         description: User not found
 */
router.route("/:id").delete(isVerifiedUser, isAdmin, deleteUser);

module.exports = router;