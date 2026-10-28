/**
 * STEP 6 — GPS & TRAVEL-TIME EFFICIENCY AUDIT SERVICE
 * 
 * Automatically records delivery locations and calculates delivery efficiency metrics.
 * - Automatic event-based GPS capture (Dispatch, Arrival, Completion)
 * - Raw timestamps and calculated duration persistence
 * - Batch total duration vs individual delivery timing
 * - Multi-tenant isolation by companySlug
 */

function formatDuration(seconds) {
    if (seconds == null || isNaN(seconds) || seconds < 0) return "";
    const totalMins = Math.floor(seconds / 60);
    if (totalMins < 60) {
        return `${Math.max(1, totalMins)} min${totalMins === 1 ? "" : "s"}`;
    }
    const hrs = Math.floor(totalMins / 60);
    const remMins = totalMins % 60;
    if (remMins === 0) {
        return `${hrs} hr${hrs === 1 ? "" : "s"}`;
    }
    return `${hrs} hr${hrs === 1 ? "" : "s"} ${remMins} min${remMins === 1 ? "" : "s"}`;
}

function sanitizeLocation(loc) {
    if (!loc) return null;
    const lat = loc.latitude !== undefined && loc.latitude !== null ? Number(loc.latitude) : null;
    const lng = loc.longitude !== undefined && loc.longitude !== null ? Number(loc.longitude) : null;
    if (lat === null || lng === null || isNaN(lat) || isNaN(lng)) {
        return null;
    }
    return {
        latitude: lat,
        longitude: lng,
        accuracy: loc.accuracy != null && !isNaN(loc.accuracy) ? Number(loc.accuracy) : null,
        address: loc.address ? String(loc.address).trim() : "",
        timestamp: loc.timestamp ? new Date(loc.timestamp) : new Date()
    };
}

function classifyEventType(status) {
    const norm = String(status || "").trim().toUpperCase().replace(/[\s\/-]+/g, "_");
    if (norm === "DELIVERED") return "COMPLETION";
    if (norm === "ARRIVED" || norm === "PENDING_RECEIVER_CONFIRMATION" || norm.includes("ARRIV")) return "ARRIVAL";
    if (norm === "OUT_FOR_DELIVERY" || norm === "IN_TRANSIT" || norm === "PICKED_UP" || norm.includes("TRANSIT")) return "DISPATCH_START";
    return "STATUS_UPDATE";
}

/**
 * Apply GPS capture, raw event timestamps, and calculate delivery duration.
 */
function applyDeliveryAudit({ order, targetStatus, actorName, location, signature, notes }) {
    const eventType = classifyEventType(targetStatus);
    const cleanLoc = sanitizeLocation(location);
    const now = new Date();

    const timelineEvent = {
        action: `Rider Status Transition: ${targetStatus}`,
        status: targetStatus,
        eventType,
        timestamp: now,
        user: actorName || "System",
        notes: notes || "",
        companySlug: order.companySlug || "",
        orderId: order._id || null,
        orderNo: order.orderNo || "",
        doNumber: order.doNumber || "",
        deliveryBatch: order.deliveryBatch || "",
        rider: order.rider ? {
            staffId: order.rider.staffId || null,
            name: order.rider.name || "",
            phone: order.rider.phone || ""
        } : null
    };

    if (signature) {
        timelineEvent.signature = String(signature).trim();
    }

    if (cleanLoc) {
        timelineEvent.location = cleanLoc;
        order.lastLocation = {
            ...cleanLoc,
            updatedAt: now
        };
    }

    if (eventType === "DISPATCH_START") {
        if (!order.dispatchTimestamp) {
            order.dispatchTimestamp = now;
        }
        if (cleanLoc) {
            order.dispatchLocation = cleanLoc;
        }
        if (order.deliveryBatch && !order.batchStartTime) {
            order.batchStartTime = order.dispatchTimestamp;
        }
    } else if (eventType === "ARRIVAL") {
        if (!order.arrivalTimestamp) {
            order.arrivalTimestamp = now;
        }
        if (cleanLoc) {
            order.arrivalLocation = cleanLoc;
        }

        // Delivery Duration = Arrival Time - Dispatch/Trip Start Time
        const start = order.dispatchTimestamp ||
            (Array.isArray(order.timeline) ? order.timeline.find(t => t.eventType === "DISPATCH_START" || String(t.action || "").includes("Out for Delivery"))?.timestamp : null) ||
            order.rider?.assignedAt ||
            order.createdAt;

        if (start) {
            const diffSec = Math.max(0, Math.round((order.arrivalTimestamp.getTime() - new Date(start).getTime()) / 1000));
            order.deliveryDurationSeconds = diffSec;
            order.deliveryDurationFormatted = formatDuration(diffSec);
        }
    } else if (eventType === "COMPLETION") {
        if (!order.completionTimestamp) {
            order.completionTimestamp = now;
        }
        if (cleanLoc) {
            order.completionLocation = cleanLoc;
        }

        // If arrival was not recorded separately, calculate duration to completion
        if (order.deliveryDurationSeconds == null) {
            let start = order.dispatchTimestamp ||
                (Array.isArray(order.timeline) ? order.timeline.find(t => t.eventType === "DISPATCH_START" || String(t.action || "").includes("Out for Delivery"))?.timestamp : null) ||
                order.rider?.assignedAt ||
                order.createdAt;

            if (start) {
                const diffSec = Math.max(0, Math.round((order.completionTimestamp.getTime() - new Date(start).getTime()) / 1000));
                order.deliveryDurationSeconds = diffSec;
                order.deliveryDurationFormatted = formatDuration(diffSec);
            }
        }
    }

    return timelineEvent;
}

/**
 * Requirement F: Batch Delivery Time Calculation
 * If multiple deliveries belong to one batch, calculate:
 * Batch Total Duration = Batch Completion Time - Batch Start Time
 * Preserves individual timing for every delivery.
 * One completed delivery must NOT automatically complete the entire batch.
 */
async function syncBatchDeliveryAudit(order, OrderModel) {
    if (!order || !order.deliveryBatch || !String(order.deliveryBatch).trim()) {
        return;
    }

    const batchCode = String(order.deliveryBatch).trim();
    const companySlug = order.companySlug;

    // Tenant-isolated batch lookup
    const batchOrders = await OrderModel.find({
        companySlug,
        deliveryBatch: batchCode,
        isDeleted: { $ne: true }
    });

    if (!batchOrders || batchOrders.length === 0) return;

    // Earliest dispatch start time across batch
    const dispatchTimes = batchOrders
        .map(o => o.dispatchTimestamp)
        .filter(t => t != null)
        .map(t => new Date(t).getTime());

    const batchStart = dispatchTimes.length > 0 ? new Date(Math.min(...dispatchTimes)) : (order.dispatchTimestamp || order.createdAt);

    // Check if ALL deliveries in the batch are now completed (Delivered, Returned, or Cancelled)
    const TERMINAL_STATUSES = ["DELIVERED", "RETURNED", "CANCELLED", "REJECTED"];
    const allCompleted = batchOrders.every(o => {
        const norm = String(o.deliveryStatus || "").toUpperCase().replace(/[\s\/-]+/g, "_");
        return TERMINAL_STATUSES.includes(norm) || (o.completionTimestamp != null);
    });

    if (allCompleted) {
        // Find latest completion time
        const completionTimes = batchOrders
            .map(o => o.completionTimestamp)
            .filter(t => t != null)
            .map(t => new Date(t).getTime());

        const batchCompletion = completionTimes.length > 0 ? new Date(Math.max(...completionTimes)) : new Date();
        const batchTotalDurationSec = Math.max(0, Math.round((batchCompletion.getTime() - batchStart.getTime()) / 1000));
        const batchTotalDurationFmt = formatDuration(batchTotalDurationSec);

        // Update all orders in batch with total batch duration
        await OrderModel.updateMany(
            {
                companySlug,
                deliveryBatch: batchCode,
                isDeleted: { $ne: true }
            },
            {
                $set: {
                    batchStartTime: batchStart,
                    batchCompletionTime: batchCompletion,
                    batchTotalDurationSeconds: batchTotalDurationSec,
                    batchTotalDurationFormatted: batchTotalDurationFmt,
                    isBatchCompleted: true
                }
            }
        );
    } else {
        // Batch is still in progress; preserve batchStartTime, leave isBatchCompleted = false
        await OrderModel.updateMany(
            {
                companySlug,
                deliveryBatch: batchCode,
                isDeleted: { $ne: true }
            },
            {
                $set: {
                    batchStartTime: batchStart,
                    isBatchCompleted: false
                }
            }
        );
    }
}

module.exports = {
    formatDuration,
    sanitizeLocation,
    classifyEventType,
    applyDeliveryAudit,
    syncBatchDeliveryAudit
};
