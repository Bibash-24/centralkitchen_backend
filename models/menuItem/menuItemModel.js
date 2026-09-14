const mongoose = require("mongoose");

const menuItemSchema = new mongoose.Schema({
  companySlug: { type: String, default: "main-kitchen", required: true, index: true },
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    price: {
        type: String,
        required: true
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "MenuCategory",
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isSalesHourItem: {
        type: Boolean,
        default: false
    },
    startTime: {
        type: String,
        default: null
    },
    endTime: {
        type: String,
        default: null
    },
    salePrice: {
        type: String,
        default: null
    },
    recipe: [
        {
            inventoryItem: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Inventory",
                required: true
            },
            ratio: {
                type: Number,
                required: true
            }
        }
    ],
    isDeleted: {
        type: Boolean,
        default: false
    },
    createdBy: { type: String },
    updatedBy: { type: String },
    deletedBy: { type: String },
    deletedOn: { type: Date }
}, {
    id: false,
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

module.exports = mongoose.model("MenuItem", menuItemSchema);
