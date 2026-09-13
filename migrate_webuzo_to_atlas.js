const { MongoClient } = require("mongodb");
require("dotenv").config();

// Source Webuzo MongoDB URI (runs locally inside Webuzo server)
const WEBUZO_URI = process.env.WEBUZO_URI || "mongodb://genvixt1_genvixt1:MangoDb%40Users123_@127.0.0.1:27017/?authSource=admin";

// Target Atlas Cluster URI
const ATLAS_URI = process.env.ATLAS_URI || "mongodb+srv://chiyatown:Tea%40123_@pos-cluster.qtrxwek.mongodb.net/?retryWrites=true&w=majority";

const cleanURI = (uriStr) => {
    try {
        let str = uriStr.trim();
        if (!str.startsWith("mongodb://") && !str.startsWith("mongodb+srv://")) {
            str = `mongodb://${str}`;
        }
        return str;
    } catch (e) {
        return uriStr;
    }
};

const runMigrationWebuzoToAtlas = async () => {
    console.log("\n🚀 STARTING MIGRATION FROM WEBUZO LOCAL MONGODB TO ATLAS...");
    console.log(`📡 Source Webuzo Host: ${cleanURI(WEBUZO_URI).replace(/:([^@]+)@/, ":****@")}`);
    console.log(`🎯 Target Atlas Cluster: ${cleanURI(ATLAS_URI).replace(/:([^@]+)@/, ":****@")}\n`);

    let webuzoClient = null;
    let atlasClient = null;

    try {
        console.log("🔌 Connecting to Source Webuzo Local MongoDB...");
        webuzoClient = new MongoClient(cleanURI(WEBUZO_URI));
        await webuzoClient.connect();
        console.log("✅ Source Webuzo Connected!");

        console.log("🔌 Connecting to Target Atlas Cluster...");
        atlasClient = new MongoClient(cleanURI(ATLAS_URI));
        await atlasClient.connect();
        console.log("✅ Target Atlas Connected!\n");

        let totalDocsMigrated = 0;

        const migrateDatabase = async (sourceDbName, targetDbName) => {
            console.log(`📦 Migrating Webuzo [${sourceDbName}] -> Atlas [${targetDbName}]...`);
            const sourceDb = webuzoClient.db(sourceDbName);
            const targetDb = atlasClient.db(targetDbName);

            const collections = await sourceDb.listCollections().toArray();
            if (collections.length === 0) {
                console.log(`   ⚠️ No collections found in Webuzo [${sourceDbName}]`);
                return;
            }

            for (const col of collections) {
                const colName = col.name;
                const docs = await sourceDb.collection(colName).find({}).toArray();

                try {
                    await targetDb.createCollection(colName);
                } catch (e) {}

                if (docs.length > 0) {
                    let count = 0;
                    for (const doc of docs) {
                        try {
                            const docToSet = { ...doc };
                            delete docToSet._id;
                            await targetDb.collection(colName).updateOne(
                                { _id: doc._id },
                                { $set: docToSet },
                                { upsert: true }
                            );
                            count++;
                        } catch (writeErr) {
                            console.log(`   ❌ Error writing doc to Atlas [${targetDbName}.${colName}]: ${writeErr.message}`);
                        }
                    }
                    totalDocsMigrated += count;
                    console.log(`   ✓ Synced [${sourceDbName}.${colName}] -> Atlas [${targetDbName}.${colName}] (${count} documents)`);
                } else {
                    console.log(`   ✓ Created empty collection [${targetDbName}.${colName}]`);
                }
            }
        };

        // 1. Migrate Webuzo Tenant Database (genvixt1_pos_chiyatown -> pos-chiyatown & test)
        await migrateDatabase("genvixt1_pos_chiyatown", "pos-chiyatown");
        await migrateDatabase("genvixt1_pos_chiyatown", "test");

        // 2. Migrate Webuzo Superadmin Database (genvixt1_pos_superadmin -> pos_superadmin_db & pos-superadmin-db)
        await migrateDatabase("genvixt1_pos_superadmin", "pos_superadmin_db");
        await migrateDatabase("genvixt1_pos_superadmin", "pos-superadmin-db");

        console.log(`\n🎉 MIGRATION FROM WEBUZO TO ATLAS COMPLETED SUCCESSFULLY!`);
        console.log(`✅ Total Documents Synced to Atlas: ${totalDocsMigrated}\n`);

    } catch (err) {
        console.error("\n❌ MIGRATION ERROR:", err.message);
    } finally {
        if (webuzoClient) await webuzoClient.close();
        if (atlasClient) await atlasClient.close();
    }
};

if (require.main === module) {
    runMigrationWebuzoToAtlas().then(() => process.exit(0));
}

module.exports = runMigrationWebuzoToAtlas;
