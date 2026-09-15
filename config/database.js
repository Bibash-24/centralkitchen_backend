const mongoose = require("mongoose");
const config = require("./config");

const dbOptions = {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
};

const ATLAS_URI = process.env.ATLAS_URI || process.env.MONGODB_FALLBACK_URI;
const SUPERADMIN_ATLAS_URI = process.env.SUPERADMIN_ATLAS_URI || process.env.SUPERADMIN_MONGODB_FALLBACK_URI;

const superadminUri = config.superadminURI || SUPERADMIN_ATLAS_URI || config.databaseURI;

let superadminConn = null;
if (superadminUri) {
    superadminConn = mongoose.createConnection(superadminUri, dbOptions);

    superadminConn.on("connected", () => {
        console.log("SUPERADMIN DB CONNECTED");
    });

    superadminConn.on("error", (err) => {
        console.error("SUPERADMIN DB CONNECTION FAILED:", err.message);
        if (SUPERADMIN_ATLAS_URI && !superadminConn._fallbackTried) {
            superadminConn._fallbackTried = true;
            try {
                superadminConn = mongoose.createConnection(SUPERADMIN_ATLAS_URI, dbOptions);
            } catch (e) {}
        }
    });
} else {
    console.warn("SUPERADMIN_MONGODB_URI is not set in environment.");
}

const connectDB = async () => {
    try {
        if (!config.databaseURI) {
            throw new Error("MONGODB_URI is not defined in environment variables (.env / .env.production)");
        }
        await mongoose.connect(config.databaseURI, dbOptions);
        console.log("DB CONNECTED");
    } catch (error) {
        console.log("PRIMARY DB CONNECTION FAILED:", error.message);
        if (ATLAS_URI) {
            try {
                await mongoose.connect(ATLAS_URI, dbOptions);
                console.log("FALLBACK DB CONNECTED");
                return;
            } catch (fallbackErr) {
                console.error("ALL DB CONNECTIONS FAILED:", fallbackErr.message);
            }
        }
        process.exit(1);
    }
};

module.exports = { connectDB, superadminConn };
