const config = require("../config/config");

const globalErrorHandler = (err, req, res, next) => {
    let statusCode = err.statusCode || 500;

    // Handle Mongoose validation or CastError as 400 Bad Request
    if (err.name === "ValidationError" || err.name === "CastError") {
        statusCode = 400;
    }

    const origin = req.headers.origin;
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
    }

    return res.status(statusCode).json({
        status: statusCode,
        message: err.message || "An unexpected error occurred",
        errorStack: config.nodeEnv === "development" ? err.stack : ""
    });
};

module.exports = globalErrorHandler;
