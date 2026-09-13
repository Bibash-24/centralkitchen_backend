const mongoose = require("mongoose");

const tableSchema = new mongoose.Schema({
    tableNo: { type: String, required: true, unique: true },
    status: {
        type: String,
        default: "Empty"
    },
    seats: {
        type: Number,
        required: true
    },
    tableArea: { type: mongoose.Schema.Types.ObjectId, ref: "TableArea", required: true },
    currentOrder: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    parentTable: { type: mongoose.Schema.Types.ObjectId, ref: "TableDetails", default: null },
    sharingNum: { type: Number, default: null },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    qrLink: { type: String, default: null },
    qrImage: { type: String, default: null },
    qrGeneratedAt: { type: Date, default: null },
    createdBy: { type: String, required: false },
    createdOn: { type: Date, default: Date.now },
    updatedBy: { type: String, required: false },
    updatedOn: { type: Date, required: false },
    deletedBy: { type: String, required: false },
    deletedOn: { type: Date, required: false }
}, { timestamps: true });

tableSchema.index({ isDeleted: 1 });
tableSchema.index({ parentTable: 1 });

module.exports = mongoose.model("TableDetails", tableSchema, "tabledetails");