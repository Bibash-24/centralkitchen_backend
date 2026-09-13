const ContactInquiry = require('../../models/contactInquiry/contactInquiryModel');

// @desc    Submit a new contact inquiry (Public)
// @route   POST /api/contact-inquiry
// @access  Public
const submitContactInquiry = async (req, res, next) => {
    try {
        const { name, email, phone, subject, message } = req.body;

        if (!name || !email || !subject || !message) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields (name, email, subject, message).'
            });
        }

        const newInquiry = await ContactInquiry.create({
            name,
            email,
            phone: phone || '',
            subject,
            message,
            status: 'New'
        });

        return res.status(201).json({
            success: true,
            message: 'Your message has been received successfully!',
            data: newInquiry
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get all contact inquiries (Admin / Management)
// @route   GET /api/contact-inquiry
// @access  Private
const getContactInquiries = async (req, res, next) => {
    try {
        const { status, search } = req.query;
        let query = { isDeleted: false };

        if (status && status !== 'All') {
            query.status = status;
        }

        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { name: searchRegex },
                { email: searchRegex },
                { phone: searchRegex },
                { subject: searchRegex }
            ];
        }

        const inquiries = await ContactInquiry.find(query).sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: inquiries.length,
            data: inquiries
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update status or CRM notes for a contact inquiry (Admin)
// @route   PUT /api/contact-inquiry/:id
// @access  Private
const updateContactInquiry = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status, crmNotes, notes } = req.body;

        const inquiry = await ContactInquiry.findOne({ _id: id, isDeleted: false });

        if (!inquiry) {
            return res.status(404).json({
                success: false,
                message: 'Contact inquiry record not found'
            });
        }

        if (status) inquiry.status = status;
        if (crmNotes !== undefined) inquiry.crmNotes = crmNotes;
        else if (notes !== undefined) inquiry.crmNotes = notes;

        await inquiry.save();

        return res.status(200).json({
            success: true,
            message: 'Contact inquiry updated successfully',
            data: inquiry
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Soft delete a contact inquiry (Admin)
// @route   DELETE /api/contact-inquiry/:id
// @access  Private
const deleteContactInquiry = async (req, res, next) => {
    try {
        const { id } = req.params;

        const inquiry = await ContactInquiry.findOne({ _id: id, isDeleted: false });

        if (!inquiry) {
            return res.status(404).json({
                success: false,
                message: 'Contact inquiry record not found'
            });
        }

        inquiry.isDeleted = true;
        await inquiry.save();

        return res.status(200).json({
            success: true,
            message: 'Contact inquiry deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    submitContactInquiry,
    getContactInquiries,
    updateContactInquiry,
    deleteContactInquiry
};
