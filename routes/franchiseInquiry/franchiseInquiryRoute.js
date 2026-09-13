const express = require("express");
const router = express.Router();
const {
    submitFranchiseInquiry,
    getFranchiseInquiries,
    updateFranchiseInquiry,
    deleteFranchiseInquiry
} = require("../../controllers/franchiseInquiry/franchiseInquiryController");

// Public Endpoint: Landing page submission
router.post("/", submitFranchiseInquiry);

// Endpoints for Admin CRM View
router.get("/", getFranchiseInquiries);
router.put("/:id", updateFranchiseInquiry);
router.delete("/:id", deleteFranchiseInquiry);

module.exports = router;
