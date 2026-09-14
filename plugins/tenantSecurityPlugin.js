const { AsyncLocalStorage } = require("async_hooks");
const tenantStorage = new AsyncLocalStorage();

const tenantMiddleware = (req, res, next) => {
  const headerSlug = req.headers["x-company-slug"];
  const userSlug = req.user?.companySlug;
  const companySlug = (headerSlug || userSlug || "main-kitchen").toLowerCase().trim();

  tenantStorage.run({ companySlug }, () => {
    req.companySlug = companySlug;
    next();
  });
};

const tenantSecurityPlugin = (schema) => {
  // Ensure companySlug exists on schema
  if (!schema.path("companySlug")) {
    schema.add({
      companySlug: {
        type: String,
        default: "main-kitchen",
        required: true,
        index: true
      }
    });
  }

  // Automatic query hook
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
