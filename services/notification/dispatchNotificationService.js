const mongoose = require("mongoose");
const Notification = require("../../models/notification/notificationModel");
const RestaurantConfig = require("../../models/restaurant/restaurantModel");

const DISPATCH_EVENTS = {
    NEW_ORDER: "NEW_ORDER",
    ORDER_APPROVED: "ORDER_APPROVED",
    ORDER_REJECTED: "ORDER_REJECTED",
    RIDER_ASSIGNED: "RIDER_ASSIGNED",
    DISPATCH_STARTED: "DISPATCH_STARTED",
    PICKED_UP: "PICKED_UP",
    IN_TRANSIT: "IN_TRANSIT",
    DELIVERED: "DELIVERED"
};

/**
 * Build professional, contextual title and message for each dispatch event
 */
const buildNotificationContent = (event, order, extra = {}) => {
    const orderNo = order.orderNo || "Order";
    const doNumber = order.doNumber ? " (DO: " + order.doNumber + ")" : "";
    const customer = order.recipientName || "Customer";
    const destination = order.deliveryAddress || "Destination";
    const source = order.sourceWarehouse || "Central Kitchen";
    const riderName = order.rider?.name || extra.riderName || "Rider";

    switch (event) {
        case DISPATCH_EVENTS.NEW_ORDER:
            return {
                title: "New Dispatch Order: " + orderNo,
                message: "New delivery order " + orderNo + doNumber + " for " + customer + " at " + destination + " has been received."
            };

        case DISPATCH_EVENTS.ORDER_APPROVED:
            return {
                title: "Order Approved: " + orderNo,
                message: "Order " + orderNo + doNumber + " has been approved and moved to Ready for Dispatch."
            };

        case DISPATCH_EVENTS.ORDER_REJECTED: {
            const reason = extra.reason || order.cancellationReason || order.cancelReason || "";
            return {
                title: "Order Rejected: " + orderNo,
                message: "Order " + orderNo + doNumber + " has been rejected/cancelled." + (reason ? " Reason: " + reason : "")
            };
        }

        case DISPATCH_EVENTS.RIDER_ASSIGNED:
            return {
                title: "Rider Assigned: " + orderNo,
                message: "Rider " + riderName + " has been assigned to order " + orderNo + doNumber + " for delivery to " + destination + "."
            };

        case DISPATCH_EVENTS.DISPATCH_STARTED:
            return {
                title: "Dispatch Started: " + orderNo,
                message: "Dispatch process initiated for order " + orderNo + doNumber + " to " + destination + " with rider " + riderName + "."
            };

        case DISPATCH_EVENTS.PICKED_UP:
            return {
                title: "Order Picked Up: " + orderNo,
                message: "Rider " + riderName + " has picked up order " + orderNo + doNumber + " from " + source + "."
            };

        case DISPATCH_EVENTS.IN_TRANSIT:
            return {
                title: "Order In Transit: " + orderNo,
                message: "Order " + orderNo + doNumber + " is now in transit towards " + destination + " with rider " + riderName + "."
            };

        case DISPATCH_EVENTS.DELIVERED: {
            const receiver = order.receiverConfirmation?.receiverName || "Customer";
            return {
                title: "Order Delivered: " + orderNo,
                message: "Order " + orderNo + doNumber + " has been successfully delivered to " + receiver + " at " + destination + "."
            };
        }

        default:
            return {
                title: "Dispatch Update: " + orderNo,
                message: "Order " + orderNo + doNumber + " status updated to " + (order.deliveryStatus || "Updated") + "."
            };
    }
};

/**
 * Creates and persists an internal dispatch notification using existing DeliGati notification architecture.
 * Strictly scopes every notification to order.companySlug to prevent tenant data leakage.
 * Roles and permissions are dynamically derived from Delivery Setup (RestaurantConfig), never hardcoded.
 *
 * @param {Object} params
 * @param {string} params.event - One of DISPATCH_EVENTS
 * @param {Object} params.order - The Order document
 * @param {Object} [params.actor] - The req.user who performed the action
 * @param {Object} [params.extra] - Additional context (e.g. reason, riderName)
 */
const sendDispatchNotification = async ({ event, order, actor, extra = {} }) => {
    try {
        if (!order || !order._id || !event) return null;

        const rawCompanySlug = order.companySlug || actor?.companySlug || "";
        const companySlug = String(rawCompanySlug).trim();

        if (!companySlug) {
            console.warn("sendDispatchNotification skipped: missing companySlug for order", order._id);
            return null;
        }

        const escapedCompanyRegex = {
            $regex: new RegExp("^" + companySlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i")
        };

        // Query Delivery Setup dynamically for this specific company
        const config = await RestaurantConfig.findOne({ companySlug: escapedCompanyRegex });
        if (config && config.deliveryNotificationEnabled === false) {
            // Delivery notifications explicitly disabled in Delivery Setup for this company
            return null;
        }

        const content = buildNotificationContent(event, order, extra);

        // Deduplication guard: Prevent duplicate notification within 30 seconds for the same event, order, and company
        const recentDuplicate = await Notification.findOne({
            companySlug: escapedCompanyRegex,
            type: "dispatch",
            event,
            targetId: String(order._id),
            createdAt: { $gte: new Date(Date.now() - 30 * 1000) }
        });

        if (recentDuplicate) {
            return recentDuplicate;
        }

        // Link original creator (e.g. Franchise requester)
        const createdByUserId = order.createdByUserId || (actor && actor._id ? actor._id : null);
        const recipientUserIds = [];
        if (createdByUserId && mongoose.Types.ObjectId.isValid(createdByUserId)) {
            recipientUserIds.push(new mongoose.Types.ObjectId(createdByUserId));
        }

        // Add explicit users configured in Delivery Setup
        if (config && Array.isArray(config.notifyUsers)) {
            config.notifyUsers.forEach(uid => {
                if (uid && mongoose.Types.ObjectId.isValid(uid)) {
                    if (!recipientUserIds.some(existing => String(existing) === String(uid))) {
                        recipientUserIds.push(new mongoose.Types.ObjectId(uid));
                    }
                }
            });
        }

        // Dynamic roles sourced directly from Delivery Setup
        const configuredSetupRoles = (config && (config.notifyRoles || config.deliveryNotifyRoles)) || [];
        const allowedRoles = Array.isArray(configuredSetupRoles) && configuredSetupRoles.length > 0
            ? configuredSetupRoles
            : ["Admin", "Manager"]; // Administrative default

        const notificationData = {
            companySlug,
            type: "dispatch",
            event,
            title: content.title,
            message: content.message,
            targetId: String(order._id),
            orderId: order._id,
            orderNo: order.orderNo || "",
            doNumber: order.doNumber || "",
            source: order.sourceWarehouse || "Central Kitchen",
            destination: order.deliveryAddress || "",
            branch: order.branch || "",
            franchise: order.franchise || "",
            rider: {
                staffId: order.rider?.staffId || null,
                name: order.rider?.name || extra.riderName || "",
                phone: order.rider?.phone || ""
            },
            createdByUserId: createdByUserId || null,
            recipientUserIds,
            allowedRoles,
            metadata: {
                totalAmount: order.totalAmount || 0,
                priority: order.priority || "Normal",
                deliveryStatus: order.deliveryStatus || "",
                actorName: actor?.name || actor?.username || "System",
                actorRole: actor?.role || "Staff"
            },
            isRead: false,
            readBy: [],
            createdAt: new Date()
        };

        const createdNotification = await Notification.create(notificationData);
        return createdNotification;
    } catch (err) {
        console.error("sendDispatchNotification error:", err);
        return null;
    }
};

module.exports = {
    DISPATCH_EVENTS,
    buildNotificationContent,
    sendDispatchNotification
};