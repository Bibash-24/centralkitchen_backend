const mongoose = require("mongoose");

const assistanceRequestSchema = new mongoose.Schema({
    tableNo: {
        type: String,
        required: true
    },
    tableId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TableDetails"
    },
    status: {
        type: String,
        enum: ["Pending", "Completed"],
        default: "Pending"
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("AssistanceRequest", assistanceRequestSchema);
