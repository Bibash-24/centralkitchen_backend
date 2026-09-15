const mongoose = require("mongoose");

const companySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  companySlug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  contactEmail: {
    type: String,
    default: "",
    trim: true
  },
  contactPhone: {
    type: String,
    default: "",
    trim: true
  },
  yearlyFee: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  enabledModules: {
    type: [String],
    default: []
  },
  licenseStatus: {
    type: String,
    enum: ["Activated", "Trial"],
    default: "Activated"
  },
  licenseStartDate: {
    type: Date,
    default: null
  },
  licenseEndDate: {
    type: Date,
    default: null
  },
  createdBy: {
    type: String,
    default: "Superadmin"
  }
}, { timestamps: true });

module.exports = mongoose.model("Company", companySchema);
