const tenantContext = (req, res, next) => {
    // Extract tenant slug from header or JWT user payload
    const headerSlug = req.headers["x-company-slug"];
    const userSlug = req.user?.companySlug;

    req.companySlug = headerSlug || userSlug || "main-kitchen";
    next();
};

module.exports = tenantContext;
