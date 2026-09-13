const mongoose = require("mongoose");

const comboSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    itemsList: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    original: {
        type: Number,
        required: true
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
    timestamps: true
});

module.exports = mongoose.model("Combo", comboSchema);
