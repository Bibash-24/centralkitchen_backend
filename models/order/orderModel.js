const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
  companySlug: { type: String, default: "main-kitchen", required: true, index: true },
  menuItemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "MenuItem",
    required: true
  },
  name: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true, min: 0 },
  notes: { type: String, default: "" }
}, { _id: false });

const orderTimelineSchema = new mongoose.Schema({
  action: { type: String, required: true },
  status: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  user: { type: String, default: "System" },
  notes: { type: String, default: "" }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderNo: {
    type: String,
    required: true,
    unique: true
  },
  recipientName: {
    type: String,
    required: true,
    trim: true
  },
  recipientPhone: {
    type: String,
    required: true,
    trim: true
  },
  deliveryAddress: {
    type: String,
    required: true,
    trim: true
  },
  notes: {
    type: String,
    default: ""
  },
  items: [orderItemSchema],
  totalAmount: {
    type: Number,
    required: true,
    default: 0
  },
  paymentMethod: {
    type: String,
    enum: ["Cash on Delivery", "Online / Transfer", "Credit / Account", "Prepaid"],
    default: "Cash on Delivery"
  },
  paymentStatus: {
    type: String,
    enum: ["Pending", "Paid", "Partially Paid", "Cancelled"],
    default: "Pending"
  },
  deliveryStatus: {
    type: String,
    enum: [
      "Created",
      "Preparing",
      "Ready for Dispatch",
      "Out for Delivery",
      "Delivered",
      "Cancelled"
    ],
    default: "Created"
  },
  rider: {
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      default: null
    },
    name: { type: String, default: "" },
    phone: { type: String, default: "" },
    assignedAt: { type: Date, default: null }
  },
  timeline: [orderTimelineSchema],
  createdBy: {
    type: String,
    default: "Kitchen Staff"
  },
  updatedBy: {
    type: String,
    default: "Kitchen Staff"
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

module.exports = mongoose.model("Order", orderSchema);
