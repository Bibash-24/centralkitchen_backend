const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
  menuItemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "MenuItem",
    required: true
  },
  name: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true, min: 0 },
  portion: { type: String, default: "" },
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
  companySlug: {
    type: String,
    
    required: true,
    index: true
  },
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
    required: true,
    default: "Cash on Delivery"
  },
  paymentStatus: {
    type: String,
    enum: ["Pending", "Paid", "Partially Paid", "Cancelled", "Refunded"],
    default: "Pending"
  },
  deliveryStatus: {
    type: String,
    default: "Created"
  },
  doNumber: { type: String, default: "" },
  vehicleNo: { type: String, default: "" },
  cancellationReason: { type: String, default: "" },
  returnReason: { type: String, default: "" },
  returnType: { type: String, default: "" },
  returnNotes: { type: String, default: "" },
  returnedBy: { type: String, default: "" },
  returnedAt: { type: Date, default: null },
  cancelReason: { type: String, default: "" },
  cancelledBy: { type: String, default: "" },
  cancelledTimestamp: { type: Date, default: null },
  priority: { type: String, default: "Normal" },
  requestedDeliveryDate: { type: String, default: "" },
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
