const Notification = require("../../models/notification/notificationModel");
const Creditor = require("../../models/creditor/creditorModel");
const RestaurantConfig = require("../../models/restaurant/restaurantModel");
const createError = require("http-errors");

const getNotifications = async (req, res, next) => {
    try {
        await Notification.deleteMany({ type: { $in: ["order", "assistance"] } });
        const config = await RestaurantConfig.findOne();
        if (config && config.creditEnabled && config.creditOverdueNotificationEnabled) {
            const creditors = await Creditor.find({ isDeleted: { $ne: true }, currentBalance: { $gt: 0 } });
            
            for (const creditor of creditors) {
                let oldestTimestamp = creditor.createdAt;
                if (creditor.creditHistory && creditor.creditHistory.length > 0) {
                    const creditTx = creditor.creditHistory
                        .filter(h => h.type === "credit")
                        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                    if (creditTx.length > 0) {
                        oldestTimestamp = creditTx[0].timestamp;
                    }
                }
                
                const ageInDays = (new Date() - new Date(oldestTimestamp)) / (1000 * 60 * 60 * 24);
                const limitDays = config.creditOverdueDays || 20;
                
                if (ageInDays > limitDays) {
                    const existingNotif = await Notification.findOne({
                        type: "credit",
                        targetId: creditor._id.toString()
                    });
                    
                    if (!existingNotif) {
                        await Notification.create({
                            type: "credit",
                            title: "Overdue Credit Alert",
                            message: `Creditor ${creditor.name} (Phone: ${creditor.phone}) has exceeded the credit overdue limit of ${limitDays} days. Unpaid balance is रु ${creditor.currentBalance.toLocaleString('en-IN')}.`,
                            targetId: creditor._id.toString(),
                            isRead: false
                        });
                    }
                }
            }
            
            const creditNotifications = await Notification.find({ type: "credit" });
            for (const notif of creditNotifications) {
                const creditor = await Creditor.findOne({ _id: notif.targetId, isDeleted: { $ne: true } });
                if (!creditor || creditor.currentBalance <= 0) {
                    await Notification.findByIdAndDelete(notif._id);
                } else {
                    let oldestTimestamp = creditor.createdAt;
                    if (creditor.creditHistory && creditor.creditHistory.length > 0) {
                        const creditTx = creditor.creditHistory
                            .filter(h => h.type === "credit")
                            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                        if (creditTx.length > 0) {
                            oldestTimestamp = creditTx[0].timestamp;
                        }
                    }
                    const ageInDays = (new Date() - new Date(oldestTimestamp)) / (1000 * 60 * 60 * 24);
                    const limitDays = config.creditOverdueDays || 20;
                    if (ageInDays <= limitDays) {
                        await Notification.findByIdAndDelete(notif._id);
                    }
                }
            }
        }

        // Scan for Cheques due for clearing
        const Expense = require("../../models/expense/expenseModel");
        const Purchase = require("../../models/vendor/purchaseModel");

        if (config && config.chequeNotificationEnabled) {
            const limitDays = config.chequeDueDaysNotify !== undefined ? config.chequeDueDaysNotify : 2;

            const chequeExpenses = await Expense.find({ method: "Cheque", chequeDate: { $exists: true, $ne: null } });
            for (const expense of chequeExpenses) {
                const diffTime = new Date(expense.chequeDate) - new Date();
                const diffDays = diffTime / (1000 * 60 * 60 * 24);

                if (diffDays <= limitDays) {
                    const vendorId = expense.vendor ? expense.vendor.toString() : expense._id.toString();
                    const chequeDateStr = new Date(expense.chequeDate).toLocaleDateString();
                    const message = `Cheque payment of रु ${expense.amount.toLocaleString('en-IN')} is due for clearing on ${chequeDateStr}. Description: ${expense.description}.`;

                    const existingNotif = await Notification.findOne({
                        type: "cheque",
                        targetId: vendorId,
                        message
                    });

                    if (!existingNotif) {
                        await Notification.create({
                            type: "cheque",
                            title: "Cheque Clearing Alert",
                            message,
                            targetId: vendorId,
                            isRead: false
                        });
                    }
                }
            }

            const chequePurchases = await Purchase.find({ paymentMethod: "Cheque", chequeDate: { $exists: true, $ne: null } }).populate("vendor");
            for (const purchase of chequePurchases) {
                const diffTime = new Date(purchase.chequeDate) - new Date();
                const diffDays = diffTime / (1000 * 60 * 60 * 24);

                if (diffDays <= limitDays) {
                    const vendorId = purchase.vendor ? (purchase.vendor._id || purchase.vendor).toString() : purchase._id.toString();
                    const chequeDateStr = new Date(purchase.chequeDate).toLocaleDateString();
                    const vendorName = purchase.vendor ? purchase.vendor.name : "Unknown Vendor";
                    const message = `Cheque payment of रु ${purchase.paidAmount.toLocaleString('en-IN')} to Vendor ${vendorName} is due for clearing on ${chequeDateStr}.`;

                    const existingNotif = await Notification.findOne({
                        type: "cheque",
                        targetId: vendorId,
                        message
                    });

                    if (!existingNotif) {
                        await Notification.create({
                            type: "cheque",
                            title: "Cheque Clearing Alert",
                            message,
                            targetId: vendorId,
                            isRead: false
                        });
                    }
                }
            }
        } else {
            // Remove cheque notifications if disabled
            await Notification.deleteMany({ type: "cheque" });
        }

        // Scan for Inventory Low Stock Alerts
        const Inventory = require("../../models/inventory/inventoryModel");
        if (config && config.lowStockNotificationEnabled) {
            const inventoryItems = await Inventory.find({ isDeleted: { $ne: true } }).select("name currentStock lowStockThreshold unit");
            for (const item of inventoryItems) {
                if (item.lowStockThreshold !== null && item.lowStockThreshold !== undefined) {
                    const targetId = `inventory_${item._id.toString()}`;
                    if (item.currentStock <= item.lowStockThreshold) {
                        const existingNotif = await Notification.findOne({
                            type: "inventory",
                            targetId
                        });
                        if (!existingNotif) {
                            await Notification.create({
                                type: "inventory",
                                title: "Low Stock Alert",
                                message: `${item.name} is low on stock. Current: ${item.currentStock} ${item.unit || ''}, Threshold: ${item.lowStockThreshold} ${item.unit || ''}.`,
                                targetId,
                                isRead: false
                            });
                        }
                    } else {
                        // Stock was replenished, auto-delete the low stock notification
                        await Notification.findOneAndDelete({
                            type: "inventory",
                            targetId
                        });
                    }
                }
            }
        } else {
            // Remove low stock alerts if notification is disabled
            await Notification.deleteMany({ type: "inventory" });
        }
        
        const RolePermission = require("../../models/superadmin/rolePermissionModel");
        const companySlug = req.user?.companySlug || req.query.companySlug;
        const query = {};
        if (companySlug && req.user?.role?.toLowerCase() !== "superadmin") {
            query.companySlug = companySlug;
        }

        const notifications = await Notification.find(query)
            .sort({ createdAt: -1 });

        const userRole = (req.user?.role || "").trim();
        const userId = req.user?._id || req.user?.id;
        
        // Superadmin is not notified of operational notifications
        if (userRole.toLowerCase() === "superadmin") {
            return res.status(200).json({
                success: true,
                message: "Notifications retrieved successfully",
                data: []
            });
        }

        const creditRoles = config?.creditOverdueNotifyRoles || ["Admin", "Cashier"];
        const isCreditAllowed = creditRoles.some(r => r.toLowerCase() === userRole.toLowerCase());

        const chequeRoles = config?.chequeNotifyRoles || ["Admin", "Cashier"];
        const isChequeAllowed = chequeRoles.some(r => r.toLowerCase() === userRole.toLowerCase());

        const lowStockRoles = config?.lowStockNotifyRoles || ["Admin", "Cashier"];
        const isLowStockAllowed = lowStockRoles.some(r => r.toLowerCase() === userRole.toLowerCase());

        // Dynamic dispatch & order roles check
        const dispatchRoles = [
            "Admin", "Manager", "Company Manager", "Warehouse", "Warehouse Staff",
            "Dispatch", "Dispatch Staff", "Central Kitchen", "Kitchen Staff",
            "Importer", "Sales", "Regional", "Regional Manager",
            "Franchise", "Franchise User", "Franchise Manager"
        ];
        const isDispatchRole = dispatchRoles.some(r => r.toLowerCase() === userRole.toLowerCase());

        // Check RBAC permission for deliveries
        let hasDeliveriesMenu = false;
        if (companySlug && userRole) {
            const escapedUserRole = userRole.replace(/[.*+?^${}()|[\]\\]/g, "\\const notifications = await Notification.find({})
            .sort({ createdAt: -1 });

        const userRole = req.user?.role || "";
        
        // Superadmin is not notified of operational notifications
        if (userRole.toLowerCase() === "superadmin") {
            return res.status(200).json({
                success: true,
                message: "Notifications retrieved successfully",
                data: []
            });
        }

        const creditRoles = config?.creditOverdueNotifyRoles || ["Admin", "Cashier"];
        const isCreditAllowed = creditRoles.some(r => r.toLowerCase() === userRole.toLowerCase());

        const chequeRoles = config?.chequeNotifyRoles || ["Admin", "Cashier"];
        const isChequeAllowed = chequeRoles.some(r => r.toLowerCase() === userRole.toLowerCase());

        const lowStockRoles = config?.lowStockNotifyRoles || ["Admin", "Cashier"];
        const isLowStockAllowed = lowStockRoles.some(r => r.toLowerCase() === userRole.toLowerCase());
        
        let filteredNotifications = notifications;
        if (!isCreditAllowed) {
            filteredNotifications = filteredNotifications.filter(n => n.type !== "credit");
        }
        if (!isChequeAllowed) {
            filteredNotifications = filteredNotifications.filter(n => n.type !== "cheque");
        }
        if (!isLowStockAllowed) {
            filteredNotifications = filteredNotifications.filter(n => n.type !== "inventory");
        }

        res.status(200).json({
            success: true,
            message: "Notifications retrieved successfully",
            data: filteredNotifications
        });");
            const userPermDoc = await RolePermission.findOne({
                companySlug,
                role: { $regex: new RegExp("^" + escapedUserRole + "$", "i") },
                isDeleted: { $ne: true }
            });
            if (userPermDoc) {
                hasDeliveriesMenu = (userPermDoc.allowedMenus || []).includes("deliveries");
            }
        }
        
        let filteredNotifications = notifications.filter(n => {
            if (n.type === "credit") return isCreditAllowed;
            if (n.type === "cheque") return isChequeAllowed;
            if (n.type === "inventory") return isLowStockAllowed;

            if (n.type === "dispatch" || n.type === "order" || n.type === "delivery") {
                // 1. Original Franchise Requester always receives updates on their created order
                if (n.createdByUserId && userId && String(n.createdByUserId) === String(userId)) {
                    return true;
                }
                // 2. Explicit recipient match
                if (Array.isArray(n.recipientUserIds) && userId && n.recipientUserIds.some(id => String(id) === String(userId))) {
                    return true;
                }
                // 3. Admin / Manager always authorized
                if (userRole.toLowerCase() === "admin" || userRole.toLowerCase() === "manager") {
                    return true;
                }
                // 4. Role in allowedRoles or default dispatch roles
                const notifAllowedRoles = (Array.isArray(n.allowedRoles) && n.allowedRoles.length > 0) ? n.allowedRoles : dispatchRoles;
                if (notifAllowedRoles.some(r => r.toLowerCase() === userRole.toLowerCase())) {
                    return true;
                }
                // 5. RBAC permission for deliveries module
                if (hasDeliveriesMenu) {
                    return true;
                }
                return false;
            }

            return true;
        });

        // Compute isRead per user using readBy tracker if present
        const sanitized = filteredNotifications.map(n => {
            const notifObj = n.toObject ? n.toObject() : { ...n };
            if (userId && Array.isArray(n.readBy) && n.readBy.some(r => String(r.userId) === String(userId))) {
                notifObj.isRead = true;
            }
            return notifObj;
        });

        res.status(200).json({
            success: true,
            message: "Notifications retrieved successfully",
            data: sanitized
        });
    } catch (error) {
        next(error);
    }
};

const markRead = async (req, res, next) => {
    try {
        const { id } = req.params;
        const notification = await Notification.findById(id);
        if (!notification) {
            const error = createError(404, "Notification not found");
            return next(error);
        }

        const userId = req.user?._id || req.user?.id;
        notification.isRead = !notification.isRead;
        if (userId) {
            if (!Array.isArray(notification.readBy)) notification.readBy = [];
            const idx = notification.readBy.findIndex(r => String(r.userId) === String(userId));
            if (notification.isRead) {
                if (idx === -1) notification.readBy.push({ userId, readAt: new Date() });
            } else {
                if (idx !== -1) notification.readBy.splice(idx, 1);
            }
        }
        await notification.save();

        res.status(200).json({
            success: true,
            message: `Notification marked as ${notification.isRead ? "read" : "unread"}`,
            data: notification
        });
    } catch (error) {
        next(error);
    }
};

const markAllRead = async (req, res, next) => {
    try {
        const companySlug = req.user?.companySlug || req.query.companySlug;
        const filter = (companySlug && req.user?.role !== "Superadmin") ? { companySlug } : {};
        const userId = req.user?._id || req.user?.id;

        const updateObj = { $set: { isRead: true } };
        if (userId) {
            updateObj.$addToSet = { readBy: { userId, readAt: new Date() } };
        }
        await Notification.updateMany(filter, updateObj);

        res.status(200).json({
            success: true,
            message: "All notifications marked as read"
        });
    } catch (error) {
        next(error);
    }
};

const deleteNotification = async (req, res, next) => {
    try {
        const { id } = req.params;
        const notification = await Notification.findByIdAndDelete(id);
        if (!notification) {
            const error = createError(404, "Notification not found");
            return next(error);
        }

        res.status(200).json({
            success: true,
            message: "Notification deleted successfully"
        });
    } catch (error) {
        next(error);
    }
};

const clearAllNotifications = async (req, res, next) => {
    try {
        await Notification.deleteMany({});

        res.status(200).json({
            success: true,
            message: "All notifications cleared successfully"
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getNotifications,
    markRead,
    markAllRead,
    deleteNotification,
    clearAllNotifications
};
