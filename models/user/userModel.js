const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },

    email: {
        type: String,
        required: true,
        validate: {
            validator: function (v) {
                return /\S+@\S+\.\S+/.test(v);
            },
            message: "Email must be in valid format!"
        }
    },

    phone: {
        type: Number,
        required: true,
        validate: {
            validator: function (v) {
                return /^\d{10}$/.test(String(v));
            },
            message: "Phone number must be a 10-digit number!"
        }
    },

    password: {
        type: String,
        required: true,
    },

    companySlug: { type: String, default: "main-kitchen", index: true },
  role: {
        type: String,
        required: false
    },
    allowed: {
        type: Boolean,
        default: true
    },
    isApproved: {
        type: String,
        default: 'approved'
    },
    pin: {
        type: String,
        required: false
    },
    image: {
        type: String,
        required: false
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
}, { timestamps: true })

userSchema.pre('save', async function () {
    if (this.isModified('password') && this.password) {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
    }
    
    if (this.isModified('pin') && this.pin) {
        const salt = await bcrypt.genSalt(10);
        this.pin = await bcrypt.hash(this.pin, salt);
    }
});

module.exports = mongoose.model("User", userSchema);