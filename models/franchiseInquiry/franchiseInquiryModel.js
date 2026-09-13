const mongoose = require("mongoose");

const franchiseInquirySchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: true,
        trim: true
    },
    phone: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        trim: true
    },
    city: {
        type: String,
        required: true,
        trim: true
    },
    investmentBudget: {
        type: String,
        default: ""
    },
    experience: {
        type: String,
        default: ""
    },
    message: {
        type: String,
        default: ""
    },
    status: {
        type: String,
        enum: ["New", "In Review", "Contacted", "Approved", "Closed"],
        default: "New"
    },
    notes: {
        type: String,
        default: ""
    },
    isDeleted: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

module.exports = mongoose.model("FranchiseInquiry", franchiseInquirySchema);
