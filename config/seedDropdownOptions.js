const DropdownOption = require("../models/dropdownOption/dropdownOptionModel");

const defaultOptions = [
    // Expense Category
    { name: "Ingredients", value: "Ingredients", usedFor: "expense_category" },
    { name: "Purchase", value: "Purchase", usedFor: "expense_category" },
    { name: "Utilities", value: "Utilities", usedFor: "expense_category" },
    { name: "Rent", value: "Rent", usedFor: "expense_category" },
    { name: "Salaries", value: "Salaries", usedFor: "expense_category" },
    { name: "Packaging", value: "Packaging", usedFor: "expense_category" },
    { name: "Transportation", value: "Transportation", usedFor: "expense_category" },
    { name: "Maintenance", value: "Maintenance", usedFor: "expense_category" },
    { name: "Marketing", value: "Marketing", usedFor: "expense_category" },
    { name: "Office Supplies", value: "Office Supplies", usedFor: "expense_category" },
    { name: "Equipment", value: "Equipment", usedFor: "expense_category" },
    { name: "Tax", value: "Tax", usedFor: "expense_category" },
    { name: "Insurance", value: "Insurance", usedFor: "expense_category" },
    { name: "Bank Charges", value: "Bank Charges", usedFor: "expense_category" },
    { name: "Professional Fees", value: "Professional Fees", usedFor: "expense_category" },
    { name: "Travel", value: "Travel", usedFor: "expense_category" },
    { name: "Miscellaneous", value: "Miscellaneous", usedFor: "expense_category" },
    { name: "Others", value: "Others", usedFor: "expense_category" },

    // Payment Method
    { name: "Cash", value: "Cash", usedFor: "payment_method" },
    { name: "Online", value: "Online", usedFor: "payment_method" },
    { name: "Card", value: "Card", usedFor: "payment_method" },
    { name: "Cheque", value: "Cheque", usedFor: "payment_method" },

    // Inventory Unit
    { name: "kg (Kilogram)", value: "kg", usedFor: "inventory_unit" },
    { name: "g (Gram)", value: "g", usedFor: "inventory_unit" },
    { name: "mg (Milligram)", value: "mg", usedFor: "inventory_unit" },
    { name: "L (Litre)", value: "L", usedFor: "inventory_unit" },
    { name: "ml (Millilitre)", value: "ml", usedFor: "inventory_unit" },
    { name: "pcs (Pieces)", value: "pcs", usedFor: "inventory_unit" },
    { name: "box (Box)", value: "box", usedFor: "inventory_unit" },
    { name: "pack (Pack)", value: "pack", usedFor: "inventory_unit" },
    { name: "bag (Bag)", value: "bag", usedFor: "inventory_unit" },
    { name: "bottle (Bottle)", value: "bottle", usedFor: "inventory_unit" },
    { name: "can (Can)", value: "can", usedFor: "inventory_unit" },
    { name: "carton (Carton)", value: "carton", usedFor: "inventory_unit" },
    { name: "dozen (Dozen)", value: "dozen", usedFor: "inventory_unit" },
    { name: "pair (Pair)", value: "pair", usedFor: "inventory_unit" },
    { name: "set (Set)", value: "set", usedFor: "inventory_unit" },
    { name: "roll (Roll)", value: "roll", usedFor: "inventory_unit" },
    { name: "meter (Meter)", value: "meter", usedFor: "inventory_unit" },
    { name: "cm (Centimeter)", value: "cm", usedFor: "inventory_unit" },
    { name: "inch (Inch)", value: "inch", usedFor: "inventory_unit" },
    { name: "unit (Unit)", value: "unit", usedFor: "inventory_unit" },

    // Area Type
    { name: "Sitting (Standard Dining)", value: "Sitting", usedFor: "area_type" },
    { name: "Cabin (Private Dining)", value: "Cabin", usedFor: "area_type" },
    { name: "Stool (Counter / Bar)", value: "Stool", usedFor: "area_type" },
    { name: "Custom Area Type", value: "Custom", usedFor: "area_type" }
];

const seedDropdownOptions = async () => {
    try {
        console.log("Checking and seeding default dropdown options...");
        let seededCount = 0;
        for (const opt of defaultOptions) {
            const exists = await DropdownOption.findOne({
                value: opt.value,
                usedFor: opt.usedFor,
                isDeleted: false
            });
            if (!exists) {
                await DropdownOption.create({
                    ...opt,
                    createdBy: "System"
                });
                seededCount++;
            }
        }
        if (seededCount > 0) {
            console.log(`Seeded ${seededCount} new default dropdown options.`);
        } else {
            console.log("All default dropdown options already exist.");
        }
    } catch (err) {
        console.error("Error seeding default dropdown options:", err);
    }
};

module.exports = seedDropdownOptions;
