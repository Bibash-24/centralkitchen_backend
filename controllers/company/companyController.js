const GlobalModuleConfig = require("../../models/superadmin/globalModuleConfigModel");
const Counter = require("../../models/counter/counterModel");
const RestaurantConfig = require("../../models/restaurant/restaurantModel");
const LicenseConfig = require("../../models/superadmin/licenseModel");
const Company = require("../../models/company/companyModel");
const User = require("../../models/user/userModel");

// Create new incorporated company (Superadmin only)
const createCompany = async (req, res, next) => {
    try {
        const { name, companySlug, contactEmail, contactPhone, enabledModules, enabledSubMenus, adminName, adminPassword, adminPin, licenseStatus, licenseStartDate, licenseEndDate, yearlyFee, orderNoPrefix, counterTicker } = req.body;

        if (!name || !companySlug) {
            return res.status(400).json({ success: false, message: "Company name and company slug are required." });
        }

        // Clean slug: lowercase, replace spaces with hyphens
        const cleanedSlug = String(companySlug).toLowerCase().trim().replace(/\s+/g, "-");

        const existing = await Company.findOne({ companySlug: cleanedSlug });
        if (existing) {
            return res.status(400).json({ success: false, message: "Company slug '" + cleanedSlug + "' is already taken." });
        }

        const actorName = req.user ? (req.user.name || req.user.email || req.user.username || req.user.role) : "Superadmin";

        const finalPrefix = (orderNoPrefix || "CK").trim().toUpperCase();
        const finalTicker = !isNaN(Number(counterTicker)) ? Number(counterTicker) : 1;
        const companyModules = Array.isArray(enabledModules) ? enabledModules : [];
        const companySubMenus = Array.isArray(enabledSubMenus) ? enabledSubMenus : [];

        const newCompany = new Company({
            name,
            companySlug: cleanedSlug,
            contactEmail: contactEmail || "",
            contactPhone: contactPhone || "",
            enabledModules: companyModules,
            enabledSubMenus: companySubMenus,
            orderNoPrefix: finalPrefix,
            counterTicker: finalTicker,
            yearlyFee: Number(yearlyFee) || 0,
            licenseStatus: licenseStatus || "Activated",
            licenseStartDate: licenseStartDate ? new Date(licenseStartDate) : null,
            licenseEndDate: licenseEndDate ? new Date(licenseEndDate) : null,
            createdBy: actorName
        });

        await newCompany.save();

        // Save orderNoPrefix & counterTicker to RestaurantConfig
        await RestaurantConfig.findOneAndUpdate(
            { companySlug: cleanedSlug },
            {
                $set: {
                    companySlug: cleanedSlug,
                    name,
                    enabledModules: companyModules,
                    enabledSubMenus: companySubMenus,
                    orderNoPrefix: finalPrefix,
                    counterTicker: finalTicker,
                    orderCounter: finalTicker
                }
            },
            { upsert: true, new: true }
        );

        // Save counter sequence to Counter collection
        const seqVal = Math.max(0, finalTicker - 1);
        await Counter.findOneAndUpdate(
            { _id: { companySlug: cleanedSlug, seqName: "orderNo" } },
            { $set: { seq: seqVal } },
            { upsert: true, new: true }
        );
        
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
                    name: adminName || name,
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
        const companies = await Company.find({ isDeleted: { $ne: true } }).sort({ createdAt: -1 });
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
        const company = await Company.findOne({ companySlug: String(slug).toLowerCase(), isDeleted: { $ne: true } });
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
        const { name, companySlug, contactEmail, contactPhone, isActive, enabledModules, licenseStatus, licenseStartDate, licenseEndDate, yearlyFee, orderNoPrefix, counterTicker } = req.body;

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
        if (orderNoPrefix !== undefined) company.orderNoPrefix = String(orderNoPrefix).trim().toUpperCase();
        if (counterTicker !== undefined) company.counterTicker = Number(counterTicker);

        await company.save();

        const updatedPrefix = (company.orderNoPrefix || "CK").trim().toUpperCase();
        const updatedTicker = company.counterTicker !== undefined ? Number(company.counterTicker) : 1;

        // Sync RestaurantConfig
        await RestaurantConfig.findOneAndUpdate(
            { companySlug: company.companySlug },
            {
                $set: {
                    companySlug: company.companySlug,
                    name: company.name,
                    orderNoPrefix: updatedPrefix,
                    counterTicker: updatedTicker,
                    orderCounter: updatedTicker
                }
            },
            { upsert: true, new: true }
        );

        // Sync Counter collection
        if (company.counterTicker !== undefined) {
            const seqVal = Math.max(0, updatedTicker - 1);
            await Counter.findOneAndUpdate(
                { _id: { companySlug: company.companySlug, seqName: "orderNo" } },
                { $set: { seq: seqVal } },
                { upsert: true, new: true }
            );
        }

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


// Delete company tenant (Superadmin only)
const deleteCompany = async (req, res, next) => {
    try {
        const { slug } = req.params;
        const cleanSlug = String(slug).toLowerCase().trim();

        let company = await Company.findOne({
            $or: [{ companySlug: cleanSlug }, { _id: cleanSlug.match(/^[0-9a-fA-F]{24}$/) ? cleanSlug : null }],
            isDeleted: { $ne: true }
        });

        if (!company) {
            return res.status(404).json({ success: false, message: "Company tenant not found or already deleted." });
        }

        const actorName = req.user ? (req.user.name || req.user.username) : "Superadmin";
        const oldSlug = company.companySlug;

        company.isDeleted = true;
        company.isActive = false;
        company.deletedBy = actorName;
        company.deletedAt = new Date();
        company.companySlug = `${oldSlug}-deleted-${Date.now()}`;
        await company.save();

        // Mark associated users as deleted
        const rootSlug = oldSlug.replace(/-deleted-\d+$/, '');
        const userSlugRegex = new RegExp('^' + rootSlug + '(-deleted-\\d+)?$', 'i');
        const usersToClean = await User.find({
            $or: [
                { companySlug: oldSlug },
                { companySlug: userSlugRegex }
            ],
            isDeleted: { $ne: true }
        });
        for (const u of usersToClean) {
            u.isDeleted = true;
            u.companySlug = company.companySlug;
            const uniqueSuffix = 'deleted-' + Date.now() + '-' + Math.floor(Math.random()*1000);
            if (u.email) u.email = uniqueSuffix + '-' + u.email;
            if (u.phone) u.phone = null;
            u.deletedBy = actorName;
            u.deletedOn = new Date();
            await u.save();
        }

        // Clean up LicenseConfig
        try {
            const LicenseConfig = require("../../models/company/licenseConfigModel");
            await LicenseConfig.deleteOne({ companySlug: oldSlug });
        } catch (ignore) {}

        res.status(200).json({
            success: true,
            message: `Company '${company.name}' and all associated user accounts deleted successfully.`
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    createCompany,
    getCompanies,
    getCompanyBySlug,
    updateCompany,
    deleteCompany
};
