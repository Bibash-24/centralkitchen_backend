const mongoose = require("mongoose");

const staffSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        default: ""
    },
    phone: {
        type: String,
        required: true,
        unique: true
    },
    panNumber: {
        type: String,
        default: ""
    },
    citizenshipNumber: {
        type: String,
        default: ""
    },
    salary: {
        type: Number,
        default: 0
    },
    isCurrentlyEmployed: {
        type: Boolean,
        default: true
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
}, { timestamps: true });

module.exports = mongoose.model("Staff", staffSchema);
