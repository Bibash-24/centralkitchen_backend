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
  notes: { type: String, default: "" },
  deliveredQuantity: { type: Number, default: null }
}, { _id: false });

const orderTimelineSchema = new mongoose.Schema({
  action: { type: String, required: true },
  status: { type: String, required: true },
  eventType: { type: String, default: "" },
  timestamp: { type: Date, default: Date.now },
  user: { type: String, default: "System" },
  notes: { type: String, default: "" },
  signature: { type: String, default: "" },
  companySlug: { type: String, default: "" },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
  orderNo: { type: String, default: "" },
  doNumber: { type: String, default: "" },
  deliveryBatch: { type: String, default: "" },
  rider: {
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff", default: null },
    name: { type: String, default: "" },
    phone: { type: String, default: "" }
  },
  location: {
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    accuracy: { type: Number, default: null },
    address: { type: String, default: "" },
    timestamp: { type: Date, default: null }
  }
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
    enum: ["Pending", "Paid", "Partially Paid", "Cancelled", "Refunded", "Credit", "Unpaid"],
    default: "Pending"
  },
  paymentReceived: {
    type: Boolean,
    default: false
  },
  paymentReceivedAt: {
    type: Date,
    default: null
  },
  paymentReceivedBy: {
    type: String,
    default: ""
  },
  paymentNotes: {
    type: String,
    default: ""
  },
  addedToCreditorAt: {
    type: Date,
    default: null
  },
  creditorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Creditor",
    default: null
  },
  deliveryStatus: {
    type: String,
    default: "Created"
  },
  doNumber: { type: String, default: "" },
  vehicleNo: { type: String, default: "" },
  deliveryBatch: { type: String, default: "" },
  sourceWarehouse: { type: String, default: "" },
  receiverConfirmation: {
    receiverUser: { type: String, default: "" },
    receiverName: { type: String, default: "" },
    receiverPhone: { type: String, default: "" },
    franchise: { type: String, default: "" },
    signature: { type: String, default: "" },
    notes: { type: String, default: "" },
    confirmedAt: { type: Date, default: null },
    itemsConfirmed: [
      {
        menuItemId: { type: String },
        name: { type: String },
        orderedQuantity: { type: Number, default: 1 },
        receivedQuantity: { type: Number, default: 1 },
        discrepancy: { type: Number, default: 0 }
      }
    ],
    hasDiscrepancy: { type: Boolean, default: false },
    discrepancyType: { type: String, default: "" },
    discrepancyNotes: { type: String, default: "" },
    issueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Issue",
      default: null
    }
  },
  inventoryDeducted: { type: Boolean, default: false },
  inventoryDeductedAt: { type: Date, default: null },
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
  lastLocation: {
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    accuracy: { type: Number, default: null },
    address: { type: String, default: "" },
    updatedAt: { type: Date, default: null }
  },
  // Step 6: GPS & Travel-Time Efficiency Audit
  dispatchTimestamp: { type: Date, default: null },
  arrivalTimestamp: { type: Date, default: null },
  completionTimestamp: { type: Date, default: null },

  deliveryDurationSeconds: { type: Number, default: null },
  deliveryDurationFormatted: { type: String, default: "" },

  dispatchLocation: {
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    accuracy: { type: Number, default: null },
    address: { type: String, default: "" },
    timestamp: { type: Date, default: null }
  },
  arrivalLocation: {
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    accuracy: { type: Number, default: null },
    address: { type: String, default: "" },
    timestamp: { type: Date, default: null }
  },
  completionLocation: {
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    accuracy: { type: Number, default: null },
    address: { type: String, default: "" },
    timestamp: { type: Date, default: null }
  },

  // Batch Delivery Metrics
  batchStartTime: { type: Date, default: null },
  batchCompletionTime: { type: Date, default: null },
  batchTotalDurationSeconds: { type: Number, default: null },
  batchTotalDurationFormatted: { type: String, default: "" },
  isBatchCompleted: { type: Boolean, default: false },
  timeline: [orderTimelineSchema],
  createdByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
    index: true
  },
  branch: { type: String, default: "" },
  franchise: { type: String, default: "" },
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
