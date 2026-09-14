const path = require('path');
const envFile = process.env.NODE_ENV === "production" ? ".env.production" : ".env";
require("dotenv").config({ path: path.resolve(__dirname, "../", envFile) });

const config = Object.freeze({
    PORT: process.env.PORT || 3000,
    databaseURI: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/centralkitchen",
    superadminURI: process.env.SUPERADMIN_MONGODB_URI || process.env.MONGODB_SUPERADMIN_URI || "mongodb://127.0.0.1:27017/centralkitchen_superadmin",
    nodeEnv: process.env.NODE_ENV || "development",
    isProduction: process.env.NODE_ENV === "production",
    accessTokenSecret: process.env.ACCESS_TOKEN_SECRET || "your-default-secret-key",
});

module.exports = config;
