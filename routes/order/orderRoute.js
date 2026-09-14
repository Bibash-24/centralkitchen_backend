const express = require("express");
const router = express.Router();
const { createDeliveryOrder, getDeliveryOrders, updateDeliveryStatus, assignRider } = require("../../controllers/order/orderController");

router.post("/", createDeliveryOrder);
router.get("/", getDeliveryOrders);
router.patch("/:id/status", updateDeliveryStatus);
router.patch("/:id/assign-rider", assignRider);

module.exports = router;
