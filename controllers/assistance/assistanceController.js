const mongoose = require("mongoose");
const AssistanceRequest = require("../../models/assistance/assistanceModel");
const Notification = require("../../models/notification/notificationModel");
const createError = require("http-errors");

const createRequest = async (req, res, next) => {
    try {
        const { tableNo, tableId } = req.body;
        if (!tableNo) {
            const error = createError(400, "tableNo is required!");
            return next(error);
        }

        // Check if there is already an active Pending request for this table
        let existing = await AssistanceRequest.findOne({ tableNo, status: "Pending" });
        if (existing) {
            return res.status(200).json({
                success: true,
                message: "Assistance is already requested for this table. A staff member is on their way!",
                data: existing
            });
        }

        const newRequest = new AssistanceRequest({
            tableNo,
            tableId: tableId || null
        });

        await newRequest.save();

        // Automatically create notification record in database
        const newNotification = new Notification({
            type: "assistance",
            title: "Assistance Called",
            message: `Table ${tableNo} is calling for assistance`,
            targetId: newRequest._id
        });
        await newNotification.save().catch(() => {});

        res.status(201).json({
            success: true,
            message: "Assistance request registered successfully. A staff member will be with you shortly!",
            data: newRequest
        });
    } catch (error) {
        next(error);
    }
};

const getRequests = async (req, res, next) => {
    try {
        // Return all requests sorted by status (Pending first) and date
        const requests = await AssistanceRequest.find({})
            .populate("tableId")
            .sort({ status: 1, createdAt: -1 });

        res.status(200).json({
            success: true,
            message: "Assistance requests retrieved successfully",
            data: requests
        });
    } catch (error) {
        next(error);
    }
};

const completeRequest = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            const error = createError(400, "Invalid assistance request ID format");
            return next(error);
        }

        const request = await AssistanceRequest.findByIdAndUpdate(
            id,
            { status: "Completed" },
            { new: true }
        );

        if (!request) {
            const error = createError(404, "Assistance request not found");
            return next(error);
        }

        // Automatically resolve database notifications when request is completed
        await Notification.updateMany({ targetId: id }, { isRead: true }).catch(() => {});

        res.status(200).json({
            success: true,
            message: "Assistance request completed successfully",
            data: request
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { createRequest, getRequests, completeRequest };
