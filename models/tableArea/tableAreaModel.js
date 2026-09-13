const mongoose = require("mongoose");

const tableAreaSchema = new mongoose.Schema({
    tableArea: {
        type: String,
        required: true,
        unique: true
    },
    noOfTables: {
        type: Number,
        required: true
    },
    noOfSitting: {
        type: Number,
        required: true,
        default: 4
    },
    hourlyRate: {
        type: Number,
        default: 0
    },
    description: {
        type: String
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isDeleted: {
        type: Boolean,
        default: false
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
}, { 
    id: false,
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

tableAreaSchema.virtual("tables", {
    ref: "TableDetails",
    localField: "_id",
    foreignField: "tableArea"
});

module.exports = mongoose.model("TableArea", tableAreaSchema);
