const mongoose = require("mongoose");

const rolePermissionSchema = new mongoose.Schema({
    role: {
        type: String,
        required: true,
        unique: true
    },
    allowedMenus: {
        type: [String],
        default: []
    },
    allowedSubMenus: {
        type: [String],
        default: []
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
        default: "System"
    },
    updatedOn: {
        type: Date,
        required: false
    },
    isDeleted: {
        type: Boolean,
        default: false
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

module.exports = mongoose.model("RolePermission", rolePermissionSchema);
