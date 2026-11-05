const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema({
  companySlug: { type: String, required: true, index: true, default: "default-company" },
    description: {
        type: String,
        required: true
    },
    category: {
        type: String,
        default: "Ingredients"
    },
    amount: {
        type: Number,
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    },
    method: {
        type: String,
        default: "Cash"
    },
    createdBy: {
        type: String,
        required: false
    },
    chequeDate: {
        type: Date,
        required: false
    },
    vendor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Vendor",
        required: false
    },
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Customer",
        required: false
    },
    staff: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Staff",
        required: false
    }
}, { timestamps: true });

// Database Index Verification Optimization
expenseSchema.index({ date: -1 });
expenseSchema.index({ method: 1 });
expenseSchema.index({ vendor: 1 });
expenseSchema.index({ createdAt: -1 });

expenseSchema.pre("validate", function() {
    if (!this.companySlug || typeof this.companySlug !== "string" || !this.companySlug.trim()) {
        this.companySlug = "default-company";
    }
});

module.exports = mongoose.model("Expense", expenseSchema);
