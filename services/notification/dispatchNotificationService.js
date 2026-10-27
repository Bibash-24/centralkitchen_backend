const mongoose = require("mongoose");
const Notification = require("../../models/notification/notificationModel");
const RestaurantConfig = require("../../models/restaurant/restaurantModel");

const getCompanyPrefix = (slug) => {
    if (!slug || typeof slug !== "string") return "DSP";
    const parts = slug.split(/[-_]+/).filter(Boolean);
    const initials = parts.map(part => part.charAt(0).toUpperCase()).join("");
    return initials || "DSP";
};

const formatOrderNo = (orderNo, slug) => {
    if (!orderNo) return "";
    const str = String(orderNo).trim();
    const prefix = getCompanyPrefix(slug);
    if (str.includes("-")) {
        const parts = str.split("-");
        const numPart = parts[parts.length - 1];
        if (prefix && (parts[0].toUpperCase() === "CK" || parts[0].toUpperCase() === "DSP") && prefix !== parts[0].toUpperCase() && slug && slug.toLowerCase() !== "central-kitchen" && slug.toLowerCase() !== "ck") {
            return `${prefix}-${numPart}`;
        }
        return str;
    }
    return `${prefix}-${str.padStart(4, "0")}`;
};

const DISPATCH_EVENTS = {
    NEW_ORDER: "NEW_ORDER",
    ORDER_APPROVED: "ORDER_APPROVED",
    ORDER_REJECTED: "ORDER_REJECTED",
    RIDER_ASSIGNED: "RIDER_ASSIGNED",
    DISPATCH_STARTED: "DISPATCH_STARTED",
    PICKED_UP: "PICKED_UP",
    IN_TRANSIT: "IN_TRANSIT",
    ARRIVED: "ARRIVED",
    PENDING_RECEIVER_CONFIRMATION: "PENDING_RECEIVER_CONFIRMATION",
    DELIVERED: "DELIVERED"
};

// Streamlined Notification Model: Only essential bookend alerts + exception alerts
const ALLOWED_DISPATCH_NOTIFICATIONS = new Set([
    DISPATCH_EVENTS.NEW_ORDER,
    DISPATCH_EVENTS.DELIVERED,
    DISPATCH_EVENTS.ORDER_REJECTED
]);

/**
 * Build professional, contextual title and message for each dispatch event
 */
const buildNotificationContent = (event, order, extra = {}) => {
    const effectiveSlug = order.companySlug || extra.companySlug;
    const orderNo = formatOrderNo(order.orderNo, effectiveSlug) || "Order";
    const doNumber = order.doNumber ? " (DO: " + order.doNumber + ")" : "";
    const customer = order.recipientName || "Customer";
    const destination = order.deliveryAddress || "Destination";
    const defaultWarehouse = effectiveSlug
        ? `${effectiveSlug.split(/[-_]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")} Warehouse`
        : "Main Warehouse";
    const source = order.sourceWarehouse || defaultWarehouse;
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

                case DISPATCH_EVENTS.ARRIVED:
        case "PENDING_RECEIVER_CONFIRMATION":
        case DISPATCH_EVENTS.PENDING_RECEIVER_CONFIRMATION: {
            const franchiseLabel = order.franchise ? " (" + order.franchise + ")" : (order.branch ? " (" + order.branch + ")" : "");
            return {
                title: "Rider Arrived: " + orderNo,
                message: "Rider " + riderName + " has arrived at " + destination + franchiseLabel + " for " + (order.doNumber ? "DO: " + order.doNumber : "order " + orderNo) + ". Awaiting receiver confirmation."
            };
        }

        case DISPATCH_EVENTS.DELIVERED: {
            const atDestination = destination ? " at " + destination : "";
            const hasSig = Boolean(order.receiverConfirmation?.signature);
            const sigText = hasSig ? " with verified digital signature confirmation" : "";
            return {
                title: "Order Delivered: " + orderNo,
                message: "Order " + orderNo + doNumber + " has been successfully delivered" + atDestination + sigText + "."
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

                // Enforce streamlined dispatch notifications: Only NEW_ORDER, DELIVERED, and ORDER_REJECTED
        if (!ALLOWED_DISPATCH_NOTIFICATIONS.has(event)) {
            return null;
        }

        // Strict guard against premature DELIVERED notification:
        // An order cannot trigger a DELIVERED alert if its status is Out for Delivery or anything other than Delivered
        if (event === DISPATCH_EVENTS.DELIVERED) {
            const currentStatusNorm = String(order.deliveryStatus || order.status || "").toUpperCase().replace(/[\s\/\-]+/g, "_");
            if (currentStatusNorm.includes("OUT_FOR_DELIVERY") || currentStatusNorm !== "DELIVERED") {
                console.warn(`[CRITICAL GUARD] Blocked false DELIVERED notification for order ${order.orderNo} with status: "${order.deliveryStatus}"`);
                return null;
            }
        }

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

                // Step 5: Role-based arrival recipients
        const isArrivalEvent = event === DISPATCH_EVENTS.ARRIVED ||
                               event === "ARRIVED" ||
                               event === "PENDING_RECEIVER_CONFIRMATION" ||
                               event === DISPATCH_EVENTS.PENDING_RECEIVER_CONFIRMATION;

        // Potential recipients for arrival notification:
        // Franchise users, Franchise manager, Salesperson, Regional staff, Dispatch staff, Warehouse staff, Manager, Admin
        const arrivalRecipientRoles = [
            "franchise", "franchise manager", "franchise user",
            "sales", "salesperson", "sales person",
            "regional", "regional staff", "regional manager",
            "dispatch", "dispatch staff", "dispatch manager",
            "warehouse", "warehouse staff", "central kitchen",
            "manager", "company manager", "admin"
        ];

        if (isArrivalEvent) {
            try {
                const User = require("../../models/user/userModel");
                const potentialUsers = await User.find({
                    companySlug: escapedCompanyRegex,
                    isDeleted: { $ne: true }
                }).select("_id role franchise branch name email");

                potentialUsers.forEach(u => {
                    const uRoleLower = String(u.role || "").toLowerCase().trim();
                    const matchesRole = arrivalRecipientRoles.some(r => uRoleLower.includes(r));
                    const matchesFranchise = (order.franchise && u.franchise && String(u.franchise).toLowerCase() === String(order.franchise).toLowerCase()) ||
                                            (order.branch && u.branch && String(u.branch).toLowerCase() === String(order.branch).toLowerCase());

                    if (matchesRole || matchesFranchise) {
                        if (!recipientUserIds.some(existing => String(existing) === String(u._id))) {
                            recipientUserIds.push(new mongoose.Types.ObjectId(u._id));
                        }
                    }
                });
            } catch (userQueryErr) {
                console.error("Error resolving arrival recipient users:", userQueryErr);
            }
        }

        // Dynamic roles sourced directly from Delivery Setup and RBAC
        let rbacDeliveryRoles = [];
        try {
            const RolePermission = require("../../models/superadmin/rolePermissionModel");
            const rbacDocs = await RolePermission.find({
                companySlug: escapedCompanyRegex,
                allowedMenus: "deliveries",
                isDeleted: { $ne: true }
            }).select("role");
            rbacDeliveryRoles = rbacDocs.map(d => d.role).filter(Boolean);
        } catch (e) {
            console.error("Error querying RBAC delivery roles:", e);
        }

        const configuredSetupRoles = (config && (config.notifyRoles || config.deliveryNotifyRoles)) || [];
        const allowedRoles = Array.from(new Set([
            "Admin",
            "Superadmin",
            ...configuredSetupRoles,
            ...rbacDeliveryRoles
        ]));

        // Add all users having Admin or RBAC-enabled delivery roles in this company
        try {
            const User = require("../../models/user/userModel");
            const rbacUsers = await User.find({
                companySlug: escapedCompanyRegex,
                role: { $in: allowedRoles.map(r => new RegExp("^" + r.trim() + "$", "i")) },
                isDeleted: { $ne: true }
            }).select("_id");
            rbacUsers.forEach(u => {
                if (!recipientUserIds.some(existing => String(existing) === String(u._id))) {
                    recipientUserIds.push(new mongoose.Types.ObjectId(u._id));
                }
            });
        } catch (uErr) {
            console.error("Error adding RBAC users to notification recipients:", uErr);
        }

        const notificationData = {
            companySlug,
            type: "dispatch",
            event,
            title: content.title,
            message: content.message,
            targetId: String(order._id),
            orderId: order._id,
            orderNo: formatOrderNo(order.orderNo, companySlug) || "",
            doNumber: order.doNumber || "",
            source: order.sourceWarehouse || (companySlug ? `${companySlug.split(/[-_]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")} Warehouse` : "Main Warehouse"),
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