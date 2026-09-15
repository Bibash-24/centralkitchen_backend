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
        const seenNames = new Set();
        let globalLicense = await LicenseConfig.findOne();

        const computeLicenseStatus = (lic, rCfg) => {
            const l = lic || globalLicense || {};
            const isTrial = l.isTrialActive !== undefined ? l.isTrialActive : true;
            const isActivated = l.isSystemActivated !== undefined ? l.isSystemActivated : false;
            
            const trialStart = l.trialStartDate || new Date().toISOString().split('T')[0];
            const trialEnd = l.trialEndDate || new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0];
            
            const actStart = l.activationStartDate || trialStart;
            const actEnd = l.activationEndDate || new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0];

            let status = "Inactive / Expired";
            let validFrom = trialStart;
            let validTo = trialEnd;
            let type = "Trial Period";

            if (isActivated) {
                status = "System Activated";
                validFrom = actStart;
                validTo = actEnd;
                type = "Annual Subscription";
            } else if (isTrial) {
                status = "Trial Active";
                validFrom = trialStart;
                validTo = trialEnd;
                type = "Evaluation Trial";
            }

            const yearlyFee = (rCfg && rCfg.yearlyFee !== undefined) ? rCfg.yearlyFee : (l.yearlyFee !== undefined ? l.yearlyFee : 25000);

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

        // 1. Fetch from primary database connection
        const primaryConfigs = await RestaurantConfig.find({});
        primaryConfigs.forEach(cfg => {
            const item = cfg.toObject();
            if (item.name) seenNames.add(item.name);
            const licInfo = computeLicenseStatus(globalLicense, item);

            tenants.push({
                _id: item._id,
                dbSource: mongoose.connection.name || "Primary DB",
                name: item.name || "Unnamed Restaurant",
                contactNumbers: item.contactNumbers || [],
                address: item.address || "N/A",
                panNumber: item.panNumber || "N/A",
                defaultCurrency: item.defaultCurrency || "रु",
                slogan: item.slogan || "",
                enabledModules: item.enabledModules || [],
                licenseStatus: licInfo.status,
                licenseType: licInfo.type,
                validFrom: licInfo.validFrom,
                validTo: licInfo.validTo,
                yearlyFee: licInfo.yearlyFee,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt
            });
        });

        // 2. Scan cluster databases gracefully with fast timeout safety
        try {
            if (mongoose.connection && mongoose.connection.db) {
                const adminDb = mongoose.connection.db.admin();
                const listPromise = adminDb.listDatabases();
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout scanning cluster DBs")), 1000));
                
                const dbs = await Promise.race([listPromise, timeoutPromise]);
                
                for (const dbInfo of (dbs.databases || [])) {
                    if (["admin", "config", "local"].includes(dbInfo.name)) continue;
                    if (dbInfo.name === mongoose.connection.name) continue;

                    try {
                        const targetDb = mongoose.connection.client.db(dbInfo.name);
                        const collections = await targetDb.listCollections({ name: "restaurantconfigs" }).toArray();
                        
                        if (collections.length > 0) {
                            const configs = await targetDb.collection("restaurantconfigs").find({}).toArray();
                            let clusterLic = null;
                            const licCollections = await targetDb.listCollections({ name: "licenseconfigs" }).toArray();
                            if (licCollections.length > 0) {
                                clusterLic = await targetDb.collection("licenseconfigs").findOne({});
                            }

                            configs.forEach(cfg => {
                                if (cfg.name && !seenNames.has(cfg.name)) {
                                    seenNames.add(cfg.name);
                                    const licInfo = computeLicenseStatus(clusterLic || globalLicense, cfg);
                                    tenants.push({
                                        _id: cfg._id,
                                        dbSource: dbInfo.name,
                                        name: cfg.name,
                                        contactNumbers: cfg.contactNumbers || [],
                                        address: cfg.address || "N/A",
                                        panNumber: cfg.panNumber || "N/A",
                                        defaultCurrency: cfg.defaultCurrency || "रु",
                                        slogan: cfg.slogan || "",
                                        enabledModules: cfg.enabledModules || [],
                                        licenseStatus: licInfo.status,
                                        licenseType: licInfo.type,
                                        validFrom: licInfo.validFrom,
                                        validTo: licInfo.validTo,
                                        yearlyFee: licInfo.yearlyFee,
                                        createdAt: cfg.createdAt,
                                        updatedAt: cfg.updatedAt
                                    });
                                }
                            });
                        }
                    } catch (dbErr) {
                        // Skip unaccessible DBs silently
                    }
                }
            }
        } catch (clusterErr) {
            // Cluster DB listing fallback gracefully
        }

        res.status(200).json({
            success: true,
            message: "Active Genvix POS tenant restaurants retrieved successfully!",
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
            }).catch(() => {});
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

module.exports = { superadminLogin, getActiveTenants, getLicenseConfig, updateLicenseConfig };
