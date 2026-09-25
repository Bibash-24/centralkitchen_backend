const mongoose = require("mongoose");

const rolePermissionSchema = new mongoose.Schema({
    companySlug: {
        type: String,
        required: true,
        default: "global",
        index: true
    },
    role: {
        type: String,
        required: true
    },
    allowedMenus: {
        type: [String],
        default: []
    },
    allowedSubMenus: {
        type: [String],
        default: []
    },
    submenuActions: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
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

rolePermissionSchema.index({ companySlug: 1, role: 1 }, { unique: true });

module.exports = mongoose.model("RolePermission", rolePermissionSchema);
