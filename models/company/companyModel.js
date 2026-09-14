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
  isActive: {
    type: Boolean,
    default: true
  },
  enabledModules: {
    type: [String],
    default: []
  },
  createdBy: {
    type: String,
    default: "Superadmin"
  }
}, { timestamps: true });

module.exports = mongoose.model("Company", companySchema);
