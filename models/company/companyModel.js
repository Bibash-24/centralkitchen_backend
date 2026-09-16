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
  address: {
    type: String,
    default: "Mid Baneshwor, Kathmandu, Nepal",
    trim: true
  },
  panNumber: {
    type: String,
    default: "609548231",
    trim: true
  },
  defaultCurrency: {
    type: String,
    default: "रु",
    trim: true
  },
  openingTime: {
    type: String,
    default: "08:00 AM"
  },
  closingTime: {
    type: String,
    default: "09:00 PM"
  },
  isVatApplicable: {
    type: Boolean,
    default: true
  },
  vatPercentage: {
    type: Number,
    default: 13
  },
  logo: {
    type: String,
    default: ""
  },
  paymentQrCode: {
    type: String,
    default: ""
  },
  yearlyFee: {
    type: Number,
    default: 25000
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
    type: String,
    default: ""
  },
  deletedAt: {
    type: Date,
    default: null
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
