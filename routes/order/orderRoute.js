const { isVerifiedUser } = require("../../middlewares/tokenVerification");
const express = require("express");
const router = express.Router();
const { createDeliveryOrder, getDeliveryOrders, updateDeliveryStatus, assignRider } = require("../../controllers/order/orderController");

/**
 * @swagger
 * components:
 *   schemas:
 *     OrderItem:
 *       type: object
 *       required:
 *         - menuItemId
 *         - name
 *         - quantity
 *         - price
 *       properties:
 *         menuItemId:
 *           type: string
 *           example: 64e21a8f9b1c2d3e4f5a6b7c
 *         name:
 *           type: string
 *           example: Chicken Momo (Full)
 *         quantity:
 *           type: integer
 *           example: 2
 *         price:
 *           type: number
 *           example: 250
 *         notes:
 *           type: string
 *           example: Extra spicy red chutney
 * 
 *     OrderTimeline:
 *       type: object
 *       properties:
 *         action:
 *           type: string
 *           example: Status changed to Out for Delivery
 *         status:
 *           type: string
 *           example: Out for Delivery
 *         timestamp:
 *           type: string
 *           format: date-time
 *         user:
 *           type: string
 *           example: Kitchen Manager
 *         notes:
 *           type: string
 *           example: Rider phone 9801234567
 * 
 *     DeliveryOrder:
 *       type: object
 *       required:
 *         - recipientName
 *         - recipientPhone
 *         - deliveryAddress
 *         - items
 *       properties:
 *         _id:
 *           type: string
 *           example: 64e21a8f9b1c2d3e4f5a6b7c
 *         orderNo:
 *           type: string
 *           example: CK-0001
 *         recipientName:
 *           type: string
 *           example: Ram Shrestha
 *         recipientPhone:
 *           type: string
 *           example: "9801234567"
 *         deliveryAddress:
 *           type: string
 *           example: Thamel, Ward 26, Kathmandu
 *         notes:
 *           type: string
 *           example: Call on arrival
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/OrderItem'
 *         totalAmount:
 *           type: number
 *           example: 500
 *         paymentMethod:
 *           type: string
 *           enum: ["Cash on Delivery", "Online / Transfer", "Credit / Account", "Prepaid"]
 *           example: Cash on Delivery
 *         paymentStatus:
 *           type: string
 *           enum: ["Pending", "Paid", "Partially Paid", "Cancelled"]
 *           example: Pending
 *         deliveryStatus:
 *           type: string
 *           enum: ["Created", "Preparing", "Ready for Dispatch", "Out for Delivery", "Delivered", "Cancelled"]
 *           example: Created
 *         rider:
 *           type: object
 *           properties:
 *             staffId:
 *               type: string
 *               example: 64e21a8f9b1c2d3e4f5a6b8d
 *             name:
 *               type: string
 *               example: Hari Bahadur
 *             phone:
 *               type: string
 *               example: "9841000000"
 *             assignedAt:
 *               type: string
 *               format: date-time
 *         timeline:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/OrderTimeline'
 *         createdBy:
 *           type: string
 *           example: Kitchen Staff
 *         updatedBy:
 *           type: string
 *           example: Kitchen Staff
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/orders:
 *   post:
 *     summary: Create a new delivery order
 *     tags: [Delivery Orders]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - recipientName
 *               - recipientPhone
 *               - deliveryAddress
 *               - items
 *             properties:
 *               recipientName:
 *                 type: string
 *                 example: Ram Shrestha
 *               recipientPhone:
 *                 type: string
 *                 example: "9801234567"
 *               deliveryAddress:
 *                 type: string
 *                 example: Thamel, Ward 26, Kathmandu
 *               notes:
 *                 type: string
 *                 example: Call upon arrival
 *               paymentMethod:
 *                 type: string
 *                 enum: ["Cash on Delivery", "Online / Transfer", "Credit / Account", "Prepaid"]
 *                 example: Cash on Delivery
 *               items:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/OrderItem'
 *     responses:
 *       201:
 *         description: Delivery order created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Delivery order created successfully
 *                 data:
 *                   $ref: '#/components/schemas/DeliveryOrder'
 *       400:
 *         description: Missing required fields or empty items list
 * 
 *   get:
 *     summary: Retrieve delivery orders with status filtering & search query
 *     tags: [Delivery Orders]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by delivery status (e.g. Created, Preparing, Out for Delivery, Delivered)
 *         example: Out for Delivery
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Text search across orderNo, recipientName, phone, or address
 *         example: CK-0001
 *     responses:
 *       200:
 *         description: List of matching delivery orders
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/DeliveryOrder'
 */

/**
 * @swagger
 * /api/orders/{id}/status:
 *   patch:
 *     summary: Update delivery status of an order
 *     tags: [Delivery Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Delivery Order MongoDB ObjectId
 *         example: 64e21a8f9b1c2d3e4f5a6b7c
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
 *                 enum: ["Created", "Preparing", "Ready for Dispatch", "Out for Delivery", "Delivered", "Cancelled"]
 *                 example: Out for Delivery
 *               notes:
 *                 type: string
 *                 example: Package handed over to delivery rider
 *     responses:
 *       200:
 *         description: Order delivery status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Order status updated to Out for Delivery
 *                 data:
 *                   $ref: '#/components/schemas/DeliveryOrder'
 *       400:
 *         description: Invalid status string
 *       404:
 *         description: Delivery order not found
 */

/**
 * @swagger
 * /api/orders/{id}/assign-rider:
 *   patch:
 *     summary: Assign a delivery rider or staff member to order
 *     tags: [Delivery Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Delivery Order MongoDB ObjectId
 *         example: 64e21a8f9b1c2d3e4f5a6b7c
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - staffId
 *             properties:
 *               staffId:
 *                 type: string
 *                 description: Rider Staff MongoDB ObjectId
 *                 example: 64e21a8f9b1c2d3e4f5a6b8d
 *     responses:
 *       200:
 *         description: Rider assigned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Rider Hari Bahadur assigned to order CK-0001
 *                 data:
 *                   $ref: '#/components/schemas/DeliveryOrder'
 *       404:
 *         description: Order or Staff member not found
 */

router.post("/", isVerifiedUser, createDeliveryOrder);
router.get("/", isVerifiedUser, getDeliveryOrders);
router.patch("/:id/status", isVerifiedUser, updateDeliveryStatus);
router.patch("/:id/assign-rider", isVerifiedUser, assignRider);

module.exports = router;
