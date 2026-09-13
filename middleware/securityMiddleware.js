const createError = require('http-errors');

/**
 * XSS Payload Sanitizer Middleware
 * Recursively cleans dangerous HTML and script tags from req.body, req.query, and req.params
 */
const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    return str
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove <script> tags
        .replace(/on\w+\s*=\s*(['"])(?:(?!\1).)*\1/gi, '')                   // Remove event handlers like onload="...", onerror="..."
        .replace(/on\w+\s*=\s*[^>\s]+/gi, '')                                // Remove unquoted event handlers
        .replace(/javascript\s*:/gi, '');                                   // Remove javascript: URI schemes
};

const sanitizeObject = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
    }

    const sanitized = {};
    for (const key of Object.keys(obj)) {
        const value = obj[key];
        if (typeof value === 'string') {
            sanitized[key] = sanitizeString(value);
        } else if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitizeObject(value);
        } else {
            sanitized[key] = value;
        }
    }
    return sanitized;
};

const sanitizeInputPayload = (req, res, next) => {
    try {
        if (req.body) req.body = sanitizeObject(req.body);
        if (req.query) req.query = sanitizeObject(req.query);
        if (req.params) req.params = sanitizeObject(req.params);
        next();
    } catch (err) {
        next(err);
    }
};

/**
 * Server-Side Role-Based Access Control (RBAC) Middleware
 * Verifies that the authenticated user's role is in the allowedRoles array.
 */
const verifyRole = (allowedRoles = []) => {
    return (req, res, next) => {
        if (!req.user) {
            return next(createError(401, "Authentication required. Please log in."));
        }

        const userRole = req.user.role;
        // Normalize role check (e.g. Admin / Superadmin / cashier / waiter)
        const isAllowed = allowedRoles.some(r => r.toLowerCase() === userRole.toLowerCase());
        
        if (!isAllowed) {
            return next(createError(403, `Access Denied: Action restricted to ${allowedRoles.join(', ')} roles.`));
        }

        next();
    };
};

/**
 * Server-Side Superadmin Verification Middleware
 */
const verifySuperadmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'Superadmin') {
        return next(createError(403, "Access Denied: Superadmin privileges required."));
    }
    next();
};

module.exports = {
    sanitizeInputPayload,
    verifyRole,
    verifySuperadmin
};
