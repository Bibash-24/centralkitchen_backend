const Issue = require("../../models/issue/issueModel");
const Restaurant = require("../../models/restaurant/restaurantModel");
const createHttpError = require("http-errors");
const { sendIssueEmail } = require("../../config/mailer");

/**
 * Create a new system issue & email support@genvixtech.com
 */
const createIssue = async (req, res, next) => {
    try {
        const { title, category, priority, description, image } = req.body || {};

        if (!title || !description) {
            return next(createHttpError(400, "Issue title and description are required."));
        }

        let restaurantName = "Chiya Town POS";
        try {
            const rest = await Restaurant.findOne();
            if (rest && rest.name) restaurantName = rest.name;
        } catch (e) {}

        const newIssue = new Issue({
            title: title.trim(),
            category: category || "Bug / Technical Error",
            priority: priority || "Medium",
            description: description.trim(),
            image: image || "",
            status: "Pending",
            reportedBy: req.user._id,
            reporterName: req.user.name || "System User",
            reporterEmail: req.user.email || req.user.phone || "",
            reporterRole: req.user.role || "Staff",
            restaurantName: restaurantName
        });

        await newIssue.save();

        // Dispatch email notification to support@genvixtech.com asynchronously
        try {
            sendIssueEmail({ issue: newIssue, reporter: req.user }).catch(() => {});
        } catch (mailErr) {
            console.error("Email trigger warning:", mailErr.message);
        }

        res.status(201).json({
            success: true,
            message: "Issue reported successfully! An email notification has been dispatched to support@genvixtech.com.",
            data: newIssue
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get all issues reported by the user (or all system issues for Admin/Superadmin)
 */
const getIssues = async (req, res, next) => {
    try {
        let query = {};
        // If not Admin or Superadmin, restrict to issues reported by the current user
        if (req.user.role !== "Admin" && req.user.role !== "Superadmin") {
            query = { reportedBy: req.user._id };
        }

        const issues = await Issue.find(query)
            .sort({ createdAt: -1 })
            .populate("reportedBy", "name email phone role");

        res.status(200).json({
            success: true,
            message: "Issues retrieved successfully",
            data: issues
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update issue status (Admin / Superadmin only)
 */
const updateIssueStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status || !["Pending", "In Progress", "Resolved", "Closed"].includes(status)) {
            return next(createHttpError(400, "Valid status ('Pending', 'In Progress', 'Resolved', 'Closed') is required."));
        }

        const updatedIssue = await Issue.findByIdAndUpdate(
            id,
            { status },
            { new: true }
        );

        if (!updatedIssue) {
            return next(createHttpError(404, "Issue not found."));
        }

        res.status(200).json({
            success: true,
            message: `Issue status updated to '${status}' successfully!`,
            data: updatedIssue
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete a single issue by ID
 */
const deleteIssue = async (req, res, next) => {
    try {
        const { id } = req.params;
        const deleted = await Issue.findByIdAndDelete(id);
        if (!deleted) {
            return next(createHttpError(404, "Issue not found."));
        }
        res.status(200).json({
            success: true,
            message: "Issue deleted successfully.",
            data: deleted
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Clear all issues (Admin / Superadmin only)
 */
const clearAllIssues = async (req, res, next) => {
    try {
        const result = await Issue.deleteMany({});
        res.status(200).json({
            success: true,
            message: `All ${result.deletedCount} issue record(s) deleted successfully from database.`
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createIssue,
    getIssues,
    updateIssueStatus,
    deleteIssue,
    clearAllIssues
};
