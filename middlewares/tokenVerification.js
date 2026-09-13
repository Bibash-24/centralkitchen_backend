const jwt = require("jsonwebtoken");
const createHttpError = require("http-errors");
const config = require("../config/config");
const User = require("../models/user/userModel");
const Superadmin = require("../models/superadmin/superadminModel");

const isVerifiedUser = async (req, res, next) => {
    try {
        let token = null;

        // 1. Extract token from Authorization header or cookies
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.split(" ")[1];
        } else if (req.cookies && req.cookies.accessToken) {
            token = req.cookies.accessToken;
        }

        if (!token) {
            return next(createHttpError(401, "Unauthorized access"));
        }

        // 2. Verify token
        let decoded;
        try {
            decoded = jwt.verify(token, config.accessTokenSecret);
        } catch (jwtError) {
            if (jwtError.name === "TokenExpiredError") {
                return next(createHttpError(401, "Session expired"));
            }
            return next(createHttpError(401, "Unauthorized request"));
        }

        // 3. Verify user exists in DB and select fields without password
        let user;
        if (decoded && decoded.role === "Superadmin") {
            user = await Superadmin.findById(decoded._id).select("-password -__v");
        } else {
            user = await User.findById(decoded._id).select("-password -__v");
        }

        if (!user || user.isDeleted === true) {
            return next(createHttpError(401, "User does not exist"));
        }

        if (user.role !== "Superadmin" && user.allowed === false) {
            return next(createHttpError(403, "Access Denied. Your account has been disabled by Admin."));
        }

        // 4. Attach user object to the request
        req.user = user;
        next();
    } catch (error) {
        next(error);
    }
};

const isAdmin = (req, res, next) => {
    if (req.user && (req.user.role === "Admin" || req.user.role === "Superadmin")) {
        next();
    } else {
        next(createHttpError(403, "Forbidden. Admin access required."));
    }
};

const isSuperadmin = (req, res, next) => {
    if (req.user && req.user.role === "Superadmin") {
        next();
    } else {
        next(createHttpError(403, "Forbidden. Superadmin access required."));
    }
};

module.exports = { isVerifiedUser, isAdmin, isSuperadmin };
