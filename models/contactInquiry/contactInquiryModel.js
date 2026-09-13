const mongoose = require('mongoose');

const contactInquirySchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Sender name is required'],
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Sender email is required'],
        trim: true,
        lowercase: true
    },
    phone: {
        type: String,
        trim: true,
        default: ''
    },
    subject: {
        type: String,
        required: [true, 'Inquiry subject is required'],
        trim: true
    },
    message: {
        type: String,
        required: [true, 'Message content is required'],
        trim: true
    },
    status: {
        type: String,
        enum: ['New', 'In Review', 'Contacted', 'Resolved', 'Closed'],
        default: 'New'
    },
    crmNotes: {
        type: String,
        trim: true,
        default: ''
    },
    isDeleted: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('ContactInquiry', contactInquirySchema);
