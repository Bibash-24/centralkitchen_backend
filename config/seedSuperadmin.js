const Superadmin = require("../models/superadmin/superadminModel");
const seedSuperadminPermissions = require("./seedSuperadminPermissions");

const seedSuperadmin = async () => {
    try {
        // Seed Superadmin account if missing
        const superadminCount = await Superadmin.countDocuments();
        if (superadminCount === 0) {
            console.log("No Superadmin account found. Seeding default Superadmin...");
            const defaultSuperadmin = new Superadmin({
                name: "Genvix Tech",
                email: "info@genvixtech.com",
                phone: 9762688171,
                password: "Genvix@Tech123_", // Automatically hashed via pre-save hook
                role: "Superadmin"
            });
            await defaultSuperadmin.save();
            console.log("Default Superadmin seeded successfully!");
        } else {
            console.log("Superadmin account already exists.");
        }

        // Seed Superadmin Role Permissions with full access to all modules and submodules
        await seedSuperadminPermissions();

    } catch (error) {
        console.error("Error seeding Superadmin:", error.message);
    }
};

module.exports = seedSuperadmin;
