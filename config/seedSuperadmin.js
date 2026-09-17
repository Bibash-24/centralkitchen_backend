const Superadmin = require("../models/superadmin/superadminModel");
const RestaurantConfig = require("../models/restaurant/restaurantModel");

const seedSuperadmin = async () => {
    try {
        // 1. Seed Superadmin exactly once
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

        // 2. Seed & Update RestaurantConfig Brand Colors (#DE851B & #798021)
        let restaurantConfig = await RestaurantConfig.findOne();
        if (!restaurantConfig) {
            console.log("No RestaurantConfig found. Seeding default RestaurantConfig with brand colors...");
            restaurantConfig = new RestaurantConfig({
                name: "Chiya Town",
                primaryColor: "#DE851B",
                secondaryColor: "#798021",
                createdBy: "System"
            });
            await restaurantConfig.save();
            console.log("Default RestaurantConfig seeded successfully!");
        } else {
            let updated = false;
            if (restaurantConfig.primaryColor !== "#DE851B") {
                restaurantConfig.primaryColor = "#DE851B";
                updated = true;
            }
            if (restaurantConfig.secondaryColor !== "#798021") {
                restaurantConfig.secondaryColor = "#798021";
                updated = true;
            }
            if (updated) {
                await restaurantConfig.save();
                console.log("RestaurantConfig brand colors updated to #DE851B & #798021!");
            }
        }
    } catch (error) {
        console.error("Error seeding Superadmin/RestaurantConfig:", error.message);
    }
};

module.exports = seedSuperadmin;
