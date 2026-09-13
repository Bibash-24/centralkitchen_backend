const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const { superadminConn } = require("../../config/database");

const superadminSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    phone: {
        type: Number,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true,
    },
    role: {
        type: String,
        default: "Superadmin"
    },
    pin: {
        type: String,
        required: false
    },
    image: {
        type: String,
        required: false
    }
}, { timestamps: true });

superadminSchema.pre('save', async function () {
    if (this.isModified('password') && this.password) {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
    }
    if (this.isModified('pin') && this.pin) {
        const salt = await bcrypt.genSalt(10);
        this.pin = await bcrypt.hash(this.pin, salt);
    }
});

module.exports = superadminConn.model("Superadmin", superadminSchema);
