const mongoose = require("mongoose");

const companySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  orderNoPrefix: {
    type: String
  },
  counterTicker: {
    type: Number
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
    trim: true
  },
  contactPhone: {
    type: String,
    trim: true
  },
  yearlyFee: {
    type: Number
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedBy: {
    type: String
  },
  deletedAt: {
    type: Date
  },
  licenseStatus: {
    type: String,
    enum: ["Activated", "Trial"]
  },
  licenseStartDate: {
    type: Date
  },
  licenseEndDate: {
    type: Date
  },
  createdBy: {
    type: String
  }
}, { timestamps: true });

module.exports = mongoose.model("Company", companySchema);