const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");

// Check command line arguments or environment variable for production
const args = process.argv.slice(2);
const isProdFlag = args.includes("production") || args.includes("--prod") || process.env.NODE_ENV === "production";

// Load Environment File
const envFile = isProdFlag ? ".env.production" : ".env";
const envPath = path.resolve(__dirname, "../", envFile);

if (fs.existsSync(envPath)) {
    require("dotenv").config({ path: envPath, override: true });
} else {
    require("dotenv").config({ override: true });
}

// Ensure process.env.NODE_ENV reflects selected environment
if (isProdFlag) {
    process.env.NODE_ENV = "production";
}

const config = require("../config/config");

// Import Models
const Order = require("../models/order/orderModel");
const Notification = require("../models/notification/notificationModel");
const AssistanceRequest = require("../models/assistance/assistanceModel");
const TableDetails = require("../models/table/tableModel");
const Counter = require("../models/counter/counterModel");

const clearLiveData = async () => {
    try {
        console.log(`\n==================================================`);
        console.log(`🎯 TARGET ENVIRONMENT: ${isProdFlag ? "PRODUCTION (.env.production)" : "DEVELOPMENT (.env)"}`);
        console.log(`📡 CONNECTING TO DB: ${config.databaseURI}`);
        console.log(`==================================================\n`);

        await mongoose.connect(config.databaseURI);
        console.log("✅ Successfully connected to MongoDB.");

        console.log("\n🧹 Clearing orders, notifications, and assistance requests...");

        // 1. Delete all Orders
        const orderRes = await Order.deleteMany({});
        console.log(`  └─ Deleted ${orderRes.deletedCount} Orders.`);

        // 2. Delete all Notifications
        const notifRes = await Notification.deleteMany({});
        console.log(`  └─ Deleted ${notifRes.deletedCount} Notifications.`);

        // 3. Delete all Assistance Requests
        const assistRes = await AssistanceRequest.deleteMany({});
        console.log(`  └─ Deleted ${assistRes.deletedCount} Assistance Requests.`);

        // 4. Reset Order Number Counters
        const counterRes = await Counter.deleteMany({ _id: "orderNo" });
        console.log(`  └─ Reset Order Counter (${counterRes.deletedCount} entry cleared).`);

        // 5. Reset Table Statuses & Clear Current Orders
        const tableRes = await TableDetails.updateMany(
            {},
            { $set: { status: "Empty", currentOrder: null } }
        );
        console.log(`  └─ Reset ${tableRes.modifiedCount || 0} Tables to "Empty".`);

        console.log("\n🎉 Database Cleanup Complete!");
        process.exit(0);
    } catch (error) {
        console.error("❌ Error clearing database:", error.message);
        process.exit(1);
    }
};

clearLiveData();
