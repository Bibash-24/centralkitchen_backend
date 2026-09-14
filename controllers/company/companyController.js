const Company = require("../../models/company/companyModel");

// Create new incorporated company (Superadmin only)
const createCompany = async (req, res, next) => {
    try {
        const { name, companySlug, contactEmail, contactPhone, enabledModules } = req.body;

        if (!name || !companySlug) {
            return res.status(400).json({ success: false, message: "Company name and company slug are required." });
        }

        // Clean slug: lowercase, replace spaces with hyphens
        const cleanedSlug = String(companySlug).toLowerCase().trim().replace(/\s+/g, "-");

        const existing = await Company.findOne({ companySlug: cleanedSlug });
        if (existing) {
            return res.status(400).json({ success: false, message: `Company slug '${cleanedSlug}' is already taken.` });
        }

        const actorName = req.user ? (req.user.name || req.user.username) : "Superadmin";

        const newCompany = new Company({
            name,
            companySlug: cleanedSlug,
            contactEmail: contactEmail || "",
            contactPhone: contactPhone || "",
            enabledModules: Array.isArray(enabledModules) ? enabledModules : [],
            createdBy: actorName
        });

        await newCompany.save();

        res.status(201).json({
            success: true,
            message: `Company '${name}' (${cleanedSlug}) incorporated successfully!`,
            data: newCompany
        });
    } catch (err) {
        next(err);
    }
};

// Get all incorporated companies (Superadmin only)
const getCompanies = async (req, res, next) => {
    try {
        const companies = await Company.find().sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            data: companies
        });
    } catch (err) {
        next(err);
    }
};

// Get single company by companySlug
const getCompanyBySlug = async (req, res, next) => {
    try {
        const { slug } = req.params;
        const company = await Company.findOne({ companySlug: String(slug).toLowerCase() });
        if (!company) {
            return res.status(404).json({ success: false, message: "Company not found" });
        }
        res.status(200).json({
            success: true,
            data: company
        });
    } catch (err) {
        next(err);
    }
};


// Update incorporated company details (Superadmin only)
const updateCompany = async (req, res, next) => {
    try {
        const { slug } = req.params;
        const { name, contactEmail, contactPhone, isActive, enabledModules } = req.body;

        const company = await Company.findOne({ companySlug: String(slug).toLowerCase() });
        if (!company) {
            return res.status(404).json({ success: false, message: "Company tenant not found" });
        }

        if (name) company.name = name;
        if (contactEmail !== undefined) company.contactEmail = contactEmail;
        if (contactPhone !== undefined) company.contactPhone = contactPhone;
        if (isActive !== undefined) company.isActive = Boolean(isActive);
        if (Array.isArray(enabledModules)) company.enabledModules = enabledModules;

        await company.save();

        res.status(200).json({
            success: true,
            message: `Company '${company.name}' (${company.companySlug}) updated successfully!`,
            data: company
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    createCompany,
    getCompanies,
    getCompanyBySlug,
    updateCompany
};


