const express = require("express");
const router = express.Router();
const { printWiFiThermal } = require("../../controllers/print/printController");
const { isVerifiedUser } = require("../../middlewares/tokenVerification");

router.post("/wifi", isVerifiedUser, printWiFiThermal);

module.exports = router;
