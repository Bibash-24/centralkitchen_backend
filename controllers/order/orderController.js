const { applyDeliveryAudit, syncBatchDeliveryAudit } = require("../../services/delivery/deliveryAuditService");
const { sendDispatchNotification, DISPATCH_EVENTS } = require("../../services/notification/dispatchNotificationService");
const mongoose = require("mongoose");
const Order = require("../../models/order/orderModel");
const Issue = require("../../models/issue/issueModel");
const { deductDeliveryOrderInventory } = require("../../services/delivery/deliveryInventoryService");
const Counter = require("../../models/counter/counterModel");
const Staff = require("../../models/staff/staffModel");
const Inventory = require("../../models/inventory/inventoryModel");
const MenuItem = require("../../models/menuItem/menuItemModel");
const Creditor = require("../../models/creditor/creditorModel");
const Customer = require("../../models/customer/customerModel");
const Expense = require("../../models/expense/expenseModel");
const DropdownOption = require("../../models/dropdownOption/dropdownOptionModel");

// Restock inventory for cancelled orders

const escapeRegex = (str) => String(str).replace(/[.*+?^$\{}()|[\]\\]/g, '\\$&');


// Helper to sync order refund to Creditors and Customers balance and transaction history
const syncRefundToCreditor = async (order, actorName, extraParams = {}) => {
    try {
        if (!order || !order.orderNo) return;
        const targetStatus = extraParams.status || extraParams.deliveryStatus || order.deliveryStatus;
        if (targetStatus !== "Returned") return;

        const refundMethod = extraParams.returnType || extraParams.refundMethod || order.returnType || order.refundMethod || order.paymentMethod || "Cash";
        const refundMethodNorm = String(refundMethod || "").trim().toLowerCase();
        const isStoreCredit = refundMethodNorm === "store credit" || refundMethodNorm.includes("store credit");
        const refundAmount = Number(order.totalAmount) || 0;
        if (refundAmount <= 0) return;

        const notesStr = extraParams.refundNotes || extraParams.returnNotes || extraParams.notes || order.refundNotes || order.returnNotes || "";
        const returnedDate = extraParams.returnedAt || order.returnedAt || new Date();

        const entityFilter = {
            isDeleted: { $ne: true },
            $or: [
                { companySlug: order.companySlug },
                { companySlug: { $exists: false } },
                { companySlug: null }
            ]
        };

        const phoneClean = order.recipientPhone ? String(order.recipientPhone).trim() : "";
        const nameClean = order.recipientName ? String(order.recipientName).trim() : "";

        const matchedAccounts = [];

        // Check Creditors
        let creditor = null;
        if (phoneClean) {
            creditor = await Creditor.findOne({
                ...entityFilter,
                phone: { $regex: new RegExp("^" + escapeRegex(phoneClean) + "$", "i") }
            });
        }
        if (!creditor && nameClean) {
            creditor = await Creditor.findOne({
                ...entityFilter,
                name: { $regex: new RegExp("^" + escapeRegex(nameClean) + "$", "i") }
            });
        }
        if (creditor) matchedAccounts.push(creditor);

        // Check Customers
        let customer = null;
        if (phoneClean) {
            customer = await Customer.findOne({
                ...entityFilter,
                phone: { $regex: new RegExp("^" + escapeRegex(phoneClean) + "$", "i") }
            });
        }
        if (!customer && nameClean) {
            customer = await Customer.findOne({
                ...entityFilter,
                name: { $regex: new RegExp("^" + escapeRegex(nameClean) + "$", "i") }
            });
        }
        if (customer) matchedAccounts.push(customer);

        // If Store Credit was selected and recipient has no creditor or customer profile yet, create a Creditor profile
        if (matchedAccounts.length === 0 && isStoreCredit && nameClean && phoneClean) {
            const newCred = new Creditor({
                companySlug: order.companySlug || "default",
                name: nameClean,
                phone: phoneClean,
                address: order.deliveryAddress || "N/A",
                currentBalance: 0,
                creditLimit: 5000,
                createdBy: actorName,
                createdOn: new Date(),
                creditHistory: []
            });
            matchedAccounts.push(newCred);
        }

        for (const targetAccount of matchedAccounts) {
            if (!Array.isArray(targetAccount.creditHistory)) {
                targetAccount.creditHistory = [];
            }

            const alreadyLogged = targetAccount.creditHistory.some(
                h => (h.orderId && String(h.orderId) === String(order._id)) ||
                     (h.orderNo && String(h.orderNo) === String(order.orderNo) && h.type === "payment" && String(h.note || "").toLowerCase().includes("refund"))
            );

            if (!alreadyLogged) {
                const currentBal = Number(targetAccount.currentBalance) || 0;
                let newBalance = currentBal;

                if (isStoreCredit) {
                    if (currentBal > 0) {
                        const deduct = Math.min(currentBal, refundAmount);
                        newBalance = Number((currentBal - deduct).toFixed(2));
                        const excess = Number((refundAmount - deduct).toFixed(2));
                        if (excess > 0) {
                            targetAccount.storeCredit = Number(((Number(targetAccount.storeCredit) || 0) + excess).toFixed(2));
                        }
                    } else {
                        targetAccount.storeCredit = Number(((Number(targetAccount.storeCredit) || 0) + refundAmount).toFixed(2));
                        newBalance = 0;
                    }
                } else {
                    newBalance = Math.max(0, Number((currentBal - refundAmount).toFixed(2)));
                }

                const noteLabel = isStoreCredit
                    ? `Store Credit Refund for Order #${order.orderNo}${notesStr ? ': ' + notesStr : ''}`
                    : `Refund (${refundMethod}) for Order #${order.orderNo}${notesStr ? ': ' + notesStr : ''}`;

                targetAccount.creditHistory.push({
                    type: "payment",
                    amount: refundAmount,
                    orderId: order._id,
                    orderNo: order.orderNo,
                    note: noteLabel,
                    timestamp: returnedDate
                });

                targetAccount.currentBalance = newBalance;
                targetAccount.updatedBy = actorName;
                targetAccount.updatedOn = new Date();

                await targetAccount.save();
            } else if (isStoreCredit && (Number(targetAccount.storeCredit) || 0) === 0 && (Number(targetAccount.currentBalance) || 0) === 0) {
                targetAccount.storeCredit = Number(((Number(targetAccount.storeCredit) || 0) + refundAmount).toFixed(2));
                targetAccount.updatedBy = actorName;
                targetAccount.updatedOn = new Date();
                await targetAccount.save();
            }
        }
    } catch (err) {
        console.error("Error syncing refund to creditor/customer:", err);
    }
};


// Helper to sync order refund to Expenses directory
const syncRefundExpense = async (order, actorName, extraParams = {}) => {
    try {
        if (!order || !order.orderNo) return;
        const targetStatus = extraParams.status || extraParams.deliveryStatus || order.deliveryStatus;
        if (targetStatus !== "Returned") return;

        const refundAmount = Number(order.totalAmount) || 0;
        if (refundAmount <= 0) return;

        const refundMethod = extraParams.returnType || extraParams.refundMethod || order.returnType || order.refundMethod || order.paymentMethod || "Cash";
        const notesStr = extraParams.refundNotes || extraParams.returnNotes || extraParams.notes || order.refundNotes || order.returnNotes || "";
        const returnedDate = extraParams.returnedAt || extraParams.refundProcessedAt || order.returnedAt || new Date();

        // Check if an expense for this refund already exists to avoid duplicates
        const existingExpense = await Expense.findOne({
            companySlug: order.companySlug || "default",
            description: { $regex: new RegExp("^Refund for Order #" + escapeRegex(order.orderNo), "i") }
        });

        if (existingExpense) {
            existingExpense.amount = refundAmount;
            existingExpense.method = refundMethod;
            existingExpense.updatedBy = actorName;
            await existingExpense.save();
            return;
        }

        // Link customer if available
        let customerId = null;
        const phoneClean = order.recipientPhone ? String(order.recipientPhone).trim() : "";
        if (phoneClean) {
            const cust = await Customer.findOne({
                phone: { $regex: new RegExp("^" + escapeRegex(phoneClean) + "$", "i") },
                isDeleted: { $ne: true }
            });
            if (cust) customerId = cust._id;
        }

        const recipientLabel = order.recipientName ? " (" + order.recipientName + ")" : "";
        const notesLabel = notesStr ? " - " + notesStr : "";
        const desc = "Refund for Order #" + order.orderNo + recipientLabel + notesLabel;

        const newExpense = new Expense({
            companySlug: order.companySlug || "default",
            description: desc,
            category: "Order Refund",
            amount: refundAmount,
            method: refundMethod,
            date: returnedDate,
            customer: customerId || undefined,
            createdBy: actorName
        });

        await newExpense.save();
    } catch (err) {
        console.error("Error syncing refund expense:", err);
    }
};

// Helper to sync new credit dispatch order to Creditors and Customers balance and transaction history
const syncOrderToCreditor = async (order, actorName) => {
    try {
        if (!order || !order.orderNo) return;
        const methodNorm = String(order.paymentMethod || "").trim().toLowerCase();
        const isCreditPayment = methodNorm === "credit";
        const isStoreCreditPayment = methodNorm === "store credit";
        if (!isCreditPayment && !isStoreCreditPayment) return;
        const creditAmount = Number(order.totalAmount) || 0;
        if (creditAmount <= 0) return;

        const entityFilter = {
            isDeleted: { $ne: true },
            $or: [
                { companySlug: order.companySlug },
                { companySlug: { $exists: false } },
                { companySlug: null }
            ]
        };

        const phoneClean = order.recipientPhone ? String(order.recipientPhone).trim() : "";
        const nameClean = order.recipientName ? String(order.recipientName).trim() : "";

        const matchedAccounts = [];

        // Check Creditors
        let creditor = null;
        if (phoneClean) {
            creditor = await Creditor.findOne({
                ...entityFilter,
                phone: { $regex: new RegExp("^" + escapeRegex(phoneClean) + "$", "i") }
            });
        }
        if (!creditor && nameClean) {
            creditor = await Creditor.findOne({
                ...entityFilter,
                name: { $regex: new RegExp("^" + escapeRegex(nameClean) + "$", "i") }
            });
        }
        if (creditor) matchedAccounts.push(creditor);

        // Check Customers
        let customer = null;
        if (phoneClean) {
            customer = await Customer.findOne({
                ...entityFilter,
                phone: { $regex: new RegExp("^" + escapeRegex(phoneClean) + "$", "i") }
            });
        }
        if (!customer && nameClean) {
            customer = await Customer.findOne({
                ...entityFilter,
                name: { $regex: new RegExp("^" + escapeRegex(nameClean) + "$", "i") }
            });
        }
        if (customer) matchedAccounts.push(customer);

        for (const targetAccount of matchedAccounts) {
            if (!Array.isArray(targetAccount.creditHistory)) {
                targetAccount.creditHistory = [];
            }

            if (isStoreCreditPayment) {
                const alreadyLogged = targetAccount.creditHistory.some(
                    h => (h.orderId && String(h.orderId) === String(order._id)) ||
                         (h.orderNo && String(h.orderNo) === String(order.orderNo) && h.note && h.note.includes("Store Credit"))
                );
                if (!alreadyLogged) {
                    targetAccount.creditHistory.push({
                        type: "credit",
                        amount: creditAmount,
                        orderId: order._id,
                        orderNo: order.orderNo,
                        note: `Dispatch Order #${order.orderNo} paid via Store Credit`,
                        timestamp: new Date()
                    });
                    const currentStoreCredit = Number(targetAccount.storeCredit) || 0;
                    targetAccount.storeCredit = Math.max(0, Number((currentStoreCredit - creditAmount).toFixed(2)));
                    targetAccount.updatedBy = actorName;
                    targetAccount.updatedOn = new Date();
                    await targetAccount.save();
                }
            } else if (isCreditPayment) {
                const alreadyLogged = targetAccount.creditHistory.some(
                    h => (h.orderId && String(h.orderId) === String(order._id)) ||
                         (h.orderNo && String(h.orderNo) === String(order.orderNo) && h.type === "credit")
                );
                if (!alreadyLogged) {
                    targetAccount.creditHistory.push({
                        type: "credit",
                        amount: creditAmount,
                        orderId: order._id,
                        orderNo: order.orderNo,
                        note: `Dispatch Order #${order.orderNo} on Credit`,
                        timestamp: new Date()
                    });
                    targetAccount.currentBalance = Number(((Number(targetAccount.currentBalance) || 0) + creditAmount).toFixed(2));
                    targetAccount.updatedBy = actorName;
                    targetAccount.updatedOn = new Date();
                    await targetAccount.save();
                }
            }
        }
    } catch (err) {
        console.error("Error syncing order to creditor/customer:", err);
    }
};

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

        // Dynamic company prefix resolution
        const getCompanyPrefix = (slug) => {
            if (!slug || typeof slug !== "string") return "CK";
            const parts = slug.split(/[-_]+/).filter(Boolean);
            const initials = parts.map(part => part.charAt(0).toUpperCase()).join("");
            return initials || "CK";
        };
        const companyPrefix = getCompanyPrefix(companySlug);

        // Get guaranteed unique orderNo sequence per company/tenant
        let orderNo = req.body?.orderNo;
        if (!orderNo || (await Order.findOne({ orderNo }))) {
            let isUnique = false;
            const counterSlug = companySlug || "global";
            while (!isUnique) {
                const counter = await Counter.findByIdAndUpdate(
                    { _id: { companySlug: counterSlug, seqName: "orderNo" } },
                    { $inc: { seq: 1 } },
                    { new: true, upsert: true }
                );

                const candidate = `${companyPrefix}-${String(counter.seq).padStart(4, "0")}`;
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
            sourceWarehouse: req.body?.sourceWarehouse || req.body?.source || (companySlug ? `${companySlug.split(/[-_]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")} Warehouse` : "Main Warehouse"),
            branch: req.body?.branch || req.user?.branch || "",
            franchise: req.body?.franchise || req.user?.franchise || "",
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
            createdByUserId: req.user?._id || req.user?.id || null,
            updatedBy: actorName
        });

        await newOrder.save();
        await syncOrderToCreditor(newOrder, actorName);

        // DeliGati Internal Dispatch Notification: NEW_ORDER
        sendDispatchNotification({
            event: DISPATCH_EVENTS.NEW_ORDER,
            order: newOrder,
            actor: req.user
        }).catch(err => console.error("Notification error on NEW_ORDER:", err));

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

        const validStatuses = ["Created", "ARRIVED", "PENDING_RECEIVER_CONFIRMATION", "Preparing", "Ready for Dispatch", "Out for Delivery", "Delivered", "Cancelled", "PENDING_APPROVAL", "APPROVED", "REJECTED", "RETURN_INITIATED", "Returned"];
        let isStatusAllowed = validStatuses.includes(status);
        if (status && !isStatusAllowed) {
            const existsInDropdown = await DropdownOption.findOne({
                usedFor: "delivery_status",
                $or: [{ value: status }, { name: status }],
                isActive: { $ne: false },
                isDeleted: { $ne: true }
            });
            if (existsInDropdown) {
                isStatusAllowed = true;
            }
        }
        if (status && !isStatusAllowed) {
            return res.status(400).json({ success: false, message: "Invalid delivery status" });
        }

        const order = await Order.findById(id);
        if (!order || order.isDeleted) {
            return res.status(404).json({ success: false, message: "Delivery order not found" });
        }

        if (status) {
            const prevStatus = order.deliveryStatus;
            const isReturningFromDelivered = (prevStatus === "Delivered" || prevStatus === "DELIVERED") && (status === "RETURN_INITIATED" || status === "Returned");
            if (["Delivered", "DELIVERED", "Cancelled", "CANCELLED"].includes(prevStatus) && status !== prevStatus && !isReturningFromDelivered) {
                return res.status(400).json({
                    success: false,
                    message: `Order status is locked (${prevStatus}) and cannot be modified.`
                });
            }
                        // Step 5: Handle Rider Arrival at Destination
            if (status === "ARRIVED" || status === "PENDING_RECEIVER_CONFIRMATION") {
                // When rider marks ARRIVED: IN_TRANSIT -> ARRIVED -> PENDING_RECEIVER_CONFIRMATION
                // The delivery must NOT automatically become DELIVERED.
                order.deliveryStatus = status;
            } else {
                order.deliveryStatus = status;
            }
            if (status === "Delivered") {
                order.paymentStatus = "Paid";
                if (req.body.receiverName || req.body.signature) {
                    order.receiverConfirmation = {
                        receiverUser: req.body.receiverUser || (req.user ? (req.user.email || req.user.name) : ""),
                        receiverName: req.body.receiverName ? String(req.body.receiverName).trim() : (order.recipientName || ""),
                        receiverPhone: req.body.receiverPhone ? String(req.body.receiverPhone).trim() : (order.recipientPhone || ""),
                        franchise: req.body.franchise || order.recipientName || "",
                        signature: req.body.signature ? String(req.body.signature).trim() : "",
                        notes: req.body.notes ? String(req.body.notes).trim() : "",
                        confirmedAt: new Date(),
                        itemsConfirmed: Array.isArray(req.body.itemsConfirmed) ? req.body.itemsConfirmed : [],
                        hasDiscrepancy: Boolean(req.body.hasDiscrepancy),
                        discrepancyType: req.body.discrepancyType || "",
                        discrepancyNotes: req.body.discrepancyNotes || "",
                        issueId: null
                    };

                    // Step 7: Auto-create claim in DeliGati Issues module if discrepancy flagged
                    if (order.receiverConfirmation.hasDiscrepancy) {
                        try {
                            const discType = order.receiverConfirmation.discrepancyType || "Delivery Discrepancy";
                            const discNotes = order.receiverConfirmation.discrepancyNotes || order.receiverConfirmation.notes || "Discrepancy reported during delivery handover";
                            const doNum = order.doNumber || `DO-${order.orderNo}`;

                            let itemSummary = "";
                            if (Array.isArray(order.receiverConfirmation.itemsConfirmed) && order.receiverConfirmation.itemsConfirmed.length > 0) {
                                itemSummary = order.receiverConfirmation.itemsConfirmed
                                    .map(i => `- ${i.name}: Ordered ${i.orderedQuantity}, Received ${i.receivedQuantity} (Diff: ${i.discrepancy || (Number(i.receivedQuantity) - Number(i.orderedQuantity))})`)
                                    .join("\n");
                            }

                            const newIssue = new Issue({
                                title: `Delivery Discrepancy: Order #${order.orderNo} (${discType})`,
                                category: "Delivery Discrepancy",
                                priority: "High",
                                description: `Recipient: ${order.receiverConfirmation.franchise || order.recipientName || 'Recipient'}\nDO: ${doNum}\nDiscrepancy Type: ${discType}\nReceiver: ${order.receiverConfirmation.receiverName} (${order.receiverConfirmation.receiverPhone || 'N/A'})\nDiscrepancy Remarks:\n${discNotes}\n\nItem Checklist Breakdown:\n${itemSummary || 'Refer to DO for item details.'}`,
                                deliveryOrderId: order._id,
                                doNumber: doNum,
                                status: "Pending",
                                reportedBy: req.user ? req.user._id : order._id,
                                reporterName: req.user ? (req.user.name || req.user.username) : "Authorized Receiver",
                                reporterEmail: req.user ? (req.user.email || req.user.phone) : "",
                                reporterRole: req.user ? req.user.role : "Staff",
                                restaurantName: order.companySlug || "Central Kitchen"
                            });
                            await newIssue.save();
                            order.receiverConfirmation.issueId = newIssue._id;
                        } catch (issueErr) {
                            console.error("Discrepancy issue creation failed in orderController:", issueErr);
                        }
                    }
                }
                const actor = req.user ? (req.user.name || req.user.username) : "Kitchen Staff";
                await deductDeliveryOrderInventory(order, actor);
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
                order.inventoryDeducted = false;
            }
            if (status === "RETURN_INITIATED") {
                const actor = req.user ? (req.user.name || req.user.username) : "Kitchen Staff";
                if (prevStatus !== "RETURN_INITIATED" && prevStatus !== "Returned") {
                    await restockCancelledOrderItems(order, actor, "Order Return Restock");
                }
                if (req.body.returnReason) order.returnReason = req.body.returnReason;
                if (req.body.returnNotes) order.returnNotes = req.body.returnNotes;
                if (req.body.returnedBy) order.returnedBy = req.body.returnedBy;
                if (req.body.returnedAt) order.returnedAt = req.body.returnedAt || new Date();
            }
            if (status === "Returned") {
                const actor = req.user ? (req.user.name || req.user.username) : "Kitchen Staff";
                if (prevStatus !== "RETURN_INITIATED" && prevStatus !== "Returned") {
                    await restockCancelledOrderItems(order, actor, "Order Return Restock");
                }
                order.paymentStatus = "Refunded";
                order.inventoryDeducted = false;
                if (req.body.returnReason) order.returnReason = req.body.returnReason;
                if (req.body.returnType || req.body.refundMethod) order.returnType = req.body.returnType || req.body.refundMethod;
                if (req.body.returnNotes || req.body.refundNotes) order.returnNotes = req.body.refundNotes || req.body.returnNotes;
                if (req.body.returnedBy || req.body.refundProcessedBy) order.returnedBy = req.body.refundProcessedBy || req.body.returnedBy;
                if (req.body.returnedAt || req.body.refundProcessedAt) order.returnedAt = req.body.refundProcessedAt || req.body.returnedAt || new Date();
            }
        }

        const actorName = req.user ? (req.user.name || req.user.username) : "Kitchen Staff";
        const finalNotes = notes || (status === "Cancelled" ? (req.body.cancellationReason || req.body.cancelReason || "") : "");

        // Step 6: Apply Automatic GPS Capture, Raw Event Timestamps, and Calculate Travel Duration
        const newTimelineEvent = applyDeliveryAudit({
            order,
            targetStatus: status || order.deliveryStatus,
            actorName,
            location: req.body.location,
            signature: req.body.signature,
            notes: finalNotes || ""
        });
        order.timeline.push(newTimelineEvent);

        order.updatedBy = actorName;
        await order.save();

        // Step 6: Synchronize batch total duration if this order belongs to a batch
        try {
            await syncBatchDeliveryAudit(order, Order);
        } catch (batchErr) {
            console.error("Batch delivery duration sync failed:", batchErr);
        }

        if (status === "Returned") {
            await syncRefundToCreditor(order, actorName, req.body);
            await syncRefundExpense(order, actorName, req.body);
        }

        // DeliGati Internal Dispatch Notifications for status transitions (Only ORDER_REJECTED & DELIVERED)
        try {
            const normUpper = String(status || "").toUpperCase().replace(/[\s\/\-]+/g, "_");
            const isDeliveredStatus = (normUpper === "DELIVERED" || status === "Delivered") && !normUpper.includes("OUT_FOR_DELIVERY");

            if (normUpper.includes("CANCEL") || normUpper.includes("REJECT")) {
                sendDispatchNotification({
                    event: DISPATCH_EVENTS.ORDER_REJECTED,
                    order,
                    actor: req.user,
                    extra: { reason: order.cancellationReason || finalNotes }
                }).catch(err => console.error("Notification error on ORDER_REJECTED:", err));
            } else if (isDeliveredStatus) {
                sendDispatchNotification({
                    event: DISPATCH_EVENTS.DELIVERED,
                    order,
                    actor: req.user
                }).catch(err => console.error("Notification error on DELIVERED:", err));
            }
        } catch (notifErr) {
            console.error("Error dispatching notification:", notifErr);
        }

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
        const { staffId, vehicleNo } = req.body;

        const order = await Order.findById(id);
        if (!order || order.isDeleted) {
            return res.status(404).json({ success: false, message: "Delivery order not found" });
        }
        const normStatus = String(order.deliveryStatus || "").toUpperCase().replace(/[\s\/-]+/g, "_");
        const allowedStatuses = ["PENDING_APPROVAL", "CREATED", "APPROVED", "PREPARING", "READY_FOR_DISPATCH", "ASSIGNED"];
        if (!allowedStatuses.includes(normStatus)) {
            return res.status(400).json({ success: false, message: "Rider assignment can only be added or changed when order status is up to Ready for Dispatch." });
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

        if (vehicleNo !== undefined) {
            order.vehicleNo = (vehicleNo || "").trim();
        }

        const actorName = req.user ? (req.user.name || req.user.username) : "Kitchen Staff";

        // Auto move status to Out for Delivery if currently Ready for Dispatch, Created, APPROVED, or Preparing
        if (["Created", "Ready for Dispatch", "Preparing", "APPROVED"].includes(order.deliveryStatus)) {
            order.deliveryStatus = "Ready for Dispatch"; if (order.status) { order.status = "Ready for Dispatch"; }
        }

        order.timeline.push({
            action: `Rider ${staff.name} Assigned`,
            status: order.deliveryStatus,
            timestamp: new Date(),
            user: actorName,
            notes: `Rider Phone: ${staff.phone || 'N/A'}${order.vehicleNo ? ` | Vehicle: ${order.vehicleNo}` : ''}`
        });

        order.updatedBy = actorName;
        await order.save();

        // RIDER_ASSIGNED notification muted per streamlined notification policy

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
            const isReturningFromDelivered = (prevStatus === "Delivered" || prevStatus === "DELIVERED") && (newStatus === "RETURN_INITIATED" || newStatus === "Returned");
            if (["Delivered", "DELIVERED", "Cancelled", "CANCELLED"].includes(prevStatus) && newStatus !== prevStatus && !isReturningFromDelivered) {
                return res.status(400).json({
                    success: false,
                    message: `Order status is locked (${prevStatus}) and cannot be modified.`
                });
            }
            if ((newStatus === "Cancelled" || newStatus === "CANCELLED") && prevStatus !== "Cancelled" && prevStatus !== "CANCELLED") {
                await restockCancelledOrderItems(order, actorName, "Order Cancelled Restock");
            }
            if (newStatus === "RETURN_INITIATED") {
                if (prevStatus !== "RETURN_INITIATED" && prevStatus !== "Returned") {
                    await restockCancelledOrderItems(order, actorName, "Order Return Restock");
                }
                if (updates.returnReason) order.returnReason = updates.returnReason;
                if (updates.returnNotes) order.returnNotes = updates.returnNotes;
                if (updates.returnedBy) order.returnedBy = updates.returnedBy;
                if (updates.returnedAt) order.returnedAt = updates.returnedAt || new Date();
            }
            if (newStatus === "Returned") {
                if (prevStatus !== "RETURN_INITIATED" && prevStatus !== "Returned") {
                    await restockCancelledOrderItems(order, actorName, "Order Return Restock");
                }
                order.paymentStatus = "Refunded";
                if (updates.returnReason) order.returnReason = updates.returnReason;
                if (updates.returnType || updates.refundMethod) order.returnType = updates.returnType || updates.refundMethod;
                if (updates.returnNotes || updates.refundNotes) order.returnNotes = updates.refundNotes || updates.returnNotes;
                if (updates.returnedBy || updates.refundProcessedBy) order.returnedBy = updates.refundProcessedBy || updates.returnedBy;
                if (updates.returnedAt || updates.refundProcessedAt) order.returnedAt = updates.refundProcessedAt || updates.returnedAt || new Date();
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
        if (updates.deliveryBatch !== undefined) order.deliveryBatch = updates.deliveryBatch;
        if (updates.sourceWarehouse !== undefined) order.sourceWarehouse = updates.sourceWarehouse;
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

        if (updates.deliveryStatus === "Returned" || updates.returnType || updates.refundMethod) {
            await syncRefundToCreditor(order, actorName, updates);
            await syncRefundExpense(order, actorName, updates);
        }

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


/**
 * Update Delivery Payment Received status (for completed Cash / QR delivery orders)
 * If received === true:
 *   - Marks paymentStatus = "Paid", paymentReceived = true, records timestamp and actor.
 *   - If previously added to Creditor Ledger, settles / records payment in Creditor creditHistory and reduces balance.
 * If received === false (Payment Not Received):
 *   - Marks paymentStatus = "Credit", paymentReceived = false, addedToCreditorAt = now.
 *   - Adds outstanding totalAmount to recipient's Creditor Ledger (matching by phone/name in tenant, or creating a new Creditor profile).
 */
const updateOrderPaymentReceived = async (req, res, next) => {
    try {
        const { id } = req.params;
        const targetSlug = req.body.companySlug || req.headers["x-company-slug"] || req.user?.companySlug;
        const actorName = req.user?.name || req.user?.email || req.body.user || "System";
        const { received, note, remarks } = req.body;
        const auditNote = String(note || remarks || "").trim();

        const filter = { _id: id, isDeleted: { $ne: true } };
        if (targetSlug && targetSlug !== "all") {
            filter.companySlug = targetSlug;
        }

        const order = await Order.findOne(filter);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Delivery order not found."
            });
        }

        const isDelivered = String(order.deliveryStatus || "").toLowerCase() === "delivered";
        if (!isDelivered) {
            return res.status(400).json({
                success: false,
                message: "Payment receipt can only be confirmed or defined after the delivery is completed."
            });
        }

        const orderAmount = Number(order.totalAmount || order.total || 0);

        // Find matched creditor if exists
        const phoneClean = order.recipientPhone ? String(order.recipientPhone).trim() : "";
        const nameClean = order.recipientName ? String(order.recipientName).trim() : "";
        const creditorFilter = {
            isDeleted: { $ne: true },
            $or: [
                { companySlug: order.companySlug },
                { companySlug: { $exists: false } },
                { companySlug: null }
            ]
        };

        let creditor = null;
        if (order.creditorId) {
            creditor = await Creditor.findById(order.creditorId);
        }
        if (!creditor && phoneClean) {
            creditor = await Creditor.findOne({
                ...creditorFilter,
                phone: { $regex: new RegExp("^" + escapeRegex(phoneClean) + "$", "i") }
            });
        }
        if (!creditor && nameClean) {
            creditor = await Creditor.findOne({
                ...creditorFilter,
                name: { $regex: new RegExp("^" + escapeRegex(nameClean) + "$", "i") }
            });
        }

        if (received) {
            // Case 1: Payment Received
            order.paymentReceived = true;
            order.paymentStatus = "Paid";
            order.paymentReceivedAt = new Date();
            order.paymentReceivedBy = actorName;
            order.paymentNotes = auditNote;

            // If it was previously added to Creditor Ledger, settle the credit balance
            if (creditor && order.addedToCreditorAt && orderAmount > 0) {
                if (!Array.isArray(creditor.creditHistory)) creditor.creditHistory = [];
                creditor.creditHistory.push({
                    type: "payment",
                    amount: orderAmount,
                    orderId: order._id,
                    orderNo: order.orderNo,
                    note: auditNote ? `Settlement: Cash/QR Payment Received for Order #${order.orderNo} (${auditNote})` : `Settlement: Cash/QR Payment Received for Delivered Order #${order.orderNo}`,
                    timestamp: new Date()
                });
                creditor.currentBalance = Math.max(0, Number(((Number(creditor.currentBalance) || 0) - orderAmount).toFixed(2)));
                creditor.updatedBy = actorName;
                creditor.updatedOn = new Date();
                await creditor.save();
            }
            order.addedToCreditorAt = null;

            if (!Array.isArray(order.timeline)) order.timeline = [];
            order.timeline.push({
                action: "Payment Received",
                status: order.deliveryStatus,
                eventType: "PAYMENT_RECEIVED",
                timestamp: new Date(),
                user: actorName,
                companySlug: order.companySlug || "",
                orderId: order._id,
                orderNo: order.orderNo,
                notes: auditNote ? `Cash/QR payment of Rs. ${orderAmount.toLocaleString("en-IN")} confirmed as received. Note: ${auditNote}` : `Cash/QR payment of Rs. ${orderAmount.toLocaleString("en-IN")} confirmed as received.`
            });
        } else {
            // Case 2: Payment NOT Received -> Add to Creditor Ledger
            order.paymentReceived = false;
            order.paymentStatus = "Credit";
            order.addedToCreditorAt = new Date();
            order.paymentReceivedBy = actorName;
            order.paymentNotes = auditNote;

            if (orderAmount > 0) {
                if (creditor) {
                    if (!Array.isArray(creditor.creditHistory)) creditor.creditHistory = [];
                    const alreadyCredited = creditor.creditHistory.some(
                        h => h.orderId && String(h.orderId) === String(order._id) && h.type === "credit"
                    );
                    if (!alreadyCredited) {
                        creditor.creditHistory.push({
                            type: "credit",
                            amount: orderAmount,
                            orderId: order._id,
                            orderNo: order.orderNo,
                            note: auditNote ? `Delivered Cash/QR Payment Not Received for Order #${order.orderNo} - Booked to Credit (${auditNote})` : `Delivered Cash/QR Payment Not Received for Order #${order.orderNo} - Booked to Credit`,
                            timestamp: new Date()
                        });
                        creditor.currentBalance = Number(((Number(creditor.currentBalance) || 0) + orderAmount).toFixed(2));
                        creditor.updatedBy = actorName;
                        creditor.updatedOn = new Date();
                        await creditor.save();
                    }
                    order.creditorId = creditor._id;
                } else {
                    // Create new Creditor profile for this customer
                    const newCreditor = new Creditor({
                        companySlug: order.companySlug,
                        name: order.recipientName || "Delivery Customer",
                        phone: phoneClean || "9800000000",
                        address: order.deliveryAddress || "Kathmandu",
                        creditLimit: 10000,
                        currentBalance: orderAmount,
                        creditHistory: [{
                            type: "credit",
                            amount: orderAmount,
                            orderId: order._id,
                            orderNo: order.orderNo,
                            note: auditNote ? `Delivered Cash/QR Payment Not Received for Order #${order.orderNo} - Booked to Credit (${auditNote})` : `Delivered Cash/QR Payment Not Received for Order #${order.orderNo} - Booked to Credit`,
                            timestamp: new Date()
                        }],
                        createdBy: actorName,
                        createdOn: new Date()
                    });
                    await newCreditor.save();
                    order.creditorId = newCreditor._id;
                }
            }

            if (!Array.isArray(order.timeline)) order.timeline = [];
            order.timeline.push({
                action: "Payment Not Received (Creditor Ledger)",
                status: order.deliveryStatus,
                eventType: "PAYMENT_NOT_RECEIVED",
                timestamp: new Date(),
                user: actorName,
                companySlug: order.companySlug || "",
                orderId: order._id,
                orderNo: order.orderNo,
                notes: auditNote ? `Cash/QR payment of Rs. ${orderAmount.toLocaleString("en-IN")} not received upon delivery handover. Added to Creditor Ledger. Note: ${auditNote}` : `Cash/QR payment of Rs. ${orderAmount.toLocaleString("en-IN")} not received upon delivery handover. Added to Creditor Ledger.`
            });
        }

        await order.save();

        res.status(200).json({
            success: true,
            message: received
                ? "Payment marked as received successfully."
                : "Payment marked as not received and added to Creditor Ledger successfully.",
            data: order
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createDeliveryOrder,
    getDeliveryOrders,
    updateDeliveryStatus,
    assignRider,
    updateDeliveryOrder,
    deleteDeliveryOrder,
    updateOrderPaymentReceived
};
