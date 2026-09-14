const express = require("express");
const router = express.Router();
const { createCompany, getCompanies, getCompanyBySlug } = require("../../controllers/company/companyController");

router.post("/", createCompany);
router.get("/", getCompanies);
router.get("/:slug", getCompanyBySlug);

module.exports = router;
