const FranchiseInquiry = require("../../models/franchiseInquiry/franchiseInquiryModel");
const createError = require("http-errors");

// Public: Submit a new franchise inquiry from landing page
const submitFranchiseInquiry = async (req, res, next) => {
    try {
        const { fullName, phone, email, city, investmentBudget, experience, message } = req.body;

        if (!fullName || !fullName.trim()) {
            return next(createError(400, "Full Name is required!"));
        }
        if (!phone || !phone.trim()) {
            return next(createError(400, "Phone number is required!"));
        }
        if (!email || !email.trim()) {
            return next(createError(400, "Email address is required!"));
        }
        if (!city || !city.trim()) {
            return next(createError(400, "Location / City is required!"));
        }

        const newInquiry = await FranchiseInquiry.create({
            fullName: fullName.trim(),
            phone: phone.trim(),
            email: email.trim(),
            city: city.trim(),
            investmentBudget: investmentBudget || "",
            experience: experience || "",
            message: message || ""
        });

        res.status(201).json({
            success: true,
            message: "Franchise inquiry submitted successfully!",
            data: newInquiry
        });
    } catch (error) {
        next(error);
    }
};

// Protected / Admin: Get all franchise inquiries
const getFranchiseInquiries = async (req, res, next) => {
    try {
        const { status, search } = req.query;
        const query = { isDeleted: { $ne: true } };

        if (status && status !== "All") {
            query.status = status;
        }

        if (search && search.trim()) {
            const searchRegex = new RegExp(search.trim(), "i");
            query.$or = [
                { fullName: searchRegex },
                { phone: searchRegex },
                { email: searchRegex },
                { city: searchRegex }
            ];
        }

        const inquiries = await FranchiseInquiry.find(query).sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            message: "Franchise inquiries retrieved successfully",
            data: inquiries
        });
    } catch (error) {
        next(error);
    }
};

// Protected / Admin: Update inquiry status or CRM notes
const updateFranchiseInquiry = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;

        const inquiry = await FranchiseInquiry.findById(id);
        if (!inquiry || inquiry.isDeleted) {
            return next(createError(404, "Franchise inquiry not found!"));
        }

        if (status) inquiry.status = status;
        if (notes !== undefined) inquiry.notes = notes;

        await inquiry.save();

        res.status(200).json({
            success: true,
            message: "Franchise inquiry updated successfully",
            data: inquiry
        });
    } catch (error) {
        next(error);
    }
};

// Protected / Admin: Soft delete an inquiry
const deleteFranchiseInquiry = async (req, res, next) => {
    try {
        const { id } = req.params;

        const inquiry = await FranchiseInquiry.findById(id);
        if (!inquiry || inquiry.isDeleted) {
            return next(createError(404, "Franchise inquiry not found!"));
        }

        inquiry.isDeleted = true;
        await inquiry.save();

        res.status(200).json({
            success: true,
            message: "Franchise inquiry deleted successfully"
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    submitFranchiseInquiry,
    getFranchiseInquiries,
    updateFranchiseInquiry,
    deleteFranchiseInquiry
};
