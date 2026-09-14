const mongoose = require("mongoose");
const config = require("./config");

const dbOptions = {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
};

const ATLAS_URI = "mongodb://127.0.0.1:27017/database_name";
const SUPERADMIN_ATLAS_URI = "mongodb://127.0.0.1:27017/database_name";

let superadminConn = mongoose.createConnection(config.superadminURI, dbOptions);

superadminConn.on("connected", () => {
    console.log("SUPERADMIN DB CONNECTED");
});

superadminConn.on("error", (err) => {
    console.error("SUPERADMIN DB CONNECTION FAILED, trying Atlas fallback...", err.message);
    if (!superadminConn._fallbackTried) {
        superadminConn._fallbackTried = true;
        try {
            superadminConn = mongoose.createConnection(SUPERADMIN_ATLAS_URI, dbOptions);
        } catch (e) {}
    }
});

const connectDB = async () => {
    try {
        await mongoose.connect(config.databaseURI, dbOptions);
        console.log("DB CONNECTED");
    } catch (error) {
        console.log("PRIMARY DB CONNECTION FAILED, connecting to Atlas Fallback...", error.message);
        try {
            await mongoose.connect(ATLAS_URI, dbOptions);
            console.log("ATLAS FALLBACK DB CONNECTED");
        } catch (fallbackErr) {
            console.error("ALL DB CONNECTIONS FAILED:", fallbackErr.message);
            process.exit(1);
        }
    }
};

module.exports = { connectDB, superadminConn };