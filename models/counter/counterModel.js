const mongoose = require("mongoose");

const counterSchema = new mongoose.Schema({
  _id: {
    companySlug: { type: String, required: true, default: "main-kitchen" },
    seqName: { type: String, required: true }
  },
  seq: { type: Number, default: 0 }
});

module.exports = mongoose.model("Counter", counterSchema);
