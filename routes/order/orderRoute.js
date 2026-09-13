const express = require("express");
const { addOrder, getOrders, getOrderById, updateOrder, switchTable } = require("../../controllers/order/orderController");
const { isVerifiedUser } = require("../../middlewares/tokenVerification");
const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Order:
 *       type: object
 *       required:
 *         - customerDetails
 *         - orderStatus
 *         - bills
 *       properties:
 *         customerDetails:
 *           type: object
 *           required:
 *             - guests
 *           properties:
 *             guests:
 *               type: number
 *         orderStatus:
 *           type: string
 *         orderType:
 *           type: string
 *           enum: [Dine In, Takeaway]
 *         bills:
 *           type: object
 *           required:
 *             - total
 *             - tax
 *             - totalWithTax
 *           properties:
 *             total:
 *               type: number
 *             discount:
 *               type: number
 *             tax:
 *               type: number
 *             totalWithTax:
 *               type: number
 *             receivedAmount:
 *               type: number
 *               description: Cash amount received from client during checkout
 *         items:
 *           type: array
 *           items:
 *             type: object
 *         table:
 *           type: string
 *           description: ObjectId of Table
 *         paymentMethod:
 *           type: string
 *         paymentType:
 *           type: string
 *         orderNo:
 *           type: number
 *         accumulatedCabinCharge:
 *           type: number
 *         timeline:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               action:
 *                 type: string
 *               details:
 *                 type: string
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *               user:
 *                 type: string
 */

/**
 * @swagger
 * /api/order:
 *   post:
 *     summary: Create a new order
 *     tags: [Orders]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Order'
 *     responses:
 *       201:
 *         description: Order created successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *   get:
 *     summary: Retrieve all orders
 *     tags: [Orders]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Orders retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.route("/").post(isVerifiedUser, addOrder);
router.route("/").get(isVerifiedUser, getOrders);

/**
 * @swagger
 * /api/order/guest:
 *   post:
 *     summary: Create a new order by guest (Public QR Code)
 *     tags: [Orders]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Order'
 *     responses:
 *       201:
 *         description: Guest order created successfully
 *       400:
 *         description: Bad request
 */
router.route("/guest").post(addOrder);

/**
 * @swagger
 * /api/order/{id}:
 *   get:
 *     summary: Get order by ID
 *     tags: [Orders]
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
 *         description: Order retrieved successfully
 *       404:
 *         description: Order not found
 *       401:
 *         description: Unauthorized
 *   put:
 *     summary: Update order details or complete checkout
 *     tags: [Orders]
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
 *               orderStatus:
 *                 type: string
 *               paymentMethod:
 *                 type: string
 *               paymentType:
 *                 type: string
 *               tableStatus:
 *                 type: string
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *               bills:
 *                 type: object
 *                 properties:
 *                   total:
 *                     type: number
 *                   discount:
 *                     type: number
 *                   tax:
 *                     type: number
 *                   totalWithTax:
 *                     type: number
 *                   receivedAmount:
 *                     type: number
 *     responses:
 *       200:
 *         description: Order updated successfully
 *       400:
 *         description: Received amount is less than total bill / Bad request
 *       404:
 *         description: Order not found
 *       401:
 *         description: Unauthorized
 */
router.route("/:id").get(isVerifiedUser, getOrderById);
router.route("/:id").put(isVerifiedUser, updateOrder);
router.route("/:id").patch(isVerifiedUser, updateOrder);
router.route("/:id").post(isVerifiedUser, updateOrder);

/**
 * @swagger
 * /api/order/switch-table:
 *   post:
 *     summary: Switch active order to another empty table
 *     tags: [Orders]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderId
 *               - targetTableId
 *             properties:
 *               orderId:
 *                 type: string
 *               targetTableId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Table switched successfully
 *       400:
 *         description: Bad request / Target table occupied
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Order or target table not found
 */
router.route("/switch-table").post(isVerifiedUser, switchTable);

module.exports = router;