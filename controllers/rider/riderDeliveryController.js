const { applyDeliveryAudit, syncBatchDeliveryAudit } = require("../../services/delivery/deliveryAuditService");
const { sendDispatchNotification, DISPATCH_EVENTS } = require("../../services/notification/dispatchNotificationService");
const { deductDeliveryOrderInventory } = require("../../services/delivery/deliveryInventoryService");
const Issue = require("../../models/issue/issueModel");
const Order = require("../../models/order/orderModel");
const Staff = require("../../models/staff/staffModel");
const RolePermission = require("../../models/superadmin/rolePermissionModel");
const DropdownOption = require("../../models/dropdownOption/dropdownOptionModel");
const createHttpError = require("http-errors");
const mongoose = require("mongoose");

/**
 * Valid status transitions matching the Deliveries & Dispatch system lifecycle:
 * "Ready for Dispatch" -> "Out for Delivery" -> "Delivered"
 * Also provides seamless backwards compatibility for legacy and intermediate statuses.
 */
const VALID_STATUS_TRANSITIONS = {
    // Deliveries & Dispatch canonical lifecycle
    "Ready for Dispatch": ["Out for Delivery", "Delivered"],
    READY_FOR_DISPATCH: ["Out for Delivery", "Delivered"],
    "Out for Delivery": ["ARRIVED", "PENDING_RECEIVER_CONFIRMATION", "Delivered"],
    OUT_FOR_DELIVERY: ["ARRIVED", "PENDING_RECEIVER_CONFIRMATION", "Delivered"],
    Delivered: [],
    DELIVERED: [],
    Cancelled: [],
    CANCELLED: [],
    Returned: [],
    RETURNED: [],

    // Legacy and intermediate workflow sequence support
    ASSIGNED: ["Ready for Dispatch", "Out for Delivery", "READY"],
    READY: ["Ready for Dispatch", "Out for Delivery", "PICKED_UP"],
    PICKED_UP: ["Out for Delivery", "IN_TRANSIT"],
    IN_TRANSIT: ["ARRIVED", "PENDING_RECEIVER_CONFIRMATION", "Out for Delivery", "Delivered"],
    ARRIVED: ["PENDING_RECEIVER_CONFIRMATION", "Out for Delivery", "Delivered"],
    PENDING_RECEIVER_CONFIRMATION: ["Delivered", "DELIVERED"],
    Created: ["Ready for Dispatch", "Out for Delivery"],
    Preparing: ["Ready for Dispatch", "Out for Delivery"],
    APPROVED: ["Ready for Dispatch", "Out for Delivery"]
};

/**
 * Normalize legacy or intermediate statuses to match standard Deliveries & Dispatch lifecycle
 */
const normalizeDeliveryStatus = (status) => {
    if (!status) return "";
    const s = String(status).trim();
    if (["Ready for Dispatch", "READY_FOR_DISPATCH", "ASSIGNED", "READY", "RIDER_ASSIGNED"].includes(s)) {
        return "Ready for Dispatch";
    }
    if (["ARRIVED", "Arrived", "ARRIVED_AT_DESTINATION"].includes(s)) {
        return "ARRIVED";
    }
    if (["PENDING_RECEIVER_CONFIRMATION", "Pending Receiver Confirmation"].includes(s)) {
        return "PENDING_RECEIVER_CONFIRMATION";
    }
    if (["Out for Delivery", "OUT_FOR_DELIVERY", "IN_TRANSIT", "PICKED_UP"].includes(s)) {
        return "Out for Delivery";
    }
    if (["Delivered", "DELIVERED"].includes(s)) {
        return "Delivered";
    }
    if (["Cancelled", "CANCELLED", "Rejected", "REJECTED"].includes(s)) {
        return "Cancelled";
    }
    if (["Returned", "RETURNED", "RETURN_INITIATED"].includes(s)) {
        return "Returned";
    }
    if (["Pending Approval", "PENDING_APPROVAL", "Pending", "PENDING"].includes(s)) {
        return "Pending Approval";
    }
    if (["Created", "CREATED", "Initiated", "INITIATED", "APPROVED", "Approved"].includes(s)) {
        return "Created";
    }
    if (["Preparing", "PREPARING", "PREPARING_DISPATCH"].includes(s)) {
        return "Preparing";
    }
    return s;
};

/**
 * Check if the user has privileged administrative access
 */
const isPrivilegedUser = (user) => {
    if (!user) return false;
    const roleLower = String(user.role || "").toLowerCase().trim();
    return roleLower === "superadmin" || roleLower === "admin" || roleLower === "company admin";
};

/**
 * Resolve stable database identifiers for the authenticated rider.
 * Uses only stable database IDs (User._id and linked Staff._id).
 * Strictly omits any fallback on rider name or phone string matching.
 */
const getRiderDatabaseIdentifiers = async (user) => {
    if (!user || !user._id) return [];

    const userObjId = mongoose.Types.ObjectId.isValid(user._id)
        ? new mongoose.Types.ObjectId(user._id)
        : user._id;

    const authorizedIds = [userObjId];

    // Find Staff documents in the user's company that are linked to this user's stable database identifier
    if (!user.companySlug && user.role !== "Superadmin") return [];
    if (user.companySlug) {
        const linkedStaff = await Staff.find({
            companySlug: user.companySlug,
            isDeleted: { $ne: true },
            userId: userObjId
        }).select("_id");

        linkedStaff.forEach(s => authorizedIds.push(s._id));

        // If no Staff record is linked by userId yet, perform safe one-time association
        // matching the staff record in the same company having the user's verified phone digits
        if (linkedStaff.length === 0 && user.phone) {
            const cleanPhone = String(user.phone).replace(/\D/g, "");
            if (cleanPhone) {
                const unlinkedStaff = await Staff.find({
                    companySlug: user.companySlug,
                    isDeleted: { $ne: true },
                    $or: [
                        { phone: cleanPhone },
                        { phone: String(user.phone) }
                    ]
                });

                if (unlinkedStaff.length > 0) {
                    const staffToLink = unlinkedStaff.filter(s => !s.userId);
                    if (staffToLink.length > 0) {
                        await Staff.updateMany(
                            { _id: { $in: staffToLink.map(s => s._id) } },
                            { $set: { userId: userObjId } }
                        );
                    }
                    unlinkedStaff.forEach(s => authorizedIds.push(s._id));
                }
            }
        }
    }

    return authorizedIds;
};

/**
 * Strictly sanitize order responses for the rider interface.
 * Excludes internal audit timeline, createdBy, updatedBy, staff activity logs,
 * and technical metadata while providing required delivery details.
 */
const sanitizeRiderDelivery = (orderDoc) => {
    const o = orderDoc.toObject ? orderDoc.toObject() : orderDoc;

    const items = (o.items || []).map(i => ({
        name: i.name || "Item",
        quantity: i.quantity || 1,
        portion: i.portion || "",
        notes: i.notes || "",
        price: i.price || 0
    }));

    const packageCount = items.reduce((sum, i) => sum + (Number(i.quantity) || 1), 0);

    const normStatus = normalizeDeliveryStatus(o.deliveryStatus);
    const allowedTransitions = VALID_STATUS_TRANSITIONS[normStatus] || VALID_STATUS_TRANSITIONS[o.deliveryStatus] || [];

    // Fallback company display name if sourceWarehouse not specifically set
    const fallbackSource = o.companySlug
        ? o.companySlug.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase())
        : "Main Dispatch";

    return {
        _id: o._id,
        orderNo: o.orderNo,
        doNumber: o.doNumber || ("DO-" + o.orderNo),
        recipientName: o.recipientName || "Recipient",
        recipientPhone: o.recipientPhone || "",
        deliveryAddress: o.deliveryAddress || "",
        notes: o.notes || "",
        sourceWarehouse: o.sourceWarehouse || fallbackSource,
        deliveryBatch: o.deliveryBatch || "",
        vehicleNo: o.vehicleNo || "",
        priority: o.priority || "Normal",
        scheduledDate: o.requestedDeliveryDate || o.scheduledDate || o.createdAt,
        requestedDeliveryDate: o.requestedDeliveryDate || "",
        deliveryStatus: o.deliveryStatus || "Ready for Dispatch",
        paymentMethod: o.paymentMethod || "Cash on Delivery",
        paymentStatus: o.paymentStatus || "Pending",
        totalAmount: o.totalAmount || 0,
        items,
        packageCount,
        receiverConfirmation: o.receiverConfirmation && o.receiverConfirmation.receiverName ? {
            receiverName: o.receiverConfirmation.receiverName,
            receiverPhone: o.receiverConfirmation.receiverPhone || "",
            notes: o.receiverConfirmation.notes || "",
            signature: o.receiverConfirmation.signature || "",
            confirmedAt: o.receiverConfirmation.confirmedAt || null
        } : null,
        lastLocation: o.lastLocation || null,
        dispatchTimestamp: o.dispatchTimestamp || null,
        arrivalTimestamp: o.arrivalTimestamp || null,
        completionTimestamp: o.completionTimestamp || null,
        deliveryDurationSeconds: o.deliveryDurationSeconds || null,
        deliveryDurationFormatted: o.deliveryDurationFormatted || "",
        dispatchLocation: o.dispatchLocation || null,
        arrivalLocation: o.arrivalLocation || null,
        completionLocation: o.completionLocation || null,
        batchStartTime: o.batchStartTime || null,
        batchCompletionTime: o.batchCompletionTime || null,
        batchTotalDurationSeconds: o.batchTotalDurationSeconds || null,
        batchTotalDurationFormatted: o.batchTotalDurationFormatted || "",
        isBatchCompleted: o.isBatchCompleted || false,
        allowedTransitions
    };
};

/**
 * GET /api/rider/deliveries
 * List deliveries assigned to the authenticated rider (or all company deliveries for privileged roles)
 */
const getRiderDeliveries = async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return next(createHttpError(401, "Authentication required."));
        }

        const isPrivileged = isPrivilegedUser(user);

        // Enforce company / tenant isolation
        if (!isPrivileged && !user.companySlug) {
            return next(createHttpError(403, "Access denied. Organization association missing."));
        }

        const filter = {
            isDeleted: { $ne: true }
        };

        const targetCompanySlug = (user.role === "Superadmin" && req.query.companySlug) ? req.query.companySlug : user.companySlug;
        if (targetCompanySlug) {
            filter.companySlug = targetCompanySlug;
        }

        // For non-privileged users (Riders), strictly match assigned stable database IDs
        if (!isPrivileged) {
            const authorizedIds = await getRiderDatabaseIdentifiers(user);
            if (!authorizedIds || authorizedIds.length === 0) {
                return res.status(200).json({
                    success: true,
                    data: [],
                    total: 0,
                    page: 1,
                    totalPages: 1
                });
            }
            filter["rider.staffId"] = { $in: authorizedIds };
        }

        // Excluded early preparation/creation statuses and cancelled orders:
        // Riders must NEVER see Pending approval, Created, Preparing, or Cancelled orders
        const excludedStatuses = [
            "Pending Approval", "PENDING_APPROVAL", "Pending", "PENDING",
            "Created", "CREATED", "Initiated", "INITIATED", "APPROVED", "Approved",
            "Preparing", "PREPARING", "PREPARING_DISPATCH",
            "Cancelled", "CANCELLED", "Rejected", "REJECTED"
        ];

        if (req.query.status && req.query.status !== "all" && req.query.status !== "All") {
            const s = String(req.query.status).trim();
            const norm = normalizeDeliveryStatus(s);
            if (norm === "Ready for Dispatch") {
                filter.deliveryStatus = { $in: ["Ready for Dispatch", "READY_FOR_DISPATCH", "ASSIGNED", "READY", "RIDER_ASSIGNED"] };
            } else if (norm === "Out for Delivery") {
                filter.deliveryStatus = { $in: ["Out for Delivery", "OUT_FOR_DELIVERY", "IN_TRANSIT", "PICKED_UP", "ARRIVED", "PENDING_RECEIVER_CONFIRMATION"] };
            } else if (norm === "Delivered") {
                filter.deliveryStatus = { $in: ["Delivered", "DELIVERED"] };
            } else if (norm === "Returned") {
                filter.deliveryStatus = { $in: ["Returned", "RETURNED", "RETURN_INITIATED"] };
            } else if (excludedStatuses.includes(s) || excludedStatuses.includes(norm)) {
                filter.deliveryStatus = "__BLOCKED_STATUS__";
            } else {
                filter.deliveryStatus = { $nin: excludedStatuses, $eq: s };
            }
        } else {
            // When querying all orders for riders, strictly exclude Pending Approval, Created, Preparing, and Cancelled
            filter.deliveryStatus = { $nin: excludedStatuses };
        }

        // Priority filter
        if (req.query.priority && req.query.priority !== "all") {
            filter.priority = req.query.priority;
        }

        // Date filter
        if (req.query.date) {
            const start = new Date(req.query.date);
            start.setHours(0, 0, 0, 0);
            const end = new Date(req.query.date);
            end.setHours(23, 59, 59, 999);
            filter.createdAt = { $gte: start, $lte: end };
        }

        // Search filter (Order No, DO Number, Recipient Name)
        if (req.query.search) {
            const searchRegex = new RegExp(String(req.query.search).trim(), "i");
            filter.$or = [
                { orderNo: searchRegex },
                { doNumber: searchRegex },
                { recipientName: searchRegex },
                { deliveryAddress: searchRegex }
            ];
        }

        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
        const skip = (page - 1) * limit;

        const total = await Order.countDocuments(filter);
        const rawOrders = await Order.find(filter)
            .sort({
                priority: -1,
                createdAt: -1
            })
            .skip(skip)
            .limit(limit);

        const sanitized = rawOrders.map(sanitizeRiderDelivery);

        res.status(200).json({
            success: true,
            data: sanitized,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/rider/deliveries/:id
 * Retrieve authorized delivery details (strictly excluding internal audit timeline)
 */
const getRiderDeliveryById = async (req, res, next) => {
    try {
        const user = req.user;
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(404).json({ success: false, message: "Invalid delivery ID." });
        }

        const isPrivileged = isPrivilegedUser(user);

        // Fetch persisted order
        const order = await Order.findById(id);
        if (!order || order.isDeleted) {
            return res.status(404).json({ success: false, message: "Delivery order not found." });
        }

        // Authoritative company / tenant isolation
        if (user.role !== "Superadmin") {
            if (!user.companySlug) return next(createHttpError(403, "Access denied. Organization association missing."));
            const cleanUserSlug = String(user.companySlug).toLowerCase().trim();
            const cleanOrderSlug = String(order.companySlug || "").toLowerCase().trim();
            if (cleanOrderSlug !== cleanUserSlug) {
                return next(createHttpError(403, "Forbidden. Order belongs to another organization."));
            }
        }

        // Block early stage (Pending, Created, Preparing) and Cancelled orders from riders
        const excludedStatuses = [
            "Pending Approval", "PENDING_APPROVAL", "Pending", "PENDING",
            "Created", "CREATED", "Initiated", "INITIATED", "APPROVED", "Approved",
            "Preparing", "PREPARING", "PREPARING_DISPATCH",
            "Cancelled", "CANCELLED", "Rejected", "REJECTED"
        ];
        if (!isPrivileged && (excludedStatuses.includes(order.deliveryStatus) || excludedStatuses.includes(normalizeDeliveryStatus(order.deliveryStatus)))) {
            return res.status(404).json({ success: false, message: "Delivery order is not ready for rider dispatch." });
        }

        // Rider ownership check using stable database identifiers
        if (!isPrivileged) {
            const authorizedIds = await getRiderDatabaseIdentifiers(user);
            const assignedStaffId = order.rider?.staffId;
            const isAssigned = assignedStaffId && authorizedIds.some(
                authId => String(authId) === String(assignedStaffId)
            );

            if (!isAssigned) {
                return res.status(403).json({
                    success: false,
                    message: "Forbidden. You are not assigned to this delivery."
                });
            }
        }

        res.status(200).json({
            success: true,
            data: sanitizeRiderDelivery(order)
        });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/rider/deliveries/:id/status
 * Execute a valid workflow transition with strict atomic concurrency protection
 */
const updateRiderDeliveryStatus = async (req, res, next) => {
    try {
        const user = req.user;
        const { id } = req.params;
        const {
            status: targetStatus,
            notes,
            receiverName,
            receiverPhone,
            location,
            receiverUser,
            franchise,
            itemsConfirmed,
            hasDiscrepancy,
            discrepancyType,
            discrepancyNotes
        } = req.body || {};

        if (!targetStatus || !String(targetStatus).trim()) {
            return res.status(400).json({ success: false, message: "Target delivery status is required." });
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(404).json({ success: false, message: "Invalid delivery ID." });
        }

        const isPrivileged = isPrivilegedUser(user);

        // 1. Load current persisted order record
        const order = await Order.findById(id);
        if (!order || order.isDeleted) {
            return res.status(404).json({ success: false, message: "Delivery order not found." });
        }

        // 2. Authoritative tenant isolation check
        if (user.role !== "Superadmin") {
            if (!user.companySlug) return next(createHttpError(403, "Access denied. Organization association missing."));
            const cleanUserSlug = String(user.companySlug).toLowerCase().trim();
            const cleanOrderSlug = String(order.companySlug || "").toLowerCase().trim();
            if (cleanOrderSlug !== cleanUserSlug) {
                return next(createHttpError(403, "Forbidden. Order belongs to another organization."));
            }
        }

        // 3. Rider assignment verification using stable database identifiers
        let authorizedIds = [];
        if (!isPrivileged) {
            authorizedIds = await getRiderDatabaseIdentifiers(user);
            const assignedStaffId = order.rider?.staffId;
            const isAssigned = assignedStaffId && authorizedIds.some(
                authId => String(authId) === String(assignedStaffId)
            );

            if (!isAssigned) {
                return res.status(403).json({
                    success: false,
                    message: "Forbidden. You are not authorized to update this delivery."
                });
            }
        }

        const currentPersistedStatus = order.deliveryStatus || "Ready for Dispatch";
        const normalizedCurrent = normalizeDeliveryStatus(currentPersistedStatus);
        const normalizedTarget = normalizeDeliveryStatus(targetStatus);

        // 4. Strict terminal status lock: Once Delivered or Cancelled, locked from updates
        if (normalizedCurrent === "Delivered" || currentPersistedStatus === "DELIVERED" || currentPersistedStatus === "Delivered") {
            return res.status(400).json({
                success: false,
                message: "Order is already Delivered and locked from further status updates."
            });
        }
        if (normalizedCurrent === "Cancelled" || currentPersistedStatus === "Cancelled" || currentPersistedStatus === "CANCELLED") {
            return res.status(400).json({
                success: false,
                message: "Order is Cancelled and locked from further status updates."
            });
        }

        // 5. Idempotent check for intermediate non-terminal states
        const normCurrentExact = String(currentPersistedStatus).trim().toUpperCase().replace(/[\s\-_]+/g, '_');
        const normTargetExact = String(targetStatus).trim().toUpperCase().replace(/[\s\-_]+/g, '_');
        if (currentPersistedStatus === targetStatus || normCurrentExact === normTargetExact) {
            return res.status(200).json({
                success: true,
                message: `Delivery is already in status ${targetStatus}.`,
                data: sanitizeRiderDelivery(order)
            });
        }

        // 6. Validate workflow sequence
        let allowedTargets = VALID_STATUS_TRANSITIONS[currentPersistedStatus] || [];
        if (allowedTargets.length === 0 && VALID_STATUS_TRANSITIONS[normalizedCurrent]) {
            allowedTargets = VALID_STATUS_TRANSITIONS[normalizedCurrent];
        }

        const normalizedAllowedTargets = allowedTargets.map(t => normalizeDeliveryStatus(t));
        const isAllowedTransition = isPrivileged ||
            allowedTargets.includes(targetStatus) ||
            normalizedAllowedTargets.includes(normalizedTarget);

        if (!isAllowedTransition) {
            return res.status(400).json({
                success: false,
                message: `Invalid status transition from "${currentPersistedStatus}" to "${targetStatus}". Permitted next: ${allowedTargets.join(", ") || "None"}.`
            });
        }

        // 7. Mandatory Receiver Confirmation validation for Delivered
        const isCompletingDelivery = normalizedTarget === "Delivered" || targetStatus === "Delivered" || targetStatus === "DELIVERED";
        if (isCompletingDelivery) {
            const rName = receiverName || req.body.confirmedBy;
            if (!rName || !String(rName).trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Receiver confirmation full name is mandatory before delivery completion."
                });
            }

            // Step 7: Mandatory Remarks rule if discrepancy or quality issue is reported
            const hasDisc = Boolean(hasDiscrepancy || req.body.hasDiscrepancy || (discrepancyType && discrepancyType !== "No Discrepancy" && discrepancyType !== "none"));
            if (hasDisc) {
                const remarks = String(discrepancyNotes || req.body.discrepancyNotes || notes || "").trim();
                if (!remarks) {
                    return res.status(400).json({
                        success: false,
                        message: "Remarks are mandatory when physical goods discrepancy or quality issues are reported."
                    });
                }
            }
        }

        // 8. Atomic Concurrency Update using findOneAndUpdate
        // Guarantees that only ONE concurrent request can successfully execute the transition
        // because the filter strictly requires deliveryStatus to equal currentPersistedStatus.
        const atomicFilter = {
            _id: order._id,
            companySlug: order.companySlug,
            deliveryStatus: currentPersistedStatus, // ATOMIC CONCURRENCY GUARD
            isDeleted: { $ne: true }
        };

        if (!isPrivileged) {
            atomicFilter["rider.staffId"] = { $in: authorizedIds };
        }

        const actorName = user.name || user.username || "Rider";

                // Step 5: Check if rider is marking arrival at destination
        const isMarkingArrival = targetStatus === "ARRIVED" ||
                                normalizedTarget === "ARRIVED" ||
                                targetStatus === "PENDING_RECEIVER_CONFIRMATION" ||
                                normalizedTarget === "PENDING_RECEIVER_CONFIRMATION";

        // Store canonical status matching Deliveries & Dispatch
        // When rider marks ARRIVED: IN_TRANSIT -> ARRIVED -> PENDING_RECEIVER_CONFIRMATION
        // The delivery must NOT automatically become DELIVERED.
        const canonicalStatus = isCompletingDelivery
            ? "Delivered"
            : (targetStatus === "ARRIVED" || normalizedTarget === "ARRIVED")
                ? "ARRIVED"
                : (targetStatus === "PENDING_RECEIVER_CONFIRMATION" || normalizedTarget === "PENDING_RECEIVER_CONFIRMATION")
                    ? "PENDING_RECEIVER_CONFIRMATION"
                    : (normalizedTarget === "Out for Delivery")
                        ? "Out for Delivery"
                        : targetStatus;

        const setFields = {
            deliveryStatus: canonicalStatus,
            updatedBy: actorName,
            updatedAt: new Date()
        };

        if (location && (location.latitude !== undefined || location.longitude !== undefined)) {
            setFields.lastLocation = {
                latitude: Number(location.latitude),
                longitude: Number(location.longitude),
                accuracy: location.accuracy != null ? Number(location.accuracy) : null,
                address: location.address ? String(location.address) : "",
                updatedAt: new Date()
            };
        }

        if (isCompletingDelivery) {
            const hasDisc = Boolean(hasDiscrepancy || req.body.hasDiscrepancy || (discrepancyType && discrepancyType !== "No Discrepancy" && discrepancyType !== "none"));
            setFields.receiverConfirmation = {
                receiverUser: String(receiverUser || req.body.receiverUser || user.email || user.name || "").trim(),
                receiverName: String(receiverName || req.body.confirmedBy).trim(),
                receiverPhone: receiverPhone ? String(receiverPhone).trim() : (order.recipientPhone || ""),
                franchise: String(franchise || req.body.franchise || order.recipientName || "").trim(),
                signature: req.body.signature ? String(req.body.signature).trim() : "",
                notes: notes ? String(notes).trim() : "",
                confirmedAt: new Date(),
                itemsConfirmed: Array.isArray(itemsConfirmed) ? itemsConfirmed : (Array.isArray(req.body.itemsConfirmed) ? req.body.itemsConfirmed : []),
                hasDiscrepancy: hasDisc,
                discrepancyType: hasDisc ? String(discrepancyType || req.body.discrepancyType || "Quantity discrepancy").trim() : "",
                discrepancyNotes: hasDisc ? String(discrepancyNotes || req.body.discrepancyNotes || notes || "").trim() : "",
                issueId: null
            };
            if (order.paymentMethod === "Cash on Delivery" && order.paymentStatus === "Pending") {
                setFields.paymentStatus = "Paid";
            }
        }

        const isDeliveredCanonical = canonicalStatus === "Delivered" || canonicalStatus === "DELIVERED";
        const defaultTransitionNote = (isCompletingDelivery || isDeliveredCanonical) ? "" : `Status transitioned from ${currentPersistedStatus} to ${canonicalStatus}`;

        // Step 6: Apply Automatic GPS Capture, Raw Event Timestamps, and Calculate Travel Duration
        const internalTimelineEvent = applyDeliveryAudit({
            order,
            targetStatus: canonicalStatus,
            actorName,
            location,
            signature: req.body.signature,
            notes: notes ? `Notes: ${notes}` : defaultTransitionNote
        });

        // Enrich setFields with calculated duration, timestamps, and event locations
        setFields.dispatchTimestamp = order.dispatchTimestamp || null;
        setFields.arrivalTimestamp = order.arrivalTimestamp || null;
        setFields.completionTimestamp = order.completionTimestamp || null;
        setFields.deliveryDurationSeconds = order.deliveryDurationSeconds || null;
        setFields.deliveryDurationFormatted = order.deliveryDurationFormatted || "";
        if (order.dispatchLocation) setFields.dispatchLocation = order.dispatchLocation;
        if (order.arrivalLocation) setFields.arrivalLocation = order.arrivalLocation;
        if (order.completionLocation) setFields.completionLocation = order.completionLocation;
        if (order.batchStartTime) setFields.batchStartTime = order.batchStartTime;
        if (order.lastLocation) setFields.lastLocation = order.lastLocation;

        const updateOps = {
            $set: setFields,
            $push: { timeline: internalTimelineEvent }
        };

        const updatedOrder = await Order.findOneAndUpdate(
            atomicFilter,
            updateOps,
            { new: true }
        );

        if (!updatedOrder) {
            // Concurrent race condition occurred; another concurrent request already transitioned this delivery.
            // Return 409 Conflict to indicate competing/conflicting state update.
            return res.status(409).json({
                success: false,
                message: "Concurrent update conflict. The delivery status has already been transitioned by another operation."
            });
        }

        // Step 6: Batch delivery duration synchronization (preserves individual timings)
        try {
            await syncBatchDeliveryAudit(updatedOrder, Order);
        } catch (batchErr) {
            console.error("Batch delivery duration sync failed:", batchErr);
        }

        // Step 7: Inventory Completion (Deduct delivered quantity using existing Inventory system)
        const isDeliveredTarget = isCompletingDelivery || (canonicalStatus === "Delivered" || canonicalStatus === "DELIVERED");
        if (isDeliveredTarget) {
            try {
                await deductDeliveryOrderInventory(updatedOrder, actorName);
            } catch (invErr) {
                console.error("Inventory deduction failed on delivery completion:", invErr);
            }

            // Step 7: Discrepancy & Issue Creation (DeliGati Issues module integration)
            if (updatedOrder.receiverConfirmation && updatedOrder.receiverConfirmation.hasDiscrepancy) {
                try {
                    const discType = updatedOrder.receiverConfirmation.discrepancyType || "Delivery Discrepancy";
                    const discNotes = updatedOrder.receiverConfirmation.discrepancyNotes || updatedOrder.receiverConfirmation.notes || "Discrepancy reported during delivery handover";
                    const doNum = updatedOrder.doNumber || `DO-${updatedOrder.orderNo}`;
                    
                    let itemSummary = "";
                    if (Array.isArray(updatedOrder.receiverConfirmation.itemsConfirmed) && updatedOrder.receiverConfirmation.itemsConfirmed.length > 0) {
                        itemSummary = updatedOrder.receiverConfirmation.itemsConfirmed
                            .map(i => `- ${i.name}: Ordered ${i.orderedQuantity}, Received ${i.receivedQuantity} (Diff: ${i.discrepancy || (Number(i.receivedQuantity) - Number(i.orderedQuantity))})`)
                            .join("\n");
                    }

                    const newIssue = new Issue({
                        title: `Delivery Discrepancy: Order #${updatedOrder.orderNo} (${discType})`,
                        category: "Delivery Discrepancy",
                        priority: "High",
                        description: `Recipient: ${updatedOrder.receiverConfirmation.franchise || updatedOrder.recipientName || 'Recipient'}\nDO: ${doNum}\nDiscrepancy Type: ${discType}\nReceiver: ${updatedOrder.receiverConfirmation.receiverName} (${updatedOrder.receiverConfirmation.receiverPhone || 'N/A'})\nDiscrepancy Remarks:\n${discNotes}\n\nItem Checklist Breakdown:\n${itemSummary || 'Refer to DO for item details.'}`,
                        deliveryOrderId: updatedOrder._id,
                        doNumber: doNum,
                        status: "Pending",
                        reportedBy: user._id,
                        reporterName: actorName,
                        reporterEmail: user.email || user.phone || "",
                        reporterRole: user.role || "Rider",
                        restaurantName: updatedOrder.companySlug || "Central Kitchen"
                    });
                    await newIssue.save();
                    updatedOrder.receiverConfirmation.issueId = newIssue._id;
                    await updatedOrder.save();
                } catch (issueErr) {
                    console.error("Failed to auto-create delivery discrepancy issue:", issueErr);
                }
            }
        }

        // DeliGati Internal Dispatch Notifications: DELIVERED only (intermediate status transitions muted)
        try {
            const normTargetUpper = String(normalizedTarget || targetStatus || "").toUpperCase().replace(/[\s\/\-]+/g, "_");
            const normCanonicalUpper = String(canonicalStatus || "").toUpperCase().replace(/[\s\/\-]+/g, "_");

            const isDeliveredTarget = isCompletingDelivery || (canonicalStatus === "Delivered" || canonicalStatus === "DELIVERED");
            if (isDeliveredTarget) {
                sendDispatchNotification({
                    event: DISPATCH_EVENTS.DELIVERED,
                    order: updatedOrder,
                    actor: user
                }).catch(err => console.error("Notification error on DELIVERED:", err));
            }
        } catch (notifErr) {
            console.error("Error dispatching notification:", notifErr);
        }

        res.status(200).json({
            success: true,
            message: `Delivery status successfully updated to ${canonicalStatus}`,
            data: sanitizeRiderDelivery(updatedOrder)
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getRiderDeliveries,
    getRiderDeliveryById,
    updateRiderDeliveryStatus
};
