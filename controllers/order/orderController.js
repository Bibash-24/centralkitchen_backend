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
        const { status, notes } = req.body;

        const validStatuses = ["Created", "Preparing", "Ready for Dispatch", "Out for Delivery", "Delivered", "Cancelled", "PENDING_APPROVAL", "APPROVED", "REJECTED"];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid delivery status" });
        }

        const order = await Order.findById(id);
        if (!order || order.isDeleted) {
            return res.status(404).json({ success: false, message: "Delivery order not found" });
        }

        if (status) {
            order.deliveryStatus = status;
            if (status === "Delivered") {
                order.paymentStatus = "Paid";
            }
        }

        const actorName = req.user ? (req.user.name || req.user.username) : "Kitchen Staff";

        order.timeline.push({
            action: `Status changed to ${status || 'Updated'}`,
            status: status || order.deliveryStatus,
            timestamp: new Date(),
            user: actorName,
            notes: notes || ""
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

module.exports = {
    createDeliveryOrder,
    getDeliveryOrders,
    updateDeliveryStatus,
    assignRider
};
