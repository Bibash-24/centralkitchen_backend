const tenantContext = (req, res, next) => {
    const querySlug = req.query?.companySlug;
    const bodySlug = req.body?.companySlug;
    const headerSlug = req.headers["x-company-slug"];
    const userSlug = req.user?.companySlug;

    req.companySlug = querySlug || bodySlug || headerSlug || userSlug || null;
    next();
};

module.exports = tenantContext;
