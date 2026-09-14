const Order = require("../../models/order/orderModel");
const Counter = require("../../models/counter/counterModel");
const Staff = require("../../models/staff/staffModel");

// Create new delivery order
const createDeliveryOrder = async (req, res, next) => {
    try {
        const { recipientName, recipientPhone, deliveryAddress, notes, items, paymentMethod } = req.body;

        if (!recipientName || !recipientPhone || !deliveryAddress) {
            return res.status(400).json({ success: false, message: "Recipient name, phone, and delivery address are required." });
        }
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: "At least one order item is required." });
        }

        // Get next sequence for orderNo
        const counter = await Counter.findByIdAndUpdate(
            { _id: { companySlug: req.companySlug || "main-kitchen", seqName: "orderNo" } },
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );

        const orderNo = `CK-${String(counter.seq).padStart(4, "0")}`;
        const totalAmount = items.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);

        const actorName = req.user ? (req.user.name || req.user.username) : "Kitchen Staff";

        const newOrder = new Order({
            orderNo,
            recipientName,
            recipientPhone,
            deliveryAddress,
            notes: notes || "",
            items,
            totalAmount,
            paymentMethod: paymentMethod || "Cash on Delivery",
            deliveryStatus: "Created",
            timeline: [{
                action: "Order Created",
                status: "Created",
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
        const { status, search } = req.query;
        let query = { isDeleted: false, companySlug: req.companySlug || "main-kitchen" };

        if (status && status !== "All") {
            query.deliveryStatus = status;
        }

        if (search) {
            query.$or = [
                { orderNo: { $regex: search, $options: "i" } },
                { recipientName: { $regex: search, $options: "i" } },
                { recipientPhone: { $regex: search, $options: "i" } },
                { deliveryAddress: { $regex: search, $options: "i" } }
            ];
        }

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
        const { status, notes } = req.body;

        const validStatuses = ["Created", "Preparing", "Ready for Dispatch", "Out for Delivery", "Delivered", "Cancelled"];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid delivery status" });
        }

        const order = await Order.findById(id);
        if (!order || order.isDeleted) {
            return res.status(404).json({ success: false, message: "Delivery order not found" });
        }

        order.deliveryStatus = status;
        if (status === "Delivered") {
            order.paymentStatus = "Paid";
        }

        const actorName = req.user ? (req.user.name || req.user.username) : "Kitchen Staff";

        order.timeline.push({
            action: `Status changed to ${status}`,
            status: status,
            timestamp: new Date(),
            user: actorName,
            notes: notes || ""
        });

        order.updatedBy = actorName;
        await order.save();

        res.status(200).json({
            success: true,
            message: `Order status updated to ${status}`,
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

        // Auto move status to Out for Delivery if currently Ready for Dispatch or Created
        if (order.deliveryStatus === "Created" || order.deliveryStatus === "Ready for Dispatch" || order.deliveryStatus === "Preparing") {
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

module.exports = {
    createDeliveryOrder,
    getDeliveryOrders,
    updateDeliveryStatus,
    assignRider
};
