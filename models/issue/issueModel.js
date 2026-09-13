const mongoose = require("mongoose");

const issueSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, "Issue title is required"],
        trim: true
    },
    category: {
        type: String,
        enum: ["Bug / Technical Error", "UI / Display Issue", "Performance / Speed", "Billing / License", "Feature Request", "Other"],
        default: "Bug / Technical Error"
    },
    priority: {
        type: String,
        enum: ["Low", "Medium", "High", "Critical"],
        default: "Medium"
    },
    description: {
        type: String,
        required: [true, "Issue description is required"],
        trim: true
    },
    image: {
        type: String,
        default: ""
    },
    status: {
        type: String,
        enum: ["Pending", "In Progress", "Resolved", "Closed"],
        default: "Pending"
    },
    reportedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    reporterName: {
        type: String,
        default: ""
    },
    reporterEmail: {
        type: String,
        default: ""
    },
    reporterRole: {
        type: String,
        default: ""
    },
    restaurantName: {
        type: String,
        default: "Chiya Town POS"
    }
}, {
    timestamps: true
});

module.exports = mongoose.model("Issue", issueSchema);
