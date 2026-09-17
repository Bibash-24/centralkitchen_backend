const createHttpError = require("http-errors");
const User = require("../../models/user/userModel");
const Superadmin = require("../../models/superadmin/superadminModel");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const config = require("../../config/config");

const register = async (req, res, next) => {
    try {
        const { name, phone, email, password, role, pin, confirmPin, isApproved: reqIsApproved, companySlug: reqCompanySlug } = req.body || {};

        if (!name || !phone || !email || !password) {
            const error = createHttpError(400, "All fields (name, phone, email, password) are required!");
            return next(error);
        }

        const cleanPin = pin ? String(pin).trim() : "";
        const cleanConfirmPin = confirmPin ? String(confirmPin).trim() : "";

        if (cleanPin) {
            if (cleanPin !== cleanConfirmPin) {
                const error = createHttpError(400, "PIN and Confirm PIN do not match!");
                return next(error);
            }
            if (!/^\d{4}$/.test(cleanPin)) {
                const error = createHttpError(400, "PIN code must be a 4-digit number!");
                return next(error);
            }
        }

        const isEmailPresent = await User.findOne({ email, isDeleted: { $ne: true } });
        if (isEmailPresent) {
            const error = createHttpError(400, "User with this email already exists!");
            return next(error);
        }

        const isPhonePresent = await User.findOne({ phone, isDeleted: { $ne: true } });
        if (isPhonePresent) {
            const error = createHttpError(400, "User with this phone number already exists!");
            return next(error);
        }

        const createdBy = (req.user && (req.user.email || req.user.phone)) ? (req.user.email || String(req.user.phone)) : "Self Registered";
        const isApproved = reqIsApproved || (createdBy !== "Self Registered" ? "approved" : "pending");
        const targetCompanySlug = reqCompanySlug || (req.headers && req.headers["x-company-slug"]) || (req.user && req.user.companySlug) || "main-kitchen";
        const newUser = new User({ name: name.trim(), phone, email: email.toLowerCase().trim(), password, role: role || "", companySlug: targetCompanySlug, pin: cleanPin || undefined, createdBy, isApproved });
        await newUser.save();

        // Convert to object and exclude sensitive data
        const userData = newUser.toObject();
        delete userData.password;
        delete userData.__v;

        res.status(201).json({
            success: true,
            message: "User registered successfully!",
            data: userData
        });

    } catch (error) {
        next(error);
    }
}

const checkUserExists = async (req, res, next) => {
    try {
        const { email, phone } = req.body || {};
        const response = { emailExists: false, phoneExists: false };

        if (email) {
            const exists = await User.findOne({ email: email.toLowerCase().trim(), isDeleted: { $ne: true } });
            if (exists) response.emailExists = true;
        }
        if (phone) {
            const cleanedPhone = String(phone).replace(/\D/g, "");
            if (cleanedPhone) {
                const exists = await User.findOne({ phone: Number(cleanedPhone), isDeleted: { $ne: true } });
                if (exists) response.phoneExists = true;
            }
        }

        return res.status(200).json({
            success: true,
            data: response
        });
    } catch (error) {
        next(error);
    }
}

const login = async (req, res, next) => {
    try {
        const { email, password } = req.body || {};

        if (!email || !password) {
            const error = createHttpError(400, "Email/phone and credentials are required!");
            return next(error);
        }

        const isEmail = /\S+@\S+\.\S+/.test(email);
        const query = isEmail ? { email: email.trim().toLowerCase() } : { phone: Number(email.replace(/\D/g, "")) || 0 };

        // Check superadmin database first
        let user = await Superadmin.findOne(query);
        if (!user) {
            // Check standard users database
            user = await User.findOne({ ...query, isDeleted: { $ne: true } });
        }

        if (!user) {
            const error = createHttpError(401, "Invalid Credentials");
            return next(error);
        }

        // Check password first
        const isMatch = await bcrypt.compare(password, user.password);
        let isValid = isMatch;

        // Fallback: check if matches PIN (Supports Superadmin, Admin, Cashier, Waiter)
        if (!isValid && user.pin) {
            const isPinMatch = await bcrypt.compare(String(password), user.pin);
            if (isPinMatch || String(user.pin) === String(password)) {
                isValid = true;
            }
        }

        if (!isValid) {
            const error = createHttpError(401, "Invalid Credentials");
            return next(error);
        }

        // Only validate license if the logged in user is not a Superadmin
        if (user.role !== "Superadmin") {
            const Company = require("../../models/company/companyModel");
            if (!user.companySlug) {
                const error = createHttpError(403, "Your account is not assigned to an active company tenant. Access denied.");
                return next(error);
            }

            const cleanUserSlug = String(user.companySlug).toLowerCase().trim();
            const rootSlug = cleanUserSlug.replace(/-deleted-\d+$/, '');
            const company = await Company.findOne({
                $or: [
                    { companySlug: cleanUserSlug },
                    { companySlug: new RegExp('^' + rootSlug + '(-deleted-\\d+)?$', 'i') }
                ]
            });

            if (!company || company.isDeleted || company.isActive === false) {
                const error = createHttpError(403, "Your company account has been deleted or disabled. Access denied.");
                return next(error);
            }

            const now = new Date();
            const isExpiredStatus = company.licenseStatus === "Expired";
            const isDateExpired = company.licenseEndDate && now > new Date(company.licenseEndDate);
            if (isExpiredStatus || isDateExpired) {
                const error = createHttpError(403, "Your company license is expired or inactive. Please contact Superadmin.");
                return next(error);
            }
        }

        const LicenseConfig = require("../../models/superadmin/licenseModel");
        const license = await LicenseConfig.findOne();
        if (license) {
            const todayStr = new Date().toISOString().split("T")[0];

            // If trial is active but expired, update database status
            if (license.isTrialActive && todayStr > license.trialEndDate) {
                license.isTrialActive = false;
                await license.save();
            }

            // If system activation is active but expired, update database status
            if (license.isSystemActivated && todayStr > license.activationEndDate) {
                license.isSystemActivated = false;
                await license.save();
            }

            // Block login if neither trial nor system activation is active
            if (!license.isTrialActive && !license.isSystemActivated) {
                const error = createHttpError(403, "System License is expired or inactive. Please contact system provider.");
                return next(error);
            }
        } else {
            // If no license configuration is found in the database, treat it as inactive/expired
            const error = createHttpError(403, "System License is expired or inactive. Please contact system provider.");
            return next(error);
        }


        if (user.role !== "Superadmin") {
            if (user.isApproved === "pending" || user.isApproved === false) {
                const error = createHttpError(403, "Access Denied. Your account is pending admin approval.");
                return next(error);
            }
            if (user.isApproved === "declined") {
                const error = createHttpError(403, "Access Denied. Your registration request was declined by the administrator.");
                return next(error);
            }
        }

        if (user.role !== "Superadmin" && user.allowed === false) {
            const error = createHttpError(403, "Access Denied. Your account has been disabled by Admin.");
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

        // Convert to object and exclude sensitive data
        const userData = user.toObject();
        delete userData.password;
        delete userData.__v;

        res.status(200).json({
            success: true,
            message: `Welcome back, ${userData.name}!`,
            data: userData,
            token: accessToken
        });

    } catch (error) {
        next(error);
    }
}

const getUserData = async (req, res, next) => {
    try {
        res.status(200).json({
            success: true,
            message: "User data retrieved successfully!",
            data: req.user
        });
    } catch (error) {
        next(error);
    }
}

const logout = async (req, res, next) => {
    try {
        res.clearCookie('accessToken');
        res.status(200).json({
            success: true,
            message: "User logged out successfully!"
        });
    } catch (error) {
        next(error);
    }
}

const getAllUsers = async (req, res, next) => {
    try {
        let userQuery = { isDeleted: { $nin: [true, "true"] } };

        // If requester is not Superadmin, filter users list by their company slug
        if (req.user && req.user.role !== "Superadmin") {
            const requesterSlug = (req.user.companySlug || (req.headers && req.headers["x-company-slug"]) || "").toLowerCase().trim();
            if (requesterSlug) {
                userQuery.companySlug = { $regex: new RegExp("^" + requesterSlug + "$", "i") };
            }
        }

        // Get all active (non-deleted) companies
        const Company = require("../../models/company/companyModel");
        const activeCompanies = await Company.find({ isDeleted: { $ne: true } }).select("companySlug");
        const activeSlugSet = new Set();
        activeCompanies.forEach(c => {
            if (c.companySlug) {
                const clean = c.companySlug.toLowerCase().trim();
                activeSlugSet.add(clean);
                const root = clean.replace(/-deleted-\d+$/, '');
                activeSlugSet.add(root);
            }
        });

        const users = await User.find(userQuery).select("-password -__v");

        // Filter out users belonging to soft-deleted companies
        const validUsers = users.filter(u => {
            if (!u.companySlug) return true;
            const uSlug = u.companySlug.toLowerCase().trim();
            const root = uSlug.replace(/-deleted-\d+$/, '');
            return activeSlugSet.has(uSlug) || activeSlugSet.has(root);
        });

        let allUsers = [...validUsers];

        // Only include Superadmin records if the requester is a Superadmin
        if (req.user && req.user.role === "Superadmin") {
            const superadmins = await Superadmin.find({ isDeleted: { $nin: [true, "true"] } }).select("-password -__v");
            allUsers = [...allUsers, ...superadmins];
        }

        res.status(200).json({
            success: true,
            message: "Users retrieved successfully!",
            data: allUsers
        });
    } catch (error) {
        next(error);
    }
};

const toggleAccess = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Prevent admin from blocking themselves
        if (id === req.user._id.toString()) {
            const error = createHttpError(400, "You cannot modify your own access status!");
            return next(error);
        }

        const user = await User.findById(id);
        if (!user) {
            const error = createHttpError(404, "User not found!");
            return next(error);
        }

        // Security guard: Non-superadmin users can only modify access for users of their own company
        if (req.user && req.user.role !== "Superadmin") {
            const requesterSlug = (req.user.companySlug || (req.headers && req.headers["x-company-slug"]) || "").toLowerCase().trim();
            const userSlug = (user.companySlug || "").toLowerCase().trim();
            if (requesterSlug && userSlug && requesterSlug !== userSlug) {
                const error = createHttpError(403, "Forbidden. You cannot modify users from another company.");
                return next(error);
            }
        }

        user.allowed = !user.allowed;
        if (req.user) {
            user.updatedBy = req.user.email || String(req.user.phone || req.user.role);
            user.updatedOn = new Date();
        }
        await user.save();

        res.status(200).json({
            success: true,
            message: `${user.name}'s access status updated to ${user.allowed ? "ALLOWED" : "DENIED"}.`,
            data: user
        });
    } catch (error) {
        next(error);
    }
};

const updateCredentials = async (req, res, next) => {
    try {
        const { password, confirmPassword, pin, confirmPin } = req.body || {};
        const userId = req.user._id;

        let user;
        if (req.user.role === "Superadmin") {
            user = await Superadmin.findById(userId);
        } else {
            user = await User.findById(userId);
        }

        if (!user) {
            const error = createHttpError(404, "User not found!");
            return next(error);
        }

        let updated = false;

        if (password) {
            if (password !== confirmPassword) {
                const error = createHttpError(400, "Password and Confirm Password do not match!");
                return next(error);
            }
            user.password = password;
            updated = true;
        }

        if (pin) {
            const cleanPin = String(pin).trim();
            const cleanConfirmPin = confirmPin ? String(confirmPin).trim() : "";
            if (cleanPin !== cleanConfirmPin) {
                const error = createHttpError(400, "PIN and Confirm PIN do not match!");
                return next(error);
            }
            if (!/^\d{4}$/.test(cleanPin)) {
                const error = createHttpError(400, "PIN code must be a 4-digit number!");
                return next(error);
            }
            user.pin = cleanPin;
            updated = true;
        }

        if (!updated) {
            const error = createHttpError(400, "Please provide a password or PIN code to update.");
            return next(error);
        }

        if (req.user) {
            user.updatedBy = req.user.email || String(req.user.phone || req.user.role);
            user.updatedOn = new Date();
        }
        await user.save();

        res.status(200).json({
            success: true,
            message: "Credentials updated successfully!"
        });
    } catch (error) {
        next(error);
    }
};

const updateProfile = async (req, res, next) => {
    try {
        const { name, email, phone } = req.body || {};
        const userId = req.user._id;

        if (!name || !email || !phone) {
            const error = createHttpError(400, "All fields (name, email, phone) are required!");
            return next(error);
        }

        // Validate format
        if (!/\S+@\S+\.\S+/.test(email)) {
            const error = createHttpError(400, "Invalid email address format!");
            return next(error);
        }
        if (!/^\d{10}$/.test(String(phone))) {
            const error = createHttpError(400, "Phone number must be a 10-digit number!");
            return next(error);
        }

        let user;
        if (req.user.role === "Superadmin") {
            user = await Superadmin.findById(userId);
        } else {
            user = await User.findById(userId);
        }

        if (!user) {
            const error = createHttpError(404, "User not found!");
            return next(error);
        }

        // Check uniqueness for email
        if (email.toLowerCase().trim() !== user.email.toLowerCase().trim()) {
            const emailExistsUser = await User.findOne({ email: email.toLowerCase().trim(), isDeleted: { $ne: true } });
            const emailExistsSuper = await Superadmin.findOne({ email: email.toLowerCase().trim() });
            if (emailExistsUser || emailExistsSuper) {
                const error = createHttpError(400, "Email is already in use by another account!");
                return next(error);
            }
        }

        // Check uniqueness for phone
        if (Number(phone) !== user.phone) {
            const phoneExistsUser = await User.findOne({ phone: Number(phone), isDeleted: { $ne: true } });
            const phoneExistsSuper = await Superadmin.findOne({ phone: Number(phone) });
            if (phoneExistsUser || phoneExistsSuper) {
                const error = createHttpError(400, "Phone number is already in use by another account!");
                return next(error);
            }
        }

        user.name = name;
        user.email = email.toLowerCase().trim();
        user.phone = Number(phone);
        if (req.user) {
            user.updatedBy = req.user.email || String(req.user.phone || req.user.role);
            user.updatedOn = new Date();
        }

        await user.save();

        const userData = user.toObject();
        delete userData.password;
        delete userData.pin;
        delete userData.__v;

        res.status(200).json({
            success: true,
            message: "Profile details updated successfully!",
            data: userData
        });
    } catch (error) {
        next(error);
    }
};

const adminUpdateUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, email, phone, role, image, isApproved } = req.body || {};

        if (!name || !email || !phone || !role) {
            const error = createHttpError(400, "All fields (name, email, phone, role) are required!");
            return next(error);
        }

        // Validate format
        if (name.trim().length < 3) {
            const error = createHttpError(400, "Name must be at least 3 characters!");
            return next(error);
        }
        if (!/\S+@\S+\.\S+/.test(email)) {
            const error = createHttpError(400, "Invalid email address format!");
            return next(error);
        }
        if (!/^\d{10}$/.test(String(phone))) {
            const error = createHttpError(400, "Phone number must be a 10-digit number!");
            return next(error);
        }

        // Find target user in both standard User and Superadmin databases
        let user = await User.findById(id);
        if (!user) {
            user = await Superadmin.findById(id);
        }

        if (!user) {
            const error = createHttpError(404, "User not found!");
            return next(error);
        }

        // Security guard: Non-superadmin users can only edit details for users of their own company
        if (req.user && req.user.role !== "Superadmin") {
            const requesterSlug = (req.user.companySlug || (req.headers && req.headers["x-company-slug"]) || "").toLowerCase().trim();
            const userSlug = (user.companySlug || "").toLowerCase().trim();
            if (requesterSlug && userSlug && requesterSlug !== userSlug) {
                const error = createHttpError(403, "Forbidden. You cannot modify users from another company.");
                return next(error);
            }
        }

        // Enforce role hierarchy check for editing user details
        if (req.user.role === "Admin") {
            const isSelfUpdate = String(user._id) === String(req.user._id);
            if (!isSelfUpdate) {
                // Admins can only edit roles below them (cashier, waiter)
                if (user.role === "Admin" || user.role === "Superadmin") {
                    const error = createHttpError(403, "Forbidden. Admins can only edit details for roles below them (cashier, waiter)!");
                    return next(error);
                }
                if (role === "Admin" || role === "Superadmin") {
                    const error = createHttpError(403, "Forbidden. Admins cannot promote users to Admin or Superadmin roles!");
                    return next(error);
                }
            } else {
                // Admins cannot change their own role (must remain Admin)
                if (role !== "Admin") {
                    const error = createHttpError(403, "Forbidden. Admins cannot change their own role!");
                    return next(error);
                }
            }
        } else if (req.user.role === "Superadmin") {
            const isSelfUpdate = String(user._id) === String(req.user._id);
            if (isSelfUpdate) {
                // Superadmins cannot change their own role (must remain Superadmin)
                if (role !== "Superadmin") {
                    const error = createHttpError(403, "Forbidden. Superadmins cannot change their own role!");
                    return next(error);
                }
            }
        }

        // Check uniqueness for email across both collections
        const emailLower = email.toLowerCase().trim();
        if (emailLower !== user.email.toLowerCase().trim()) {
            const emailExistsUser = await User.findOne({ email: emailLower, isDeleted: { $ne: true } });
            const emailExistsSuper = await Superadmin.findOne({ email: emailLower });
            if (emailExistsUser || emailExistsSuper) {
                const error = createHttpError(400, "Email is already in use by another account!");
                return next(error);
            }
        }

        // Check uniqueness for phone across both collections
        const phoneNum = Number(phone);
        if (phoneNum !== user.phone) {
            const phoneExistsUser = await User.findOne({ phone: phoneNum, isDeleted: { $ne: true } });
            const phoneExistsSuper = await Superadmin.findOne({ phone: phoneNum });
            if (phoneExistsUser || phoneExistsSuper) {
                const error = createHttpError(400, "Phone number is already in use by another account!");
                return next(error);
            }
        }

        // Update fields
        user.name = name.trim();
        user.email = emailLower;
        user.phone = phoneNum;
        user.role = role;
        if (image !== undefined) {
            user.image = image;
        }
        if (isApproved !== undefined) {
            user.isApproved = isApproved;
        }
        if (req.user) {
            user.updatedBy = req.user.email || String(req.user.phone || req.user.role);
            user.updatedOn = new Date();
        }

        await user.save();

        const userData = user.toObject();
        delete userData.password;
        delete userData.pin;
        delete userData.__v;

        res.status(200).json({
            success: true,
            message: "User details updated successfully!",
            data: userData
        });
    } catch (error) {
        next(error);
    }
};

const adminResetPassword = async (req, res, next) => {
    try {
        const { id } = req.params;
        const defaultPassword = "Reset@12345";

        // Find target user in both standard User and Superadmin databases
        let user = await User.findById(id);
        let isSuper = false;
        if (!user) {
            user = await Superadmin.findById(id);
            isSuper = true;
        }

        if (!user) {
            const error = createHttpError(404, "User not found!");
            return next(error);
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(defaultPassword, salt);
        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "Admin";

        if (isSuper) {
            await Superadmin.updateOne({ _id: id }, { password: hashedPassword, updatedBy: actorName, updatedOn: new Date() });
        } else {
            await User.updateOne({ _id: id }, { password: hashedPassword, updatedBy: actorName, updatedOn: new Date() });
        }

        res.status(200).json({
            success: true,
            message: "User password reset successfully!",
            defaultPassword: defaultPassword
        });
    } catch (error) {
        next(error);
    }
};

const deleteUser = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Prevent self-deletion
        if (id === req.user._id.toString()) {
            const error = createHttpError(400, "You cannot delete your own account!");
            return next(error);
        }

        // Find target user in standard User database
        const user = await User.findById(id);
        if (!user || user.isDeleted) {
            const error = createHttpError(404, "User not found!");
            return next(error);
        }

        // Security guard: Non-superadmin users can only delete users of their own company
        if (req.user && req.user.role !== "Superadmin") {
            const requesterSlug = (req.user.companySlug || (req.headers && req.headers["x-company-slug"]) || "").toLowerCase().trim();
            const userSlug = (user.companySlug || "").toLowerCase().trim();
            if (requesterSlug && userSlug && requesterSlug !== userSlug) {
                const error = createHttpError(403, "Forbidden. You cannot delete users from another company.");
                return next(error);
            }
        }

        // Enforce role hierarchy check for deletion
        if (req.user.role === "Admin") {
            // Admins can only delete roles below them (cashier, waiter)
            if (user.role === "Admin" || user.role === "Superadmin") {
                const error = createHttpError(403, "Forbidden. Admins can only delete users with roles below them (cashier, waiter)!");
                return next(error);
            }
        }

        // Release email and phone constraints while keeping them valid under Mongoose constraints
        const uniqueSuffix = `deleted-${Date.now()}`;
        if (user.email) {
            user.email = user.email.replace("@", `-${uniqueSuffix}@`);
        }
        user.phone = Number(String(Date.now()).slice(-10));
        user.isDeleted = true;
        user.allowed = false; // block access just in case
        if (req.user) {
            const actorName = req.user.email || String(req.user.phone || req.user.role);
            user.deletedBy = actorName;
            user.deletedOn = new Date();
            user.updatedBy = actorName;
            user.updatedOn = new Date();
        }

        await user.save();

        res.status(200).json({
            success: true,
            message: `User ${user.name} has been deleted successfully.`,
            data: { _id: user._id }
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    register,
    checkUserExists,
    login,
    getUserData,
    logout,
    getAllUsers,
    toggleAccess,
    updateCredentials,
    updateProfile,
    adminUpdateUser,
    adminResetPassword,
    deleteUser
};