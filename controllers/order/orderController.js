const mongoose = require("mongoose");
const Order = require("../../models/order/orderModel");
const Counter = require("../../models/counter/counterModel");
const Staff = require("../../models/staff/staffModel");
const Inventory = require("../../models/inventory/inventoryModel");
const MenuItem = require("../../models/menuItem/menuItemModel");

// Restock inventory for cancelled orders
const restockCancelledOrderItems = async (order, actorName, reasonLabel = "Order Cancelled Restock") => {
    try {
        if (!order || !order.items || !Array.isArray(order.items)) return;
        const companySlug = order.companySlug;

        for (const item of order.items) {
            const qty = Number(item.quantity) || 1;
            let restocked = false;

            // 1. Try finding MenuItem recipe first
            let menuItem = null;
            if (item.menuItemId && mongoose.Types.ObjectId.isValid(item.menuItemId)) {
                menuItem = await MenuItem.findOne({ _id: item.menuItemId, isDeleted: { $ne: true } });
            }
            if (!menuItem && item.name) {
                const cleanName = item.name.replace(/\s*\([^)]*\)/g, '').trim();
                const escapedName = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const nameRegex = new RegExp('^' + escapedName + '$', "i");
                menuItem = await MenuItem.findOne({
                    name: nameRegex,
                    isDeleted: { $ne: true },
                    ...(companySlug ? { companySlug } : {})
                });
            }

            if (menuItem && menuItem.recipe && Array.isArray(menuItem.recipe) && menuItem.recipe.length > 0) {
                for (const ing of menuItem.recipe) {
                    if (ing.inventoryItem) {
                        const ingQty = qty * (Number(ing.ratio) || 1);
                        await Inventory.updateOne(
                            { _id: ing.inventoryItem },
                            {
                                $inc: { currentStock: ingQty },
                                $push: {
                                    adjustments: {
                                        quantity: ingQty,
                                        reason: reasonLabel,
                                        notes: `Restocked ${ingQty} units from order ${order.orderNo} (${reasonLabel})`,
                                        date: new Date(),
                                        adjustedBy: actorName
                                    }
                                }
                            }
                        );
                    }
                }
                restocked = true;
            }

            // 2. If no recipe ingredient was restocked, find matching Inventory item directly
            if (!restocked) {
                let invItem = null;
                if (item.menuItemId && mongoose.Types.ObjectId.isValid(item.menuItemId)) {
                    invItem = await Inventory.findOne({ _id: item.menuItemId, isDeleted: { $ne: true } });
                }
                if (!invItem && item.name) {
                    const cleanName = item.name.replace(/\s*\([^)]*\)/g, '').trim();
                    const escapedName = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const nameRegex = new RegExp('^' + escapedName + '$', "i");
                    invItem = await Inventory.findOne({
                        name: nameRegex,
                        isDeleted: { $ne: true },
                        ...(companySlug ? { companySlug } : {})
                    });
                }

                if (invItem) {
                    await Inventory.updateOne(
                        { _id: invItem._id },
                        {
                            $inc: { currentStock: qty },
                            $push: {
                                adjustments: {
                                    quantity: qty,
                                    reason: reasonLabel,
                                    notes: `Restocked ${qty} ${invItem.unit || 'units'} from order ${order.orderNo} (${reasonLabel})`,
                                    date: new Date(),
                                    adjustedBy: actorName
                                }
                            }
                        }
                    );
                }
            }
        }
    } catch (err) {
        console.error("Error restocking cancelled order items:", err);
    }
};

// Create new delivery order
const createDeliveryOrder = async (req, res, next) => {
    try {
        const { recipientName, recipientPhone, deliveryAddress, notes, items, paymentMethod } = req.body;

        if (!recipientName || !recipientPhone || !deliveryAddress) {
            return res.status(400).json({ success: false, message: "Recipient name, phone, and delivery address are required." });
        }
        if (!paymentMethod) {
            return res.status(400).json({ success: false, message: "Payment method is required." });
        }
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: "At least one order item is required." });
        }

        const companySlug = req.body?.companySlug || req.query?.companySlug || req.user?.companySlug || req.companySlug ;

        // Get guaranteed unique orderNo sequence using global orderNo counter
        let orderNo = req.body?.orderNo;
        if (!orderNo || (await Order.findOne({ orderNo }))) {
            let isUnique = false;
            while (!isUnique) {
                const counter = await Counter.findByIdAndUpdate(
                    { _id: { companySlug: "global", seqName: "orderNo" } },
                    { $inc: { seq: 1 } },
                    { new: true, upsert: true }
                );

                const candidate = `CK-${String(counter.seq).padStart(4, "0")}`;
                const existing = await Order.findOne({ orderNo: candidate });
                if (!existing) {
                    orderNo = candidate;
                    isUnique = true;
                }
            }
        }
        
        const cleanedItems = items.map(item => ({
            menuItemId: item.menuItemId,
            name: item.name,
            quantity: Number(item.quantity) || 1,
            price: Number(item.price) || 0,
            portion: item.portion || "",
            notes: item.notes || ""
        }));

        const totalAmount = cleanedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const actorName = req.user ? (req.user.name || req.user.username) : "Kitchen Staff";
        const initialStatus = req.body?.deliveryStatus || "Created";

        const newOrder = new Order({
            companySlug,
            orderNo,
            recipientName,
            recipientPhone,
            deliveryAddress,
            notes: notes || "",
            items: cleanedItems,
            totalAmount,
            paymentMethod: paymentMethod || "Cash on Delivery",
            deliveryStatus: initialStatus,
            timeline: [{
                action: `Order ${initialStatus === 'PENDING_APPROVAL' ? 'Submitted for Approval' : 'Created'}`,
                status: initialStatus,
                timestamp: new Date(),
                user: actorName,
                notes: "Delivery order entered into system."
            }],
            createdBy: actorName,
            updatedBy: actorName
        });

        await newOrder.save();

        res.status(201).json({
            success: true,
            message: "Delivery order created successfully",
            data: newOrder
        });
    } catch (err) {
        next(err);
    }
};

// Fetch delivery orders with filtering & search
const getDeliveryOrders = async (req, res, next) => {
    try {
        const { status, search, period, startDate, endDate } = req.query;
        const companySlug = req.query?.companySlug || req.body?.companySlug || req.user?.companySlug || req.companySlug ;

        let filterConditions = [
            { isDeleted: false },
            {
                $or: [
                    { companySlug: companySlug },
                    { companySlug: { $exists: false } },
                    { companySlug: null }
                ]
            }
        ];

        if (status && status !== "All") {
            filterConditions.push({ deliveryStatus: status });
        }

        if (search && search.trim()) {
            const searchRegex = { $regex: search.trim(), $options: "i" };
            filterConditions.push({
                $or: [
                    { orderNo: searchRegex },
                    { recipientName: searchRegex },
                    { recipientPhone: searchRegex },
                    { deliveryAddress: searchRegex }
                ]
            });
        }

        // Date period filter
        if (period === "today") {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            filterConditions.push({ createdAt: { $gte: today, $lt: tomorrow } });
        } else if (period === "7days") {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            sevenDaysAgo.setHours(0, 0, 0, 0);
            filterConditions.push({ createdAt: { $gte: sevenDaysAgo } });
        } else if (period === "month") {
            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);
            filterConditions.push({ createdAt: { $gte: startOfMonth } });
        } else if (period === "custom" && startDate) {
            const s = new Date(startDate);
            const e = endDate ? new Date(endDate) : new Date();
            e.setHours(23, 59, 59, 999);
            filterConditions.push({ createdAt: { $gte: s, $lte: e } });
        }

        const query = { $and: filterConditions };
        const orders = await Order.find(query).sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: orders
        });
    } catch (err) {
        next(err);
    }
};

// Update status of delivery order
const updateDeliveryStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const targetStatus = req.body.status || req.body.deliveryStatus;
        const status = targetStatus;
        const { notes } = req.body;

        const validStatuses = ["Created", "Preparing", "Ready for Dispatch", "Out for Delivery", "Delivered", "Cancelled", "PENDING_APPROVAL", "APPROVED", "REJECTED", "RETURN_INITIATED", "Returned"];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid delivery status" });
        }

        const order = await Order.findById(id);
        if (!order || order.isDeleted) {
            return res.status(404).json({ success: false, message: "Delivery order not found" });
        }

        if (status) {
            const prevStatus = order.deliveryStatus;
            if (["Delivered", "DELIVERED", "Cancelled", "CANCELLED"].includes(prevStatus) && status !== prevStatus) {
                return res.status(400).json({
                    success: false,
                    message: `Order status is locked (${prevStatus}) and cannot be modified.`
                });
            }
            order.deliveryStatus = status;
            if (status === "Delivered") {
                order.paymentStatus = "Paid";
            }
            if ((status === "Cancelled" || status === "CANCELLED") && prevStatus !== "Cancelled" && prevStatus !== "CANCELLED") {
                const actor = req.user ? (req.user.name || req.user.username) : "Kitchen Staff";
                await restockCancelledOrderItems(order, actor, "Order Cancelled Restock");
                const reasonStr = req.body.cancellationReason || req.body.cancelReason || req.body.notes || "";
                if (reasonStr) {
                    order.cancellationReason = reasonStr;
                    order.cancelReason = reasonStr;
                }
                order.cancelledBy = req.body.cancelledBy || actor;
                order.cancelledTimestamp = req.body.cancelledTimestamp || new Date();
                order.paymentStatus = "Cancelled";
            }
            if ((status === "RETURN_INITIATED" || status === "Returned") && prevStatus !== "RETURN_INITIATED" && prevStatus !== "Returned") {
                const actor = req.user ? (req.user.name || req.user.username) : "Kitchen Staff";
                await restockCancelledOrderItems(order, actor, "Order Return Restock");
                order.paymentStatus = "Refunded";
                if (req.body.returnReason) order.returnReason = req.body.returnReason;
                if (req.body.returnType) order.returnType = req.body.returnType;
                if (req.body.returnNotes) order.returnNotes = req.body.returnNotes;
                if (req.body.returnedBy) order.returnedBy = req.body.returnedBy;
                if (req.body.returnedAt) order.returnedAt = req.body.returnedAt;
            }
        }

        const actorName = req.user ? (req.user.name || req.user.username) : "Kitchen Staff";

        const finalNotes = notes || (status === "Cancelled" ? (req.body.cancellationReason || req.body.cancelReason || "") : "");
        order.timeline.push({
            action: `Status changed to ${status || 'Updated'}`,
            status: status || order.deliveryStatus,
            timestamp: new Date(),
            user: actorName,
            notes: finalNotes || ""
        });

        order.updatedBy = actorName;
        await order.save();

        res.status(200).json({
            success: true,
            message: `Order status updated to ${status || order.deliveryStatus}`,
            data: order
        });
    } catch (err) {
        next(err);
    }
};

// Assign Rider to Delivery Order
const assignRider = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { staffId } = req.body;

        const order = await Order.findById(id);
        if (!order || order.isDeleted) {
            return res.status(404).json({ success: false, message: "Delivery order not found" });
        }
        const nonModifiableRider = ["OUT_FOR_DELIVERY", "Out for Delivery", "DELIVERED", "Delivered", "CANCELLED", "Cancelled"];
        if (nonModifiableRider.includes(order.deliveryStatus)) {
            return res.status(400).json({ success: false, message: "Rider assignment cannot be modified for Out for Delivery, Delivered, or Cancelled orders." });
        }

        const staff = await Staff.findById(staffId);
        if (!staff || staff.isDeleted) {
            return res.status(404).json({ success: false, message: "Staff member / rider not found" });
        }

        order.rider = {
            staffId: staff._id,
            name: staff.name,
            phone: staff.phone || "",
            assignedAt: new Date()
        };

        const actorName = req.user ? (req.user.name || req.user.username) : "Kitchen Staff";

        // Auto move status to Out for Delivery if currently Ready for Dispatch, Created, APPROVED, or Preparing
        if (["Created", "Ready for Dispatch", "Preparing", "APPROVED"].includes(order.deliveryStatus)) {
            order.deliveryStatus = "Out for Delivery";
        }

        order.timeline.push({
            action: `Rider ${staff.name} Assigned`,
            status: order.deliveryStatus,
            timestamp: new Date(),
            user: actorName,
            notes: `Rider Phone: ${staff.phone || 'N/A'}`
        });

        order.updatedBy = actorName;
        await order.save();

        res.status(200).json({
            success: true,
            message: `Rider ${staff.name} assigned to order ${order.orderNo}`,
            data: order
        });
    } catch (err) {
        next(err);
    }
};


// Update full delivery order (PUT /api/orders/:id)
const updateDeliveryOrder = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updates = req.body || {};

        const order = await Order.findById(id);
        if (!order || order.isDeleted) {
            return res.status(404).json({ success: false, message: "Delivery order not found" });
        }

        const actorName = req.user ? (req.user.name || req.user.username) : (updates.updatedBy || updates.user || "Kitchen Staff");

        if (updates.deliveryStatus) {
            const prevStatus = order.deliveryStatus;
            const newStatus = updates.deliveryStatus;
            if (["Delivered", "DELIVERED", "Cancelled", "CANCELLED"].includes(prevStatus) && newStatus !== prevStatus) {
                return res.status(400).json({
                    success: false,
                    message: `Order status is locked (${prevStatus}) and cannot be modified.`
                });
            }
            if ((newStatus === "Cancelled" || newStatus === "CANCELLED") && prevStatus !== "Cancelled" && prevStatus !== "CANCELLED") {
                await restockCancelledOrderItems(order, actorName, "Order Cancelled Restock");
            }
            if ((newStatus === "RETURN_INITIATED" || newStatus === "Returned") && prevStatus !== "RETURN_INITIATED" && prevStatus !== "Returned") {
                await restockCancelledOrderItems(order, actorName, "Order Return Restock");
                order.paymentStatus = "Refunded";
                if (updates.returnReason) order.returnReason = updates.returnReason;
                if (updates.returnType) order.returnType = updates.returnType;
                if (updates.returnNotes) order.returnNotes = updates.returnNotes;
                if (updates.returnedBy) order.returnedBy = updates.returnedBy;
                if (updates.returnedAt) order.returnedAt = updates.returnedAt;
            }
            order.deliveryStatus = newStatus;
            if (newStatus === "Delivered") {
                order.paymentStatus = "Paid";
            }
        }

        if (updates.recipientName !== undefined) order.recipientName = updates.recipientName;
        if (updates.recipientPhone !== undefined) order.recipientPhone = updates.recipientPhone;
        if (updates.deliveryAddress !== undefined) order.deliveryAddress = updates.deliveryAddress;
        if (updates.notes !== undefined) order.notes = updates.notes;
        if (updates.doNumber !== undefined) order.doNumber = updates.doNumber;
        if (updates.vehicleNo !== undefined) order.vehicleNo = updates.vehicleNo;
        if (updates.priority !== undefined) order.priority = updates.priority;
        if (updates.paymentMethod !== undefined) order.paymentMethod = updates.paymentMethod;
        if (updates.paymentStatus !== undefined) order.paymentStatus = updates.paymentStatus;
        if (updates.rider !== undefined) order.rider = updates.rider;
        if (updates.cancellationReason !== undefined) order.cancellationReason = updates.cancellationReason;
        if (updates.cancelReason !== undefined) order.cancelReason = updates.cancelReason;
        if (updates.cancelledBy !== undefined) order.cancelledBy = updates.cancelledBy;
        if (updates.cancelledTimestamp !== undefined) order.cancelledTimestamp = updates.cancelledTimestamp;
        if (updates.requestedDeliveryDate !== undefined) order.requestedDeliveryDate = updates.requestedDeliveryDate;

        if (updates.items && Array.isArray(updates.items) && updates.items.length > 0) {
            const cleanedItems = updates.items.map(item => ({
                menuItemId: item.menuItemId,
                name: item.name,
                quantity: Number(item.quantity) || 1,
                price: Number(item.price) || 0,
                portion: item.portion || "",
                notes: item.notes || ""
            }));
            order.items = cleanedItems;
            order.totalAmount = cleanedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        }

        order.timeline.push({
            action: `Order Updated (${updates.deliveryStatus || order.deliveryStatus})`,
            status: updates.deliveryStatus || order.deliveryStatus,
            timestamp: new Date(),
            user: actorName,
            notes: updates.notes || "Delivery order updated."
        });

        order.updatedBy = actorName;
        await order.save();

        res.status(200).json({
            success: true,
            message: "Delivery order updated successfully",
            data: order
        });
    } catch (err) {
        next(err);
    }
};

// Soft delete delivery order (DELETE /api/orders/:id)
const deleteDeliveryOrder = async (req, res, next) => {
    try {
        const { id } = req.params;
        const order = await Order.findById(id);
        if (!order || order.isDeleted) {
            return res.status(404).json({ success: false, message: "Delivery order not found" });
        }
        const nonDeletable = ["READY_FOR_DISPATCH", "Ready for Dispatch", "OUT_FOR_DELIVERY", "Out for Delivery", "DELIVERED", "Delivered"];
        if (nonDeletable.includes(order.deliveryStatus)) {
            return res.status(400).json({ success: false, message: "Orders in Ready for Dispatch or later status cannot be deleted." });
        }

        const actorName = req.user ? (req.user.name || req.user.username) : "Kitchen Staff";
        order.isDeleted = true;
        order.deletedBy = actorName;
        order.deletedOn = new Date();
        await order.save();

        res.status(200).json({
            success: true,
            message: "Delivery order deleted successfully"
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    createDeliveryOrder,
    getDeliveryOrders,
    updateDeliveryStatus,
    assignRider,
    updateDeliveryOrder,
    deleteDeliveryOrder
};
