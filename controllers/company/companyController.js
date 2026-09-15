const LicenseConfig = require("../../models/superadmin/licenseModel");
const Company = require("../../models/company/companyModel");
const User = require("../../models/user/userModel");

// Create new incorporated company (Superadmin only)
const createCompany = async (req, res, next) => {
    try {
        const { name, companySlug, contactEmail, contactPhone, enabledModules, adminName, adminPassword, adminPin, licenseStatus, licenseStartDate, licenseEndDate, yearlyFee } = req.body;

        if (!name || !companySlug) {
            return res.status(400).json({ success: false, message: "Company name and company slug are required." });
        }

        // Clean slug: lowercase, replace spaces with hyphens
        const cleanedSlug = String(companySlug).toLowerCase().trim().replace(/\s+/g, "-");

        const existing = await Company.findOne({ companySlug: cleanedSlug });
        if (existing) {
            return res.status(400).json({ success: false, message: "Company slug '" + cleanedSlug + "' is already taken." });
        }

        const actorName = req.user ? (req.user.name || req.user.username) : "Superadmin";

        const newCompany = new Company({
            name,
            companySlug: cleanedSlug,
            contactEmail: contactEmail || "",
            contactPhone: contactPhone || "",
            enabledModules: Array.isArray(enabledModules) ? enabledModules : [],
            yearlyFee: Number(yearlyFee) || 0,
            licenseStatus: licenseStatus || "Activated",
            licenseStartDate: licenseStartDate ? new Date(licenseStartDate) : null,
            licenseEndDate: licenseEndDate ? new Date(licenseEndDate) : null,
            createdBy: actorName
        });

        await newCompany.save();
        
        // Save slug-wise LicenseConfig document in DB
        await LicenseConfig.findOneAndUpdate(
            { companySlug: cleanedSlug },
            {
                companySlug: cleanedSlug,
                isTrialActive: (licenseStatus === "Trial"),
                trialStartDate: licenseStartDate || undefined,
                trialEndDate: licenseEndDate || undefined,
                isSystemActivated: (licenseStatus === "Activated"),
                activationStartDate: licenseStartDate || undefined,
                activationEndDate: licenseEndDate || undefined,
                yearlyFee: Number(yearlyFee) || 0
            },
            { upsert: true, new: true }
        );

        // Create initial Admin user account for this company if login details provided
        let createdAdmin = null;
        if (contactEmail && contactPhone && adminPassword) {
            const cleanEmail = String(contactEmail).toLowerCase().trim();
            const cleanPhone = Number(String(contactPhone).replace(/\D/g, ""));

            const existingUser = await User.findOne({
                $or: [{ email: cleanEmail }, { phone: cleanPhone }],
                isDeleted: { $ne: true }
            });

            if (!existingUser && !isNaN(cleanPhone) && String(cleanPhone).length === 10) {
                const newAdmin = new User({
                    name: adminName || (name + " Admin"),
                    email: cleanEmail,
                    phone: cleanPhone,
                    password: adminPassword,
                    pin: adminPin || undefined,
                    role: "Admin",
                    companySlug: cleanedSlug,
                    isApproved: "approved",
                    createdBy: actorName
                });
                await newAdmin.save();
                createdAdmin = {
                    name: newAdmin.name,
                    email: newAdmin.email,
                    phone: newAdmin.phone,
                    role: newAdmin.role
                };
            }
        }

        res.status(201).json({
            success: true,
            message: "Company '" + name + "' (" + cleanedSlug + ") incorporated successfully!" + (createdAdmin ? " Initial Admin login account created." : ""),
            data: newCompany,
            initialAdmin: createdAdmin
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
        const { name, companySlug, contactEmail, contactPhone, isActive, enabledModules, licenseStatus, licenseStartDate, licenseEndDate, yearlyFee } = req.body;

        const company = await Company.findOne({ companySlug: String(slug).toLowerCase() });
        if (!company) {
            return res.status(404).json({ success: false, message: "Company tenant not found" });
        }

        const oldSlug = company.companySlug;

        // If companySlug is being updated, verify uniqueness and sync associated user records
        if (companySlug && String(companySlug).toLowerCase().trim() !== oldSlug) {
            const newSlugClean = String(companySlug).toLowerCase().trim().replace(/\s+/g, "-");
            if (!/^[a-z0-9-]+$/.test(newSlugClean)) {
                return res.status(400).json({ success: false, message: "Company slug tag can only contain lowercase letters, numbers, and hyphens." });
            }

            const existing = await Company.findOne({ companySlug: newSlugClean, _id: { $ne: company._id } });
            if (existing) {
                return res.status(400).json({ success: false, message: "Company slug tag '" + newSlugClean + "' is already in use by another company." });
            }

            // Sync user model companySlug
            await User.updateMany({ companySlug: oldSlug, role: { $ne: "Superadmin" } }, { companySlug: newSlugClean });
            company.companySlug = newSlugClean;
        }

        if (name) company.name = name;
        if (contactEmail !== undefined) company.contactEmail = contactEmail;
        if (contactPhone !== undefined) company.contactPhone = contactPhone;
        if (isActive !== undefined) company.isActive = Boolean(isActive);
        if (Array.isArray(enabledModules)) company.enabledModules = enabledModules;
        if (yearlyFee !== undefined) company.yearlyFee = Number(yearlyFee) || 0;
        if (licenseStatus) company.licenseStatus = licenseStatus;
        if (licenseStartDate !== undefined) company.licenseStartDate = licenseStartDate ? new Date(licenseStartDate) : null;
        if (licenseEndDate !== undefined) company.licenseEndDate = licenseEndDate ? new Date(licenseEndDate) : null;

        await company.save();

        // Update slug-wise LicenseConfig document in DB
        await LicenseConfig.findOneAndUpdate(
            { companySlug: company.companySlug },
            {
                companySlug: company.companySlug,
                isTrialActive: (company.licenseStatus === "Trial"),
                trialStartDate: company.licenseStartDate ? company.licenseStartDate.toISOString().split('T')[0] : undefined,
                trialEndDate: company.licenseEndDate ? company.licenseEndDate.toISOString().split('T')[0] : undefined,
                isSystemActivated: (company.licenseStatus === "Activated"),
                activationStartDate: company.licenseStartDate ? company.licenseStartDate.toISOString().split('T')[0] : undefined,
                activationEndDate: company.licenseEndDate ? company.licenseEndDate.toISOString().split('T')[0] : undefined,
                yearlyFee: Number(company.yearlyFee) || 0
            },
            { upsert: true, new: true }
        );

        res.status(200).json({
            success: true,
            message: "Company '" + company.name + "' (" + company.companySlug + ") updated successfully!",
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
