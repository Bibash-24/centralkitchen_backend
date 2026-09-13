const path = require('path');
const envFile = process.env.NODE_ENV === "production" ? ".env.production" : ".env";
require("dotenv").config({ path: path.resolve(__dirname, "../", envFile) });

const frontendUrl = (process.env.FRONTEND_URL || "").toLowerCase();

let baseURI = process.env.MONGODB_URI;
let superadminURI = process.env.SUPERADMIN_MONGODB_URI || process.env.MONGODB_SUPERADMIN_URI;

// Dynamic automatic selection based on FRONTEND_URL
if (frontendUrl.includes("chiyatown.com.np")) {
    // 1. Webuzo Local Server MongoDB (for chiyatown.com.np)
    if (!baseURI) {
        baseURI = "mongodb://genvixt1_genvixt1:MangoDb%40Users123_@127.0.0.1:27017/genvixt1_pos_chiyatown?authSource=admin";
    }
    if (!superadminURI) {
        superadminURI = "mongodb://genvixt1_genvixt1:MangoDb%40Users123_@127.0.0.1:27017/genvixt1_pos_superadmin?authSource=admin";
    }
} else {
    // 2. Atlas Cloud Cluster (for local development, localhost, and pos.genvixtech.com)
    if (!baseURI) {
        baseURI = "mongodb+srv://bibesh24adh_db_user:y8Q6Gbb9rraLyQ2h@centralkitchen.tvm5w1i.mongodb.net/centralkitchen?retryWrites=true&w=majority";
    }
    if (!superadminURI) {
        superadminURI = "mongodb+srv://chiyatown:Tea%40123_@pos-cluster.qtrxwek.mongodb.net/pos_superadmin_db?retryWrites=true&w=majority&appName=pos-cluster";
    }
}

const config = Object.freeze({
    PORT: process.env.PORT || 3000,
    databaseURI: baseURI,
    superadminURI: superadminURI,
    nodeEnv: process.env.NODE_ENV || "development",
    isProduction: process.env.NODE_ENV === "production",
    accessTokenSecret: process.env.ACCESS_TOKEN_SECRET || "your-default-secret-key",
});

module.exports = config;