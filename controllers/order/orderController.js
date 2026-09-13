const createHttpError = require("http-errors");
const Order = require("../../models/order/orderModel");
const { default: mongoose } = require("mongoose");
const TableDetails = require("../../models/table/tableModel");
const Notification = require("../../models/notification/notificationModel");
const Customer = require("../../models/customer/customerModel");
const Counter = require("../../models/counter/counterModel");

const addOrder = async (req, res, next) => {
    try {
        const { table, items } = req.body;

        if (table) {
            // Check if there is an active uncompleted order for this table
            const activeOrder = await Order.findOne({
                table: table,
                orderStatus: { $in: ["Pending", "In Progress", "Partially Served", "Ready", "Served"] }
            });

            if (activeOrder) {
                // If there is an active session ID lock and it does not match, block it!
                if (activeOrder.guestSessionId && activeOrder.guestSessionId !== req.body.guestSessionId) {
                    const error = createHttpError(400, "This table is currently occupied. Please ask for assistance.");
                    return next(error);
                }

                // Treat as addition: merge items list
                const mergedItems = [...activeOrder.items];
                if (items && Array.isArray(items)) {
                    items.forEach(newItem => {
                        const existingItem = mergedItems.find(item => item.name === newItem.name && item.approved === false);
                        if (existingItem) {
                            existingItem.quantity += newItem.quantity;
                            existingItem.price = Number((existingItem.quantity * existingItem.pricePerQuantity).toFixed(2));
                            existingItem.served = false; // Reset served status for new quantities
                        } else {
                            mergedItems.push({
                                ...newItem,
                                served: false,
                                approved: false
                            });
                        }
                    });
                }

                // Recompute subtotal and billing totals
                const subTotal = mergedItems.reduce((sum, item) => sum + (item.price || 0), 0);
                const tax = activeOrder.bills?.tax > 0 || req.body.bills?.tax > 0 ? subTotal * 0.13 : 0;
                const totalWithTax = subTotal + tax;

                activeOrder.items = mergedItems;
                activeOrder.bills = {
                    total: Number(subTotal.toFixed(2)),
                    tax: Number(tax.toFixed(2)),
                    totalWithTax: Number(totalWithTax.toFixed(2))
                };

                if (req.body.remarks && req.body.remarks.trim()) {
                    if (activeOrder.remarks && activeOrder.remarks.trim()) {
                        activeOrder.remarks = activeOrder.remarks + "; " + req.body.remarks.trim();
                    } else {
                        activeOrder.remarks = req.body.remarks.trim();
                    }
                }

                const actorName = req.body.guestSessionId ? "Guest" : (req.user?.email || req.user?.phone || req.user?.role || "Staff");
                const addedItemsSummary = items && Array.isArray(items) ? items.map(i => `${i.quantity}x ${i.name}`).join(", ") : "";
                activeOrder.timeline.push({
                    action: "Items Added",
                    details: `Added pending items: ${addedItemsSummary}`,
                    user: actorName
                });

                // Reset status to Pending for cashier validation/approval
                activeOrder.orderStatus = "Pending";

                await activeOrder.save();

                // Deduct inventory for newly added items
                if (items && Array.isArray(items)) {
                    try {
                        const MenuItem = require("../../models/menuItem/menuItemModel");
                        const Inventory = require("../../models/inventory/inventoryModel");

                        for (const newItem of items) {
                            const menuItemDoc = await MenuItem.findOne({ name: newItem.name, isDeleted: { $ne: true } })
                                .populate("recipe.inventoryItem", "_id unit name");

                            if (menuItemDoc && menuItemDoc.recipe && menuItemDoc.recipe.length > 0) {
                                for (const recipeIngredient of menuItemDoc.recipe) {
                                    const inventoryItem = recipeIngredient.inventoryItem;
                                    if (inventoryItem) {
                                        const deductQty = Number((recipeIngredient.ratio * newItem.quantity).toFixed(4));
                                        if (deductQty > 0) {
                                            const newAdjustment = {
                                                quantity: deductQty,
                                                reason: "Order Item Placement Deduction",
                                                notes: `Deducted automatically on item list update for Order number ${activeOrder.orderNo ? String(activeOrder.orderNo).padStart(3, '0') : activeOrder._id.toString().slice(-6).toUpperCase()} placed on ${new Date(activeOrder.createdAt).toISOString().split('T')[0]} by ${actorName}`,
                                                date: new Date(),
                                                adjustedBy: actorName
                                            };
                                            await Inventory.updateOne(
                                                { _id: inventoryItem._id },
                                                {
                                                    $inc: { currentStock: -deductQty },
                                                    $push: { adjustments: newAdjustment }
                                                }
                                            );
                                        }
                                    }
                                }
                            }
                        }
                    } catch (err) {
                        console.error("Auto inventory deduction on items addition failed:", err);
                    }
                }

                // Create database notification for order additions
                let tableNo = "Takeaway";
                const tableObj = await TableDetails.findById(table);
                if (tableObj) tableNo = `Table ${tableObj.tableNo}`;

                const additionNotification = new Notification({
                    type: "order",
                    title: "Order Items Added",
                    message: `${tableNo} - New items added to Order #${String(activeOrder.orderNo || '').padStart(3, '0')}`,
                    targetId: activeOrder._id
                });
                await additionNotification.save().catch(() => {});

                return res.status(200).json({
                    success: true,
                    message: "Items added to your active order successfully!",
                    data: activeOrder
                });
            }

            // If no active order, validate table lock status
            const tableObj = await TableDetails.findById(table);
            if (tableObj && tableObj.status === "Occupied") {
                const error = createHttpError(400, "This table is currently occupied. Please ask for assistance.");
                return next(error);
            }
        }

        const dateKey = new Date().toISOString().split('T')[0];
        const counter = await Counter.findOneAndUpdate(
            { _id: `orderNo_${dateKey}` },
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );

        req.body.orderNo = counter.seq;

        // Map items to assign approved status based on origin (guest vs cashier)
        const isGuest = req.body.guestSessionId ? true : false;
        if (req.body.items && Array.isArray(req.body.items)) {
            req.body.items = req.body.items.map(item => ({
                ...item,
                approved: !isGuest,
                served: item.served || false
            }));
        }

        const order = new Order(req.body);
        if (table) {
            const tableObj = await TableDetails.findById(table).populate("tableArea");
            if (tableObj && tableObj.tableArea?.hourlyRate > 0) {
                order.cabinStartedAt = new Date();
            }
        }

        const actor = isGuest ? "Guest" : (req.user?.name || req.user?.role || "Staff");
        order.timeline = [{
            action: "Created",
            details: `Order initialized via ${isGuest ? "Guest QR Code" : "Cashier POS Dashboard"}`,
            user: actor
        }];

        await order.save();

        if (order.orderStatus !== "Cancelled" && order.orderStatus !== "Rejected") {
            try {
                const MenuItem = require("../../models/menuItem/menuItemModel");
                const Inventory = require("../../models/inventory/inventoryModel");

                const recipePromises = order.items.map(async (orderItem) => {
                    const menuItemDoc = await MenuItem.findOne({ name: orderItem.name, isDeleted: { $ne: true } })
                        .populate("recipe.inventoryItem", "_id unit name")
                        .lean();

                    if (menuItemDoc && menuItemDoc.recipe && menuItemDoc.recipe.length > 0) {
                        const updatePromises = menuItemDoc.recipe.map(async (recipeIngredient) => {
                            const inventoryItem = recipeIngredient.inventoryItem;
                            if (inventoryItem) {
                                const deductQty = Number((recipeIngredient.ratio * orderItem.quantity).toFixed(4));
                                if (deductQty > 0) {
                                    const newAdjustment = {
                                        quantity: deductQty,
                                        reason: "Order Item Placement Deduction",
                                        notes: `Deducted automatically on placement for Order number ${order.orderNo ? String(order.orderNo).padStart(3, '0') : order._id.toString().slice(-6).toUpperCase()} placed on ${new Date(order.createdAt || Date.now()).toISOString().split('T')[0]}`,
                                        date: new Date(),
                                        adjustedBy: actor
                                    };
                                    await Inventory.updateOne(
                                        { _id: inventoryItem._id },
                                        {
                                            $inc: { currentStock: -deductQty },
                                            $push: { adjustments: newAdjustment }
                                        }
                                    );
                                }
                            }
                        });
                        await Promise.all(updatePromises);
                    }
                });

                await Promise.all(recipePromises);
            } catch (err) {
                console.error("Auto inventory deduction failed:", err);
            }
        }

        if (table) {
            await TableDetails.findByIdAndUpdate(table, {
                status: "Occupied",
                currentOrder: order._id
            });
        }

        // Create database notification for new orders
        let tableNo = "Takeaway";
        if (order.table) {
            const tableObj = await TableDetails.findById(order.table);
            if (tableObj) tableNo = `Table ${tableObj.tableNo}`;
        }
        const newOrderNotification = new Notification({
            type: "order",
            title: "New Order Received",
            message: `${tableNo} - Order #${String(order.orderNo || '').padStart(3, '0')}`,
            targetId: order._id
        });
        await newOrderNotification.save().catch(() => {});

        res.status(201).json({
            success: true,
            message: "Order created successfully!",
            data: order
        });
    } catch (error) {
        next(error);
    }
};

const getOrderById = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            const error = createHttpError(404, "Invalid id!");
            return next(error);
        }

        const order = await Order.findById(id)
            .populate({
                path: "table",
                populate: { path: "tableArea" }
            })
            .populate("creditor")
            .populate("customer");
        if (!order) {
            const error = createHttpError(404, "Order not found!");
            return next(error);
        }

        res.status(200).json({
            success: true,
            message: "Order retrieved successfully!",
            data: order
        });
    } catch (error) {
        next(error);
    }
};

const getOrders = async (req, res, next) => {
    try {
        const { activeOnly, startDate, endDate, period } = req.query;
        let query = {};

        // 1. Filter by active status
        if (activeOnly === "true") {
            query.orderStatus = { $nin: ["Completed", "Cancelled", "Rejected"] };
        }

        // 2. Filter by date range or period
        let dateQuery = {};
        if (startDate || endDate) {
            if (startDate) {
                const start = new Date(startDate);
                start.setHours(0, 0, 0, 0);
                dateQuery.$gte = start;
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                dateQuery.$lte = end;
            }
        } else if (period) {
            const now = new Date();
            if (period === "today") {
                const start = new Date();
                start.setHours(0, 0, 0, 0);
                dateQuery.$gte = start;
            } else if (period === "yesterday") {
                const start = new Date();
                start.setDate(start.getDate() - 1);
                start.setHours(0, 0, 0, 0);
                const end = new Date();
                end.setDate(end.getDate() - 1);
                end.setHours(23, 59, 59, 999);
                dateQuery.$gte = start;
                dateQuery.$lte = end;
            } else if (period === "7days") {
                const start = new Date();
                start.setDate(start.getDate() - 7);
                start.setHours(0, 0, 0, 0);
                dateQuery.$gte = start;
            } else if (period === "month") {
                const start = new Date();
                start.setDate(1);
                start.setHours(0, 0, 0, 0);
                dateQuery.$gte = start;
            } else if (period === "3months") {
                const start = new Date();
                start.setMonth(start.getMonth() - 3);
                start.setHours(0, 0, 0, 0);
                dateQuery.$gte = start;
            }
        }

        if (Object.keys(dateQuery).length > 0) {
            query.createdAt = dateQuery;
        }

        const orders = await Order.find(query)
            .populate({
                path: "table",
                populate: { path: "tableArea" }
            })
            .populate("creditor")
            .populate("customer")
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        res.status(200).json({
            success: true,
            message: "Orders retrieved successfully!",
            data: orders
        });
    } catch (error) {
        next(error);
    }
};

const updateOrder = async (req, res, next) => {
    try {
        const { orderStatus, items, bills, paymentMethod, paymentType, tableStatus, customer, redeemedPoints, redeemedPointsValue, creditor, overrideLimit, orderType, targetTableId, remarks } = req.body;
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            const error = createHttpError(404, "Invalid id!");
            return next(error);
        }

        const order = await Order.findById(id);
        if (!order) {
            const error = createHttpError(404, "Order not found!");
            return next(error);
        }

        const prevStatus = order.orderStatus;

        if (remarks !== undefined) {
            order.remarks = remarks;
        }

        if (customer !== undefined) {
            order.customer = customer;
        }

        if (redeemedPoints !== undefined) {
            order.redeemedPoints = redeemedPoints;
        }

        if (redeemedPointsValue !== undefined) {
            order.redeemedPointsValue = redeemedPointsValue;
        }

        if (creditor !== undefined) {
            order.creditor = creditor;
        }

        const actor = req.user?.name || req.user?.role || "Staff";

        // Handle Dine In / Takeaway Toggle
        if (orderType !== undefined && orderType !== order.orderType) {
            if (orderType === "Takeaway") {
                const sourceTableId = order.table;
                let sourceWasCabin = false;
                let sourceHourlyRate = 0;
                if (sourceTableId) {
                    const sourceTable = await TableDetails.findById(sourceTableId).populate("tableArea");
                    if (sourceTable) {
                        if (sourceTable.tableArea?.hourlyRate > 0) {
                            sourceWasCabin = true;
                            sourceHourlyRate = sourceTable.tableArea.hourlyRate;
                        }
                        sourceTable.status = "Empty";
                        sourceTable.currentOrder = null;
                        await sourceTable.save();
                    }
                }

                if (sourceWasCabin && order.cabinStartedAt) {
                    const timeSpentMs = new Date() - new Date(order.cabinStartedAt);
                    const hoursSpent = Math.max(0.01, timeSpentMs / (1000 * 60 * 60));
                    const charge = Math.round(hoursSpent * sourceHourlyRate);
                    order.accumulatedCabinCharge = (order.accumulatedCabinCharge || 0) + charge;
                }

                order.cabinStartedAt = null;
                order.table = null;
                order.orderType = "Takeaway";

                order.timeline.push({
                    action: "Order Type Changed",
                    details: "Switched from Dine In to Takeaway",
                    user: actor
                });
            } else if (orderType === "Dine In") {
                if (!targetTableId) {
                    const error = createHttpError(400, "targetTableId is required to switch to Dine In");
                    return next(error);
                }

                const targetTable = await TableDetails.findById(targetTableId).populate("tableArea");
                if (!targetTable) {
                    const error = createHttpError(404, "Target table not found");
                    return next(error);
                }

                if (targetTable.status === "Occupied") {
                    const error = createHttpError(400, "Target table is currently occupied");
                    return next(error);
                }

                const targetIsCabin = targetTable.tableArea?.hourlyRate > 0;
                if (targetIsCabin) {
                    order.cabinStartedAt = new Date();
                } else {
                    order.cabinStartedAt = null;
                }

                order.table = targetTableId;
                order.orderType = "Dine In";

                targetTable.status = "Occupied";
                targetTable.currentOrder = order._id;
                await targetTable.save();

                order.timeline.push({
                    action: "Order Type Changed",
                    details: `Switched from Takeaway to Dine In (Table ${targetTable.tableNo})`,
                    user: actor
                });
            }
        }

        // 1. Status changes
        if (orderStatus !== undefined && orderStatus !== order.orderStatus) {
            if (orderStatus === "Completed" && (paymentType || order.paymentType) === "Full Payment") {
                const received = bills?.receivedAmount !== undefined ? bills.receivedAmount : (order.bills?.receivedAmount || 0);
                const totalBill = bills?.totalWithTax !== undefined ? bills.totalWithTax : (order.bills?.totalWithTax || 0);
                if (received < totalBill) {
                    const error = createHttpError(400, "Received amount must be equal to or greater than the total bill");
                    return next(error);
                }
            }

            // Restore commodity inventory if order is cancelled or rejected
            if ((orderStatus === "Cancelled" || orderStatus === "Rejected") && !["Cancelled", "Rejected"].includes(order.orderStatus)) {
                const freshOrder = await Order.findOneAndUpdate(
                    { _id: id, orderStatus: { $nin: ["Cancelled", "Rejected"] } },
                    { $set: { orderStatus: orderStatus } },
                    { new: false }
                );

                if (!freshOrder) {
                    return res.status(200).json({
                        success: true,
                        message: "Order already cancelled.",
                        data: order
                    });
                }

                try {
                    const MenuItem = require("../../models/menuItem/menuItemModel");
                    const Inventory = require("../../models/inventory/inventoryModel");

                    for (const orderItem of order.items) {
                        const menuItemDoc = await MenuItem.findOne({ name: orderItem.name, isDeleted: { $ne: true } })
                            .populate("recipe.inventoryItem", "_id unit name");

                        if (menuItemDoc && menuItemDoc.recipe && menuItemDoc.recipe.length > 0) {
                            for (const recipeIngredient of menuItemDoc.recipe) {
                                const inventoryItem = recipeIngredient.inventoryItem;
                                if (inventoryItem) {
                                    const restoreQty = Number((recipeIngredient.ratio * orderItem.quantity).toFixed(4));
                                    if (restoreQty > 0) {
                                        const newAdjustment = {
                                            quantity: restoreQty,
                                            reason: "Order Cancellation Restore",
                                            notes: `Restored automatically on order cancellation for Order number ${order.orderNo ? String(order.orderNo).padStart(3, '0') : order._id.toString().slice(-6).toUpperCase()} placed on ${new Date(order.createdAt).toISOString().split('T')[0]}`,
                                            date: new Date(),
                                            adjustedBy: actor
                                        };
                                        await Inventory.updateOne(
                                            { _id: inventoryItem._id },
                                            {
                                                $inc: { currentStock: restoreQty },
                                                $push: { adjustments: newAdjustment }
                                            }
                                        );
                                    }
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error("Auto inventory restoration on cancellation failed:", err);
                }
            }

            order.timeline.push({
                action: "Status Changed",
                details: `Order status updated from "${order.orderStatus}" to "${orderStatus}"`,
                user: actor
            });
            order.orderStatus = orderStatus;
        }

        // 2. Items approval / items list changes
        if (items !== undefined) {
            const targetStatus = orderStatus !== undefined ? orderStatus : order.orderStatus;
            if (!["Cancelled", "Rejected"].includes(targetStatus)) {
                // Calculate item differences to sync inventory
                try {
                    const oldItemQuantities = {};
                    order.items.forEach(item => {
                        oldItemQuantities[item.name] = (oldItemQuantities[item.name] || 0) + item.quantity;
                    });

                    const newItemQuantities = {};
                    items.forEach(item => {
                        newItemQuantities[item.name] = (newItemQuantities[item.name] || 0) + item.quantity;
                    });

                    const allNames = new Set([...Object.keys(oldItemQuantities), ...Object.keys(newItemQuantities)]);
                    const MenuItem = require("../../models/menuItem/menuItemModel");
                    const Inventory = require("../../models/inventory/inventoryModel");

                    const updatePromises = Array.from(allNames).map(async (name) => {
                        const oldQty = oldItemQuantities[name] || 0;
                        const newQty = newItemQuantities[name] || 0;
                        const diffQty = newQty - oldQty;

                        if (diffQty !== 0) {
                            const menuItemDoc = await MenuItem.findOne({ name: name, isDeleted: { $ne: true } })
                                .populate("recipe.inventoryItem", "_id unit name")
                                .lean();

                            if (menuItemDoc && menuItemDoc.recipe && menuItemDoc.recipe.length > 0) {
                                const recipePromises = menuItemDoc.recipe.map(async (recipeIngredient) => {
                                    const inventoryItem = recipeIngredient.inventoryItem;
                                    if (inventoryItem) {
                                        const qtyChange = Number((recipeIngredient.ratio * Math.abs(diffQty)).toFixed(4));
                                        if (qtyChange > 0) {
                                            if (diffQty > 0) {
                                                // Deduct
                                                const newAdjustment = {
                                                    quantity: qtyChange,
                                                    reason: "Order Item Update Deduction",
                                                    notes: `Deducted automatically on item list update for Order number ${order.orderNo ? String(order.orderNo).padStart(3, '0') : order._id.toString().slice(-6).toUpperCase()} placed on ${new Date(order.createdAt).toISOString().split('T')[0]} by ${actor}`,
                                                    date: new Date(),
                                                    adjustedBy: actor
                                                };
                                                await Inventory.updateOne(
                                                    { _id: inventoryItem._id },
                                                    {
                                                        $inc: { currentStock: -qtyChange },
                                                        $push: { adjustments: newAdjustment }
                                                    }
                                                );
                                            } else {
                                                // Restore / Add back
                                                const newAdjustment = {
                                                    quantity: qtyChange,
                                                    reason: "Order Item Update Restore",
                                                    notes: `Restored automatically on item list update for Order number ${order.orderNo ? String(order.orderNo).padStart(3, '0') : order._id.toString().slice(-6).toUpperCase()} placed on ${new Date(order.createdAt).toISOString().split('T')[0]} by ${actor}`,
                                                    date: new Date(),
                                                    adjustedBy: actor
                                                };
                                                await Inventory.updateOne(
                                                    { _id: inventoryItem._id },
                                                    {
                                                        $inc: { currentStock: qtyChange },
                                                        $push: { adjustments: newAdjustment }
                                                    }
                                                );
                                            }
                                        }
                                    }
                                });
                                await Promise.all(recipePromises);
                            }
                        }
                    });
                    await Promise.all(updatePromises);
                } catch (err) {
                    console.error("Sync inventory on item list update failed:", err);
                }
            }

            const hasUnapprovedBefore = order.items.some(i => i.approved === false);
            const allApprovedNow = items.every(i => i.approved !== false);
            if (hasUnapprovedBefore && allApprovedNow) {
                order.timeline.push({
                    action: "Approved",
                    details: "Guest item additions approved by cashier",
                    user: actor
                });
                // Auto-resolve database notifications when guest additions are approved
                await Notification.updateMany({ targetId: order._id }, { isRead: true }).catch(() => {});
            } else {
                // Check if items list grew
                const oldLength = order.items.length;
                const newLength = items.length;
                if (newLength > oldLength) {
                    const added = items.slice(oldLength).map(i => `${i.quantity}x ${i.name}`).join(", ");
                    order.timeline.push({
                        action: "Items Added",
                        details: `Added: ${added}`,
                        user: actor
                    });
                }
            }
            order.items = items;
            order.markModified("items");

            // Recalculate status based on the new items served/approved status if the order is not terminal
            const isTerminalStatus = ["Completed", "Cancelled", "Rejected"].includes(targetStatus);

            if (!isTerminalStatus) {
                let totalUnits = 0;
                let servedUnits = 0;

                items.forEach(item => {
                    if (Array.isArray(item.subItems) && item.subItems.length > 0) {
                        totalUnits += item.subItems.length;
                        servedUnits += item.subItems.filter(s => s.served).length;
                    } else if (Array.isArray(item.servedSubItems) && item.servedSubItems.length > 0) {
                        totalUnits += item.servedSubItems.length;
                        servedUnits += item.servedSubItems.filter(Boolean).length;
                    } else {
                        totalUnits += 1;
                        if (item.served) servedUnits += 1;
                    }
                });

                const hasUnapproved = items.some(i => i.approved === false);

                if (hasUnapproved) {
                    order.orderStatus = "Pending";
                } else {
                    if (servedUnits === 0) {
                        order.orderStatus = "In Progress";
                    } else if (servedUnits === totalUnits) {
                        order.orderStatus = "Served";
                    } else {
                        order.orderStatus = "Partially Served";
                    }
                }
            }
        }

        // 3. Payment config
        if (paymentMethod !== undefined && paymentMethod !== order.paymentMethod) {
            order.timeline.push({
                action: "Payment Configured",
                details: `Payment method set to "${paymentMethod}"`,
                user: actor
            });
            order.paymentMethod = paymentMethod;
        }

        if (paymentType !== undefined && paymentType !== order.paymentType) {
            order.timeline.push({
                action: "Payment Configured",
                details: `Payment type set to "${paymentType}"`,
                user: actor
            });
            order.paymentType = paymentType;
        }

        // 4. Bills total update
        if (bills !== undefined) {
            order.bills = bills;
        }

        // Automatically resolve database notifications when order is finished, cancelled, or rejected
        if (orderStatus === "Completed" || orderStatus === "Cancelled" || orderStatus === "Rejected") {
            await Notification.updateMany({ targetId: order._id }, { isRead: true }).catch(() => {});
        }

        // Handle creditor balance update on checkout completion
        if (orderStatus === "Completed") {
            const finalPaymentType = paymentType || order.paymentType;
            const finalPaymentMethod = paymentMethod || order.paymentMethod;
            const finalCreditorId = creditor || order.creditor;

            if (finalPaymentMethod === "Credit" || finalPaymentType === "Partial Payment") {
                if (!finalCreditorId) {
                    const error = createHttpError(400, "A creditor profile must be linked for credit or partial payments.");
                    return next(error);
                }

                const Creditor = require("../../models/creditor/creditorModel");
                const creditorDoc = await Creditor.findOne({ _id: finalCreditorId, isDeleted: { $ne: true } });
                if (!creditorDoc) {
                    const error = createHttpError(404, "Linked creditor profile not found.");
                    return next(error);
                }

                // Check restaurant config to see if credit system is enabled
                const RestaurantConfig = require("../../models/restaurant/restaurantModel");
                const rConfig = await RestaurantConfig.findOne();
                if (!rConfig || !rConfig.creditEnabled) {
                    const error = createHttpError(400, "The credit payment option is currently disabled in system settings.");
                    return next(error);
                }

                if (creditorDoc.isBlacklisted) {
                    const error = createHttpError(400, `This creditor is currently blacklisted: ${creditorDoc.blacklistReason || 'No reason specified'}`);
                    return next(error);
                }

                const totalSpent = bills?.totalWithTax !== undefined ? bills.totalWithTax : (order.bills?.totalWithTax || 0);
                const received = bills?.receivedAmount !== undefined ? bills.receivedAmount : (order.bills?.receivedAmount || 0);

                let creditAmount = 0;
                if (finalPaymentType === "Full Payment" && finalPaymentMethod === "Credit") {
                    creditAmount = totalSpent;
                } else if (finalPaymentType === "Partial Payment") {
                    creditAmount = Math.max(0, Number((totalSpent - received).toFixed(2)));
                }

                if (creditAmount > 0) {
                    // Check limit
                    const limit = creditorDoc.creditLimit !== undefined ? creditorDoc.creditLimit : (rConfig.creditMaxLimit || 5000);
                    if (!overrideLimit && creditorDoc.currentBalance + creditAmount > limit) {
                        const error = createHttpError(400, `Credit limit exceeded! Max credit allowed: रु ${limit}. Current debt: रु ${creditorDoc.currentBalance}. Additional debt: रु ${creditAmount}.`);
                        return next(error);
                    }

                    const newCreditEntry = {
                        type: "credit",
                        amount: creditAmount,
                        orderId: order._id,
                        orderNo: order.orderNo ? String(order.orderNo).padStart(3, '0') : order._id.toString().slice(-6).toUpperCase(),
                        timestamp: new Date()
                    };
                    await Creditor.updateOne(
                        { _id: creditorDoc._id },
                        {
                            $inc: { currentBalance: creditAmount },
                            $push: { creditHistory: newCreditEntry }
                        }
                    );

                    order.creditor = finalCreditorId;
                    order.creditAmount = creditAmount;

                    order.timeline.push({
                        action: "Credit Recorded",
                        details: `Recorded रु ${creditAmount} outstanding debt against creditor ${creditorDoc.name}`,
                        user: "Credit Engine"
                    });
                }
            }
        }

        // Handle customer loyalty points calculation on checkout completion
        if (orderStatus === "Completed" && prevStatus !== "Completed") {
            // Record order discount as business expense if any
            const discountAmount = order.bills?.discount || 0;
            if (discountAmount > 0) {
                try {
                    const Expense = require("../../models/expense/expenseModel");
                    const discountExpense = new Expense({
                        description: `Order Discount - Order #${order.orderNo ? String(order.orderNo).padStart(3, '0') : order._id.toString().slice(-6).toUpperCase()}`,
                        category: "Others",
                        amount: discountAmount,
                        method: order.paymentMethod || "Cash",
                        createdBy: actor || "System",
                        date: order.createdAt || new Date()
                    });
                    await discountExpense.save();
                } catch (expErr) {
                    console.error("Failed to automatically record discount expense:", expErr);
                }
            }

            const finalCustomer = customer || order.customer;
            if (finalCustomer) {
                const customerDoc = await Customer.findOne({ _id: finalCustomer, isDeleted: { $ne: true } });
                if (customerDoc) {
                    const RestaurantConfig = require("../../models/restaurant/restaurantModel");
                    const rConfig = await RestaurantConfig.findOne();
                    if (rConfig && rConfig.crmEnabled) {
                        const earnRate = rConfig.crmPointsEarnRate || 100;
                        const totalSpent = bills?.totalWithTax !== undefined ? bills.totalWithTax : (order.bills?.totalWithTax || 0);
                        const baseAmount = bills?.total !== undefined ? bills.total : (order.bills?.total || 0);

                        // If points are redeemed, process the deduction
                        const pointsToRedeem = redeemedPoints !== undefined ? redeemedPoints : (order.redeemedPoints || 0);
                        const redeemVal = redeemedPointsValue !== undefined ? redeemedPointsValue : (order.redeemedPointsValue || 0);

                        const updateFields = {
                            spent: Number((customerDoc.spent + totalSpent).toFixed(2)),
                            visits: customerDoc.visits + 1
                        };
                        const incFields = {};
                        const pushArray = [];

                        if (pointsToRedeem >= 10 && customerDoc.points >= 10) {
                            incFields.points = -pointsToRedeem;
                            incFields.pointsRedeemed = pointsToRedeem;
                            pushArray.push({
                                type: "redeemed",
                                points: pointsToRedeem,
                                amount: redeemVal,
                                orderId: order._id,
                                orderNo: order.orderNo ? String(order.orderNo).padStart(3, '0') : order._id.toString().slice(-6).toUpperCase(),
                                timestamp: new Date()
                            });

                            order.timeline.push({
                                action: "Loyalty Points Redeemed",
                                details: `Customer ${customerDoc.name} redeemed ${pointsToRedeem} points for discount value of Rs. ${redeemVal}`,
                                user: "Loyalty CRM Engine"
                            });

                            // Create an expense document under others/loyalty redemption
                            if (redeemVal > 0) {
                                const Expense = require("../../models/expense/expenseModel");
                                const loyaltyExpense = new Expense({
                                    description: `Loyalty Redemption - Order #${order.orderNo ? String(order.orderNo).padStart(3, '0') : order._id.toString().slice(-6).toUpperCase()}`,
                                    category: "Others",
                                    amount: redeemVal,
                                    method: order.paymentMethod || "Cash",
                                    createdBy: "Loyalty CRM Engine",
                                    date: order.createdAt || new Date(),
                                    customer: customerDoc._id
                                });
                                await loyaltyExpense.save();
                            }
                        }

                        const earnBaseAmount = Math.max(0, baseAmount - redeemVal);
                        const earnedPoints = Math.floor(earnBaseAmount / earnRate);
                        if (earnedPoints >= 1) {
                            incFields.points = (incFields.points || 0) + earnedPoints;
                            pushArray.push({
                                type: "earned",
                                points: earnedPoints,
                                amount: earnBaseAmount,
                                orderId: order._id,
                                orderNo: order.orderNo ? String(order.orderNo).padStart(3, '0') : order._id.toString().slice(-6).toUpperCase(),
                                timestamp: new Date()
                            });

                            order.timeline.push({
                                action: "Loyalty Points Awarded",
                                details: `Customer ${customerDoc.name} awarded ${earnedPoints} points for untaxed bill amount of Rs. ${earnBaseAmount}`,
                                user: "Loyalty CRM Engine"
                            });
                        }

                        const updateQuery = {
                            $set: updateFields
                        };
                        if (Object.keys(incFields).length > 0) {
                            updateQuery.$inc = incFields;
                        }
                        if (pushArray.length > 0) {
                            updateQuery.$push = { pointsHistory: { $each: pushArray } };
                        }

                        await Customer.updateOne({ _id: customerDoc._id }, updateQuery);
                    }
                }
            }
        }

        // Handle table occupancy status transitions
        if (order.table) {
            const tableDoc = await TableDetails.findById(order.table);
            if (tableDoc) {
                const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
                if (orderStatus === "Completed") {
                    const finalTableStatus = tableStatus || "Empty";
                    if (finalTableStatus === "Empty" && tableDoc.parentTable) {
                        tableDoc.isDeleted = true;
                        tableDoc.tableNo = `${tableDoc.tableNo}_deleted_${Date.now()}`;
                        tableDoc.deletedBy = actorName;
                        tableDoc.deletedOn = new Date();
                        tableDoc.status = "Empty";
                        tableDoc.currentOrder = null;
                        await tableDoc.save();
                    } else {
                        tableDoc.status = finalTableStatus;
                        tableDoc.currentOrder = finalTableStatus === "Empty" ? null : order._id;
                        await tableDoc.save();
                    }
                } else if (orderStatus === "Cancelled" || orderStatus === "Rejected") {
                    if (tableDoc.parentTable) {
                        tableDoc.isDeleted = true;
                        tableDoc.tableNo = `${tableDoc.tableNo}_deleted_${Date.now()}`;
                        tableDoc.deletedBy = actorName;
                        tableDoc.deletedOn = new Date();
                        tableDoc.status = "Empty";
                        tableDoc.currentOrder = null;
                        await tableDoc.save();
                    } else {
                        tableDoc.status = "Empty";
                        tableDoc.currentOrder = null;
                        await tableDoc.save();
                    }
                }
            }
        }

        order.markModified("items");
        order.markModified("bills");
        order.markModified("timeline");
        await order.save();

        res.status(200).json({
            success: true,
            message: "Order updated successfully!",
            data: order
        });
    } catch (error) {
        next(error);
    }
};

const switchTable = async (req, res, next) => {
    try {
        const { orderId, targetTableId } = req.body;
        if (!orderId || !targetTableId) {
            const error = createHttpError(400, "orderId and targetTableId are required!");
            return next(error);
        }

        const order = await Order.findById(orderId);
        if (!order) {
            const error = createHttpError(404, "Order not found!");
            return next(error);
        }

        const targetTable = await TableDetails.findById(targetTableId).populate("tableArea");
        if (!targetTable) {
            const error = createHttpError(404, "Target table not found!");
            return next(error);
        }

        if (targetTable.status === "Occupied") {
            const error = createHttpError(400, "Target table is currently occupied!");
            return next(error);
        }

        const sourceTableId = order.table;
        let sourceWasCabin = false;
        let sourceHourlyRate = 0;
        if (sourceTableId) {
            const sourceTable = await TableDetails.findById(sourceTableId).populate("tableArea");
            if (sourceTable && sourceTable.tableArea?.hourlyRate > 0) {
                sourceWasCabin = true;
                sourceHourlyRate = sourceTable.tableArea.hourlyRate;
            }
        }

        // Calculate and accumulate cabin charge if source was a cabin
        if (sourceWasCabin && order.cabinStartedAt) {
            const timeSpentMs = new Date() - new Date(order.cabinStartedAt);
            const hoursSpent = Math.max(0.01, timeSpentMs / (1000 * 60 * 60)); // minimum 0.01 hours
            const charge = Math.round(hoursSpent * sourceHourlyRate);
            order.accumulatedCabinCharge = (order.accumulatedCabinCharge || 0) + charge;
        }

        const targetIsCabin = targetTable.tableArea?.hourlyRate > 0;

        if (targetIsCabin) {
            order.cabinStartedAt = new Date();
        } else {
            order.cabinStartedAt = null;
        }

        const sourceTable = sourceTableId ? await TableDetails.findById(sourceTableId) : null;
        const sourceNo = sourceTable ? `Table ${sourceTable.tableNo}` : "Takeaway / No Table";
        const targetNo = `Table ${targetTable.tableNo}`;

        order.timeline.push({
            action: "Table Switched",
            details: `Moved from ${sourceNo} to ${targetNo}`,
            user: req.user?.name || req.user?.role || "Staff"
        });

        // 1. Update order's table reference
        order.table = targetTableId;
        await order.save();

        // 2. Set target table status to Occupied and associate with order
        targetTable.status = "Occupied";
        targetTable.currentOrder = order._id;
        await targetTable.save();

        // 3. Set source table (if any) status to Empty and clear currentOrder
        if (sourceTableId) {
            await TableDetails.findByIdAndUpdate(sourceTableId, {
                status: "Empty",
                currentOrder: null
            });
        }

        res.status(200).json({
            success: true,
            message: "Table switched successfully!",
            data: order
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { addOrder, getOrderById, getOrders, updateOrder, switchTable };