const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema({
  companySlug: { type: String, default: "main-kitchen", required: true, index: true },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, default: "" },
  address: { type: String, default: "" },
  creditLimit: { type: Number, default: 10000 },
  currentBalance: { type: Number, default: 0 },
  isBlacklisted: { type: Boolean, default: false },
  blacklistReason: { type: String, default: "" },
  creditHistory: [
    {
      type: { type: String, enum: ["credit", "payment", "waiver"], required: true },
      amount: { type: Number, required: true },
      orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
      orderNo: { type: String },
      note: { type: String, default: "" },
      timestamp: { type: Date, default: Date.now }
    }
  ],
  isDeleted: { type: Boolean, default: false },
  createdBy: { type: String },
  createdOn: { type: Date, default: Date.now },
  updatedBy: { type: String },
  updatedOn: { type: Date },
  deletedBy: { type: String },
  deletedOn: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model("Customer", customerSchema);
