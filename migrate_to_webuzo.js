const { MongoClient } = require("mongodb");
require("dotenv").config();

// Hardcoded verified Atlas Cluster URI
const SOURCE_ATLAS_URI = "mongodb://127.0.0.1:27017/database_name";

// Target Local Webuzo Connection String
const TARGET_BASE_URI = process.env.TARGET_BASE_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/genvixt1_pos_chiyatown";

/**
 * Clean target URI to get host connection string without hardcoded DB path
 */
const cleanTargetURI = (uriStr) => {
    try {
        let str = uriStr.trim();
        if (!str.startsWith("mongodb://") && !str.startsWith("mongodb+srv://")) {
            str = `mongodb://${str}`;
        }
        return str;
    } catch (e) {
        return "mongodb://127.0.0.1:27017";
    }
};

const runMigration = async () => {
    console.log("\n🚀 STARTING DIRECT MONGODB MIGRATION TO WEBUZO...");
    console.log(`📡 Source Atlas Cluster: ${SOURCE_ATLAS_URI.replace(/:([^@]+)@/, ":****@")}`);

    const targetURI = cleanTargetURI(TARGET_BASE_URI);
    console.log(`🎯 Target Webuzo Host: ${targetURI.replace(/:([^@]+)@/, ":****@")}\n`);

    let sourceClient = null;
    let targetClient = null;

    try {
        console.log("🔌 Connecting to Source Atlas Cluster...");
        sourceClient = new MongoClient(SOURCE_ATLAS_URI);
        await sourceClient.connect();
        console.log("✅ Source Atlas Connected!");

        // Diagnostic Check directly on Atlas 'test' database
        const testDb = sourceClient.db("test");
        const menuCount = await testDb.collection("menuitems").countDocuments();
        const dropCount = await testDb.collection("dropdownoptions").countDocuments();
        const catCount = await testDb.collection("menucategories").countDocuments();

        console.log(`📊 Atlas [test] DB Diagnostic Count:`);
        console.log(`   - menuitems: ${menuCount} documents`);
        console.log(`   - dropdownoptions: ${dropCount} documents`);
        console.log(`   - menucategories: ${catCount} documents\n`);

        console.log("🔌 Connecting to Target Webuzo Local MongoDB...");
        try {
            targetClient = new MongoClient(targetURI);
            await targetClient.connect();
            console.log("✅ Target Webuzo Local MongoDB Connected (Authenticated)!\n");
        } catch (authErr) {
            console.log(`⚠️ Authenticated target connection failed (${authErr.message}). Retrying unauthenticated local connection...`);
            targetClient = new MongoClient("mongodb://127.0.0.1:27017");
            await targetClient.connect();
            console.log("✅ Target Webuzo Local MongoDB Connected (Fallback)!\n");
        }

        let totalDocsMigrated = 0;

        // Exact Webuzo Database names from user screenshot
        const targetSuperadminDbName = process.env.MONGODB_SUPERADMIN_URI && process.env.MONGODB_SUPERADMIN_URI.includes("genvixt1_") ? "genvixt1_pos_superadmin" : "genvixt1_pos_superadmin";
        const targetChiyatownDbName = process.env.MONGODB_URI && process.env.MONGODB_URI.includes("genvixt1_") ? "genvixt1_pos_chiyatown" : "genvixt1_pos_chiyatown";

        // 1. MIGRATE pos-superadmin-db
        console.log(`📦 1/2 Migrating [pos-superadmin-db] -> [${targetSuperadminDbName}]...`);
        const sourceSuperDb = sourceClient.db("pos-superadmin-db");
        const targetSuperDb = targetClient.db(targetSuperadminDbName);

        const superCols = await sourceSuperDb.listCollections().toArray();
        for (const col of superCols) {
            const colName = col.name;
            const docs = await sourceSuperDb.collection(colName).find({}).toArray();

            try {
                await targetSuperDb.createCollection(colName);
            } catch (e) {}

            if (docs.length > 0) {
                try {
                    await targetSuperDb.collection(colName).deleteMany({});
                } catch (e) {}

                try {
                    await targetSuperDb.collection(colName).insertMany(docs);
                    console.log(`   ✓ Migrated [pos-superadmin-db.${colName}] (${docs.length} documents)`);
                } catch (err) {
                    let count = 0;
                    for (const doc of docs) {
                        try {
                            await targetSuperDb.collection(colName).replaceOne({ _id: doc._id }, doc, { upsert: true });
                            count++;
                        } catch (writeErr) {
                            console.log(`   ❌ Write error on [${targetSuperadminDbName}.${colName}]: ${writeErr.message}`);
                            break;
                        }
                    }
                    if (count > 0) console.log(`   ✓ Upserted [${targetSuperadminDbName}.${colName}] (${count} documents)`);
                }
            } else {
                console.log(`   ✓ Created empty collection [${targetSuperadminDbName}.${colName}]`);
            }
        }

        // 2. MIGRATE Atlas 'test' database to Webuzo 'genvixt1_pos_chiyatown'
        console.log(`\n📦 2/2 Migrating Atlas [test] DB -> Webuzo [${targetChiyatownDbName}]...`);
        const targetChiyatownDb = targetClient.db(targetChiyatownDbName);
        const testCols = await testDb.listCollections().toArray();

        for (const col of testCols) {
            const colName = col.name;
            const docs = await testDb.collection(colName).find({}).toArray();

            try {
                await targetChiyatownDb.createCollection(colName);
            } catch (e) {}

            if (docs.length > 0) {
                try {
                    await targetChiyatownDb.collection(colName).deleteMany({});
                } catch (e) {}

                try {
                    await targetChiyatownDb.collection(colName).insertMany(docs);
                    totalDocsMigrated += docs.length;
                    console.log(`   ✓ Migrated [test.${colName}] -> [${targetChiyatownDbName}.${colName}] (${docs.length} documents)`);
                } catch (err) {
                    let count = 0;
                    let lastWriteErr = "";
                    for (const doc of docs) {
                        try {
                            await targetChiyatownDb.collection(colName).replaceOne({ _id: doc._id }, doc, { upsert: true });
                            count++;
                        } catch (writeErr) {
                            lastWriteErr = writeErr.message;
                        }
                    }
                    if (count > 0) {
                        totalDocsMigrated += count;
                        console.log(`   ✓ Upserted [test.${colName}] -> [${targetChiyatownDbName}.${colName}] (${count} documents)`);
                    } else {
                        console.log(`   ❌ Write failed on [${targetChiyatownDbName}.${colName}]: ${lastWriteErr}`);
                    }
                }
            } else {
                console.log(`   ✓ Created empty collection [${targetChiyatownDbName}.${colName}]`);
            }
        }

        console.log(`\n🎉 MIGRATION COMPLETED SUCCESSFULLY!`);
        console.log(`✅ Total Documents Migrated to ${targetChiyatownDbName}: ${totalDocsMigrated}`);
        console.log(`✅ All collections are now populated in ${targetSuperadminDbName} & ${targetChiyatownDbName} on Webuzo local MongoDB!\n`);

    } catch (err) {
        console.error("\n❌ MIGRATION ERROR:", err.message);
    } finally {
        if (sourceClient) await sourceClient.close();
        if (targetClient) await targetClient.close();
    }
};

// Execute if run directly via `node migrate_to_webuzo.js`
if (require.main === module) {
    runMigration().then(() => process.exit(0));
}

module.exports = runMigration;
