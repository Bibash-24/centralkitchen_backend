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
        
        const notifications = await Notification.find({})
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

        notification.isRead = !notification.isRead;
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
        await Notification.updateMany({ isRead: false }, { isRead: true });

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
