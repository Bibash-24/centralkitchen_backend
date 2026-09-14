const express = require("express");
const router = express.Router();
const { createCompany, getCompanies, getCompanyBySlug, updateCompany } = require("../../controllers/company/companyController");

router.post("/", createCompany);
router.get("/", getCompanies);
router.get("/:slug", getCompanyBySlug);
router.put("/:slug", updateCompany);

module.exports = router;
