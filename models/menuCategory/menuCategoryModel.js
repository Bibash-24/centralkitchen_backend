const mongoose = require("mongoose");

const menuCategorySchema = new mongoose.Schema({
  companySlug: { type: String, required: true, index: true, default: "default-company" },
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        default: ""
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    createdBy: {
        type: String,
        required: false
    },
    updatedBy: {
        type: String,
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
}, {
    id: false,
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

menuCategorySchema.index({ companySlug: 1, name: 1 }, { unique: true });

menuCategorySchema.pre("validate", function() {
    if (!this.companySlug || typeof this.companySlug !== "string" || !this.companySlug.trim()) {
        this.companySlug = "default-company";
    }
});

module.exports = mongoose.model("MenuCategory", menuCategorySchema);
