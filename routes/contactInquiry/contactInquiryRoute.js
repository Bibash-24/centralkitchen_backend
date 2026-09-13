const express = require('express');
const router = express.Router();
const {
    submitContactInquiry,
    getContactInquiries,
    updateContactInquiry,
    deleteContactInquiry
} = require('../../controllers/contactInquiry/contactInquiryController');

// Public route for submitting inquiries
router.post('/', submitContactInquiry);

// Admin routes for managing inquiries
router.get('/', getContactInquiries);
router.put('/:id', updateContactInquiry);
router.delete('/:id', deleteContactInquiry);

module.exports = router;
