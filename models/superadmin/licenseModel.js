const mongoose = require("mongoose");

const getFormattedDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const getDefaultStartDate = () => {
    return getFormattedDate(new Date());
};

const getDefaultEndDate = () => {
    const today = new Date();
    const next15Days = new Date();
    next15Days.setDate(today.getDate() + 15);
    return getFormattedDate(next15Days);
};

const getDefaultActivationEndDate = () => {
    const today = new Date();
    const next365Days = new Date();
    next365Days.setDate(today.getDate() + 365);
    return getFormattedDate(next365Days);
};

const licenseSchema = new mongoose.Schema({
    companySlug: {
        type: String,
        required: false,
        lowercase: true,
        trim: true,
        index: true
    },
    isTrialActive: {
        type: Boolean,
        default: false
    },
    trialStartDate: {
        type: String,
        default: getDefaultStartDate
    },
    trialEndDate: {
        type: String,
        default: getDefaultEndDate
    },
    isSystemActivated: {
        type: Boolean,
        default: false
    },
    activationStartDate: {
        type: String,
        default: getDefaultStartDate
    },
    activationEndDate: {
        type: String,
        default: getDefaultActivationEndDate
    },
    yearlyFee: {
        type: Number,
        default: 25000
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

module.exports = mongoose.model("LicenseConfig", licenseSchema);
