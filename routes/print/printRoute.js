const express = require("express");
const router = express.Router();
const { printWiFiThermal } = require("../../controllers/print/printController");
const { isVerifiedUser } = require("../../middlewares/tokenVerification");

/**
 * @swagger
 * components:
 *   schemas:
 *     WiFiPrintPayload:
 *       type: object
 *       required:
 *         - printerIp
 *         - base64Payload
 *       properties:
 *         printerIp:
 *           type: string
 *           description: IPv4 network address of thermal receipt printer
 *           example: 192.168.1.200
 *         port:
 *           type: integer
 *           description: Network port (default 9100 for ESC/POS network printing)
 *           example: 9100
 *         base64Payload:
 *           type: string
 *           description: Raw ESC/POS thermal command bytes encoded as base64 string
 *           example: "G0FBQ0RFRkdISUpL..."
 */

/**
 * @swagger
 * /api/print/wifi:
 *   post:
 *     summary: Dispatch raw ESC/POS payload to network thermal printer over TCP socket
 *     tags: [Thermal Printing]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WiFiPrintPayload'
 *     responses:
 *       200:
 *         description: Print job dispatched successfully to thermal printer
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
 *                   example: ESC/POS receipt payload dispatched to 192.168.1.200:9100
 *       400:
 *         description: Invalid printer IP or missing payload
 *       500:
 *         description: Thermal printer connection socket error
 */

router.post("/wifi", isVerifiedUser, printWiFiThermal);

module.exports = router;
