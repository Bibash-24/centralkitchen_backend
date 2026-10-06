const { AsyncLocalStorage } = require("async_hooks");
const tenantStorage = new AsyncLocalStorage();

const tenantMiddleware = (req, res, next) => {
  const querySlug = req.query?.companySlug;
  const bodySlug = req.body?.companySlug;
  const headerSlug = req.headers["x-company-slug"];
  const userSlug = req.user?.companySlug;
  const rawSlug = querySlug || bodySlug || headerSlug || userSlug || null;
  const companySlug = rawSlug ? String(rawSlug).toLowerCase().trim() : null;

  tenantStorage.run({ companySlug }, () => {
    req.companySlug = companySlug;
    next();
  });
};

const tenantSecurityPlugin = (schema) => {
  if (!schema.path("companySlug")) {
    schema.add({
      companySlug: {
        type: String,
        required: true,
        index: true
      }
    });
  }

  const autoScope = function (next) {
    const store = tenantStorage.getStore();
    if (store && store.companySlug && !this.options?.isPlatformSuperadmin) {
      this.where({ companySlug: store.companySlug });
    }
    next();
  };

  schema.pre("find", autoScope);
  schema.pre("findOne", autoScope);
  schema.pre("countDocuments", autoScope);
  schema.pre("updateOne", autoScope);
  schema.pre("updateMany", autoScope);
};

module.exports = { tenantMiddleware, tenantStorage, tenantSecurityPlugin };
