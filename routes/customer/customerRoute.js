const express = require("express");
const router = express.Router();
const { getCustomers, createCustomer, updateCustomer, deleteCustomer, recordPayment } = require("../../controllers/customer/customerController");
const { isVerifiedUser } = require("../../middlewares/tokenVerification");

router.get("/", isVerifiedUser, getCustomers);
router.post("/", isVerifiedUser, createCustomer);
router.put("/:id", isVerifiedUser, updateCustomer);
router.delete("/:id", isVerifiedUser, deleteCustomer);
router.patch("/:id/pay", isVerifiedUser, recordPayment);

module.exports = router;
