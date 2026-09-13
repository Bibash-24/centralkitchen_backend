const mongoose = require("mongoose");

const tableReservationSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    phone: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        trim: true,
        default: ""
    },
    guests: {
        type: String,
        required: true,
        trim: true
    },
    date: {
        type: String,
        required: true,
        trim: true
    },
    time: {
        type: String,
        required: true,
        trim: true
    },
    occasion: {
        type: String,
        default: ""
    },
    notes: {
        type: String,
        default: ""
    },
    status: {
        type: String,
        enum: ["New", "In Review", "Confirmed", "Completed", "Cancelled"],
        default: "New"
    },
    crmNotes: {
        type: String,
        default: ""
    },
    isDeleted: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

module.exports = mongoose.model("TableReservation", tableReservationSchema);
