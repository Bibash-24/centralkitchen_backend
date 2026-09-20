const GlobalModuleConfig = require("../../models/superadmin/globalModuleConfigModel");
const Company = require("../../models/company/companyModel");
const LicenseConfig = require("../../models/superadmin/licenseModel");
const Superadmin = require("../../models/superadmin/superadminModel");
const RestaurantConfig = require("../../models/restaurant/restaurantModel");
const mongoose = require("mongoose");
const createHttpError = require("http-errors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const config = require("../../config/config");

const superadminLogin = async (req, res, next) => {
    try {
        const { email, password, pin } = req.body || {};
        const inputCred = email || req.body.phone;

        if (!inputCred || (!password && !pin)) {
            const error = createHttpError(400, "Email/phone and credentials (password or PIN) are required!");
            return next(error);
        }

        const credentialStr = String(inputCred).trim();
        const isEmail = /\S+@\S+\.\S+/.test(credentialStr);
        const cleanedPhone = Number(credentialStr.replace(/\D/g, "")) || 0;

        const query = isEmail
            ? { email: credentialStr.toLowerCase() }
            : { $or: [{ phone: cleanedPhone }, { email: credentialStr.toLowerCase() }] };

        const user = await Superadmin.findOne(query);
        if (!user) {
            const error = createHttpError(401, "Invalid Superadmin Credentials");
            return next(error);
        }

        const authSecret = password || pin;
        let isMatch = await bcrypt.compare(String(authSecret), user.password);

        // Fallback: Check if matches PIN code
        if (!isMatch && user.pin) {
            const isPinMatch = await bcrypt.compare(String(authSecret), user.pin);
            if (isPinMatch || String(user.pin) === String(authSecret)) {
                isMatch = true;
            }
        }

        if (!isMatch) {
            const error = createHttpError(401, "Invalid Superadmin Credentials");
            return next(error);
        }

        const accessToken = jwt.sign({ _id: user._id, role: user.role }, config.accessTokenSecret, {
            expiresIn: '1d'
        });

        const isProd = process.env.NODE_ENV === 'production';
        res.cookie('accessToken', accessToken, {
            maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
            httpOnly: true,
            sameSite: isProd ? 'none' : 'lax',
            secure: isProd
        });

        const userData = user.toObject();
        delete userData.password;
        delete userData.__v;

        return res.status(200).json({
            success: true,
            message: "Superadmin logged in successfully!",
            data: {
                user: userData,
                accessToken
            }
        });
    } catch (error) {
        next(error);
    }
};

// Fetch details of all active tenant restaurants across cluster DBs with License details
const getActiveTenants = async (req, res, next) => {
    try {
        const tenants = [];
        let globalLicense = await LicenseConfig.findOne();
        const primaryConfigs = await RestaurantConfig.find({});
        const configMap = new Map();
        primaryConfigs.forEach(c => {
            if (c.slug) configMap.set(c.slug.toLowerCase(), c);
            if (c.name) configMap.set(c.name.toLowerCase(), c);
        });

        const companies = await Company.find({}).sort({ createdAt: -1 });

        const computeLicenseStatus = (comp, lic, rCfg) => {
            const statusType = comp.licenseStatus || "Activated";
            const isActivated = statusType === "Activated";
            const isTrial = statusType === "Trial";

            const trialStart = comp.licenseStartDate ? new Date(comp.licenseStartDate).toISOString().split('T')[0] : (lic?.trialStartDate || new Date().toISOString().split('T')[0]);
            const trialEnd = comp.licenseEndDate ? new Date(comp.licenseEndDate).toISOString().split('T')[0] : (lic?.trialEndDate || new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0]);

            const actStart = comp.licenseStartDate ? new Date(comp.licenseStartDate).toISOString().split('T')[0] : (lic?.activationStartDate || trialStart);
            const actEnd = comp.licenseEndDate ? new Date(comp.licenseEndDate).toISOString().split('T')[0] : (lic?.activationEndDate || new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0]);

            let status = "Inactive / Expired";
            let validFrom = trialStart;
            let validTo = trialEnd;
            let type = "Trial Period";

            if (isActivated && comp.isActive !== false) {
                status = "System Activated";
                validFrom = actStart;
                validTo = actEnd;
                type = "Annual Subscription";
            } else if (isTrial && comp.isActive !== false) {
                status = "Trial Active";
                validFrom = trialStart;
                validTo = trialEnd;
                type = "Evaluation Trial";
            }

            const yearlyFee = comp.yearlyFee !== undefined ? comp.yearlyFee : ((rCfg && rCfg.yearlyFee !== undefined) ? rCfg.yearlyFee : (lic?.yearlyFee !== undefined ? lic.yearlyFee : 25000));

            return {
                status,
                type,
                validFrom,
                validTo,
                isTrialActive: isTrial,
                isSystemActivated: isActivated,
                yearlyFee
            };
        };

        companies.forEach(comp => {
            const rCfg = configMap.get(comp.companySlug.toLowerCase()) || configMap.get(comp.name.toLowerCase());
            const licInfo = computeLicenseStatus(comp, globalLicense, rCfg);

            tenants.push({
                _id: comp._id,
                companySlug: comp.companySlug,
                name: comp.name,
                contactEmail: comp.contactEmail || "N/A",
                contactPhone: comp.contactPhone || "",
                contactNumbers: comp.contactPhone ? [comp.contactPhone] : (rCfg?.contactNumbers || []),
                address: comp.address || rCfg?.address || "N/A",
                panNumber: comp.panNumber || rCfg?.panNumber || "N/A",
                defaultCurrency: comp.defaultCurrency || rCfg?.defaultCurrency || "रु",
                openingTime: comp.openingTime || rCfg?.openingTime || "08:00 AM",
                closingTime: comp.closingTime || rCfg?.closingTime || "09:00 PM",
                isVatApplicable: comp.isVatApplicable !== undefined ? comp.isVatApplicable : (rCfg?.isVatApplicable !== false),
                logo: comp.logo || rCfg?.logo || "",
                paymentQrCode: comp.paymentQrCode || rCfg?.paymentQrCode || "",
                slogan: rCfg?.slogan || ("/" + comp.companySlug),
                enabledModules: comp.enabledModules || (rCfg?.enabledModules || []),
                licenseStatus: licInfo.status,
                licenseType: licInfo.type,
                validFrom: licInfo.validFrom,
                validTo: licInfo.validTo,
                yearlyFee: licInfo.yearlyFee,
                isActive: comp.isActive !== false,
                createdAt: comp.createdAt,
                updatedAt: comp.updatedAt
            });
        });

        res.status(200).json({
            success: true,
            message: "Active DeliGati tenants retrieved successfully!",
            count: tenants.length,
            data: tenants
        });
    } catch (error) {
        next(error);
    }
};

const getLicenseConfig = async (req, res, next) => {
    try {
        const userSlug = req.user?.companySlug || req.headers["x-company-slug"];
        let config = null;
        if (userSlug && req.user?.role !== "Superadmin") {
            config = await LicenseConfig.findOne({ companySlug: userSlug });
        }
        if (!config) {
            config = await LicenseConfig.findOne();
        }
        res.status(200).json({
            success: true,
            message: "License configuration retrieved successfully!",
            data: config
        });
    } catch (error) {
        next(error);
    }
};

const updateLicenseConfig = async (req, res, next) => {
    try {
        const {
            isTrialActive,
            trialStartDate,
            trialEndDate,
            isSystemActivated,
            activationStartDate,
            activationEndDate,
            yearlyFee,
            restaurantId
        } = req.body || {};

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
        let config = await LicenseConfig.findOne();
        if (!config) {
            config = new LicenseConfig({ createdBy: actorName });
        }

        if (isTrialActive !== undefined) config.isTrialActive = isTrialActive;
        if (trialStartDate !== undefined) config.trialStartDate = trialStartDate;
        if (trialEndDate !== undefined) config.trialEndDate = trialEndDate;
        if (isSystemActivated !== undefined) config.isSystemActivated = isSystemActivated;
        if (activationStartDate !== undefined) config.activationStartDate = activationStartDate;
        if (activationEndDate !== undefined) config.activationEndDate = activationEndDate;
        if (yearlyFee !== undefined) config.yearlyFee = Number(yearlyFee);

        config.updatedBy = actorName;
        config.updatedOn = new Date();

        await config.save();

        // Also update specific restaurantConfig yearlyFee if restaurantId is provided
        if (restaurantId && yearlyFee !== undefined) {
            await RestaurantConfig.findByIdAndUpdate(restaurantId, {
                yearlyFee: Number(yearlyFee),
                updatedBy: actorName,
                updatedOn: new Date()
            }).catch(() => { });
        }

        res.status(200).json({
            success: true,
            message: "System license and yearly fee updated successfully!",
            data: config
        });
    } catch (error) {
        next(error);
    }
};


const getGlobalModules = async (req, res, next) => {
    try {
        let config = await GlobalModuleConfig.findOne({ key: "global_modules_config" });
        if (!config) {
            config = await GlobalModuleConfig.create({ key: "global_modules_config" });
        }
        res.status(200).json({
            success: true,
            message: "Global module configuration retrieved successfully!",
            data: config
        });
    } catch (error) {
        next(error);
    }
};

const updateGlobalModules = async (req, res, next) => {
    try {
        const { enabledModules, enabledSubMenus } = req.body || {};
        const actorName = req.user?.email || req.user?.name || "Superadmin";

        let config = await GlobalModuleConfig.findOneAndUpdate(
            { key: "global_modules_config" },
            {
                $set: {
                    ...(Array.isArray(enabledModules) ? { enabledModules } : {}),
                    ...(Array.isArray(enabledSubMenus) ? { enabledSubMenus } : {}),
                    updatedBy: actorName
                }
            },
            { upsert: true, returnDocument: 'after' }
        );

        res.status(200).json({
            success: true,
            message: "Global system modules updated successfully in dedicated collection!",
            data: config
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { getGlobalModules, updateGlobalModules,  superadminLogin, getActiveTenants, getLicenseConfig, updateLicenseConfig };
