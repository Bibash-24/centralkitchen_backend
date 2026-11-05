const mongoose = require("mongoose");

const inventorySchema = new mongoose.Schema({
  companySlug: { type: String, required: true, index: true, default: "default-company" },
    name: {
        type: String,
        required: true,
        trim: true
    },
    unit: {
        type: String,
        required: true
    },
    currentStock: {
        type: Number,
        default: 0
    },
    lowStockThreshold: {
        type: Number,
        required: false,
        default: null
    },
    targetStock: {
        type: Number,
        required: false,
        default: null
    },
    cost: {
        type: Number,
        default: 0
    },
    category: {
        type: String,
        default: "Ingredients"
    },
    vendor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Vendor",
        default: null
    },
    adjustments: [
        {
            quantity: { type: Number, required: true },
            reason: { type: String, required: true },
            notes: { type: String, required: false },
            date: { type: Date, default: Date.now },
            adjustedBy: { type: String }
        }
    ],
    isDeleted: {
        type: Boolean,
        default: false
    },
    createdBy: {
        type: String,
        required: false
    },
    createdOn: {
        type: Date,
        default: Date.now
    },
    updatedBy: {
        type: String,
        required: false
    },
    updatedOn: {
        type: Date,
        required: false
    },
    deletedBy: {
        type: String,
        required: false
    },
    deletedOn: {
        type: Date,
        required: false
    }
}, { timestamps: true });

inventorySchema.index({ companySlug: 1, name: 1 }, { unique: true });

inventorySchema.pre("validate", function() {
    if (!this.companySlug || typeof this.companySlug !== "string" || !this.companySlug.trim()) {
        this.companySlug = "default-company";
    }
});

module.exports = mongoose.model("Inventory", inventorySchema);
