const Notification = require("../../models/notification/notificationModel");
const Creditor = require("../../models/creditor/creditorModel");
const RestaurantConfig = require("../../models/restaurant/restaurantModel");
const RolePermission = require("../../models/superadmin/rolePermissionModel");
const createError = require("http-errors");

/**
 * Multi-Tenant Isolated Notification Controller
 * Guarantees that:
 * 1. Notifications are strictly managed and segregated by companySlug.
 * 2. Non-superadmin users are restricted to their authenticated user's companySlug.
 * 3. Superadmins manage notifications per-company by specifying companySlug.
 * 4. No company/tenant notification can ever be read, marked, modified, or cleared by another tenant.
 */

const getNotifications = async (req, res, next) => {
    try {
        const userRole = (req.user?.role || "").trim();
        const userId = req.user?._id || req.user?.id;
        const userRoleLower = userRole.toLowerCase();

        // Multi-tenant resolution: Non-superadmin is strictly restricted to req.user.companySlug
        let targetSlug = "";
        if (userRoleLower === "superadmin") {
            targetSlug = String(
                req.query.companySlug ||
                req.headers["x-company-slug"] ||
                req.user?.companySlug ||
                ""
            ).toLowerCase().trim();
        } else {
            targetSlug = String(req.user?.companySlug || "").toLowerCase().trim();
        }

        // If no target company is determined, return empty list
        if (!targetSlug) {
            return res.status(200).json({
                success: true,
                message: "Notifications retrieved successfully",
                data: []
            });
        }

        const escapedSlugRegex = {
            $regex: new RegExp("^" + targetSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i")
        };

        // Fetch company-scoped configuration
        const config = await RestaurantConfig.findOne({ companySlug: escapedSlugRegex });

        // 1. Scan for Credit Overdue (Strictly scoped to targetSlug)
        if (config && config.creditOverdueNotificationEnabled && targetSlug) {
            const creditors = await Creditor.find({ companySlug: escapedSlugRegex, isDeleted: { $ne: true } });
            
            for (const creditor of creditors) {
                if (creditor.currentBalance <= 0) continue;
                
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
                        companySlug: escapedSlugRegex,
                        type: "credit",
                        targetId: creditor._id.toString()
                    });
                    
                    if (!existingNotif) {
                        await Notification.create({
                            companySlug: targetSlug,
                            type: "credit",
                            title: "Overdue Credit Alert",
                            message: `Creditor ${creditor.name} (Phone: ${creditor.phone}) has exceeded the credit overdue limit of ${limitDays} days. Unpaid balance is Rs. ${creditor.currentBalance.toLocaleString("en-IN")}.`,
                            targetId: creditor._id.toString(),
                            isRead: false
                        });
                    }
                }
            }
            
            // Clean up resolved credit notifications strictly for this company
            const creditNotifications = await Notification.find({ companySlug: escapedSlugRegex, type: "credit" });
            for (const notif of creditNotifications) {
                const creditor = await Creditor.findOne({ _id: notif.targetId, companySlug: escapedSlugRegex, isDeleted: { $ne: true } });
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
        } else if (config && config.creditOverdueNotificationEnabled === false && targetSlug) {
            await Notification.deleteMany({ companySlug: escapedSlugRegex, type: "credit" });
        }

        // 2. Scan for Cheques due for clearing (Strictly scoped to targetSlug)
        const Expense = require("../../models/expense/expenseModel");
        if (config && config.chequeNotificationEnabled && targetSlug) {
            const limitDays = config.chequeDueDaysNotify !== undefined ? config.chequeDueDaysNotify : 2;

            const chequeExpenses = await Expense.find({
                companySlug: escapedSlugRegex,
                method: "Cheque",
                chequeDate: { $exists: true, $ne: null }
            });
            for (const expense of chequeExpenses) {
                const diffTime = new Date(expense.chequeDate) - new Date();
                const diffDays = diffTime / (1000 * 60 * 60 * 24);

                if (diffDays <= limitDays) {
                    const vendorId = expense.vendor ? expense.vendor.toString() : expense._id.toString();
                    const chequeDateStr = new Date(expense.chequeDate).toLocaleDateString();
                    const message = `Cheque payment of Rs. ${expense.amount.toLocaleString("en-IN")} is due for clearing on ${chequeDateStr}. Description: ${expense.description}.`;

                    const existingNotif = await Notification.findOne({
                        companySlug: escapedSlugRegex,
                        type: "cheque",
                        targetId: vendorId,
                        message
                    });

                    if (!existingNotif) {
                        await Notification.create({
                            companySlug: targetSlug,
                            type: "cheque",
                            title: "Cheque Clearing Alert",
                            message,
                            targetId: vendorId,
                            isRead: false
                        });
                    }
                }
            }
        } else if (config && config.chequeNotificationEnabled === false && targetSlug) {
            await Notification.deleteMany({ companySlug: escapedSlugRegex, type: "cheque" });
        }

        // 3. Scan for Inventory Low Stock Alerts (Strictly scoped to targetSlug)
        const Inventory = require("../../models/inventory/inventoryModel");
        if (config && config.lowStockNotificationEnabled && targetSlug) {
            const inventoryItems = await Inventory.find({
                companySlug: escapedSlugRegex,
                isDeleted: { $ne: true }
            }).select("name currentStock lowStockThreshold unit companySlug");

            for (const item of inventoryItems) {
                if (item.lowStockThreshold !== null && item.lowStockThreshold !== undefined) {
                    const targetId = `inventory_${item._id.toString()}`;
                    if (item.currentStock <= item.lowStockThreshold) {
                        const existingNotif = await Notification.findOne({
                            companySlug: escapedSlugRegex,
                            type: "inventory",
                            targetId
                        });
                        if (!existingNotif) {
                            await Notification.create({
                                companySlug: targetSlug,
                                type: "inventory",
                                title: "Low Stock Alert",
                                message: `${item.name} is low on stock. Current: ${item.currentStock} ${item.unit || ""}, Threshold: ${item.lowStockThreshold} ${item.unit || ""}.`,
                                targetId,
                                isRead: false
                            });
                        }
                    } else {
                        // Stock was replenished, auto-delete low stock notification for this company
                        await Notification.findOneAndDelete({
                            companySlug: escapedSlugRegex,
                            type: "inventory",
                            targetId
                        });
                    }
                }
            }
        } else if (config && config.lowStockNotificationEnabled === false && targetSlug) {
            await Notification.deleteMany({ companySlug: escapedSlugRegex, type: "inventory" });
        }

        // 4. Multi-Tenant Scoped Notification Query (Guarantees isolation)
        const query = { companySlug: escapedSlugRegex };
        const notifications = await Notification.find(query).sort({ createdAt: -1 });

        // --- Dynamic Setup Configurations (never hardcoded roles) ---
        // A. Credit Overdue: Credit Setup
        const isCreditEnabled = config?.creditEnabled !== false && config?.creditOverdueNotificationEnabled !== false;
        const creditRoles = (config?.creditOverdueNotifyRoles || []).map(r => r.toLowerCase());
        const isCreditAllowed = isCreditEnabled && (userRoleLower === "admin" || creditRoles.includes(userRoleLower));

        // B. Cheque Clearing: Vendor/Cheque Setup
        const isChequeEnabled = config?.chequeNotificationEnabled !== false;
        const chequeRoles = (config?.chequeNotifyRoles || []).map(r => r.toLowerCase());
        const isChequeAllowed = isChequeEnabled && (userRoleLower === "admin" || chequeRoles.includes(userRoleLower));

        // C. Low Stock: Inventory Setup
        const isLowStockEnabled = config?.lowStockNotificationEnabled !== false;
        const lowStockRoles = (config?.lowStockNotifyRoles || []).map(r => r.toLowerCase());
        const isLowStockAllowed = isLowStockEnabled && (userRoleLower === "admin" || lowStockRoles.includes(userRoleLower));

        // D. Dispatch / Delivery: Delivery Setup
        const isDeliveryEnabled = config?.deliveryNotificationEnabled !== false;
        const deliveryRoles = ((config?.notifyRoles || config?.deliveryNotifyRoles) || []).map(r => r.toLowerCase());
        const deliveryUsers = (config?.notifyUsers || []).map(id => String(id));

        // RBAC menu permissions check for deliveries
        let hasDeliveriesMenu = false;
        if (targetSlug && userRole) {
            const userPermDoc = await RolePermission.findOne({
                companySlug: escapedSlugRegex,
                role: { $regex: new RegExp("^" + userRole.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") },
                isDeleted: { $ne: true }
            });
            if (userPermDoc) {
                hasDeliveriesMenu = (userPermDoc.allowedMenus || []).includes("deliveries");
            }
        }

        // Filter notifications dynamically according to setup rules & roles
        const filteredNotifications = notifications.filter(n => {
            if (n.type === "credit") return isCreditAllowed;
            if (n.type === "cheque") return isChequeAllowed;
            if (n.type === "inventory") return isLowStockAllowed;

            if (n.type === "dispatch" || n.type === "order" || n.type === "delivery") {
                // 1. Original Franchise Requester always receives updates on their created order
                if (n.createdByUserId && userId && String(n.createdByUserId) === String(userId)) {
                    return true;
                }
                // 2. Explicit recipient match or configured user in Delivery Setup
                if (userId && (
                    (Array.isArray(n.recipientUserIds) && n.recipientUserIds.some(id => String(id) === String(userId))) ||
                    deliveryUsers.includes(String(userId))
                )) {
                    return true;
                }
                // 3. Admin is always authorized
                if (userRoleLower === "admin") {
                    return true;
                }
                // If delivery notifications are disabled in Delivery Setup, non-admin roles do not receive them
                if (!isDeliveryEnabled) {
                    return false;
                }
                // 4. Role configured in Delivery Setup (or on notification document)
                const notifAllowedRoles = (Array.isArray(n.allowedRoles) && n.allowedRoles.length > 0)
                    ? n.allowedRoles.map(r => r.toLowerCase())
                    : deliveryRoles;
                if (notifAllowedRoles.includes(userRoleLower)) {
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

        // Dynamic tenant prefix resolution for order number ticker
        const getCompanyPrefix = (slug) => {
            if (!slug || typeof slug !== "string") return "DSP";
            const parts = slug.split(/[-_]+/).filter(Boolean);
            const initials = parts.map(part => part.charAt(0).toUpperCase()).join("");
            return initials || "DSP";
        };
        const dynamicPrefix = config?.orderNoPrefix || config?.orderPrefix || config?.prefix || getCompanyPrefix(targetSlug);

        // Compute isRead per user using readBy tracker & enforce dynamic tenant ticker
        const sanitized = filteredNotifications.map(n => {
            const notifObj = n.toObject ? n.toObject() : { ...n };
            if (userId && Array.isArray(n.readBy) && n.readBy.some(r => String(r.userId) === String(userId))) {
                notifObj.isRead = true;
            }

            // Dynamically ensure order number ticker matches tenant prefix
            if (dynamicPrefix && targetSlug && targetSlug.toLowerCase() !== "central-kitchen" && targetSlug.toLowerCase() !== "ck") {
                const tickerRegex = /\b(?:CK|DSP)-(\d+)\b/g;
                if (notifObj.title) notifObj.title = notifObj.title.replace(tickerRegex, dynamicPrefix + "-$1");
                if (notifObj.message) notifObj.message = notifObj.message.replace(tickerRegex, dynamicPrefix + "-$1");
                if (notifObj.orderNo) notifObj.orderNo = notifObj.orderNo.replace(tickerRegex, dynamicPrefix + "-$1");
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
        const userRoleLower = (req.user?.role || "").trim().toLowerCase();

        let targetSlug = "";
        if (userRoleLower === "superadmin") {
            targetSlug = String(
                req.query.companySlug ||
                req.headers["x-company-slug"] ||
                req.user?.companySlug ||
                ""
            ).toLowerCase().trim();
        } else {
            targetSlug = String(req.user?.companySlug || "").toLowerCase().trim();
        }

        const query = { _id: id };
        if (targetSlug) {
            query.companySlug = { $regex: new RegExp("^" + targetSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") };
        } else if (userRoleLower !== "superadmin") {
            return res.status(403).json({ success: false, message: "Unauthorized tenant access." });
        }

        const notification = await Notification.findOne(query);
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
        const userRoleLower = (req.user?.role || "").trim().toLowerCase();

        let targetSlug = "";
        if (userRoleLower === "superadmin") {
            targetSlug = String(
                req.query.companySlug ||
                req.headers["x-company-slug"] ||
                req.user?.companySlug ||
                ""
            ).toLowerCase().trim();
        } else {
            targetSlug = String(req.user?.companySlug || "").toLowerCase().trim();
        }

        if (!targetSlug) {
            return res.status(400).json({ success: false, message: "Company identifier required to mark notifications as read." });
        }

        const filter = {
            companySlug: { $regex: new RegExp("^" + targetSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") }
        };

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
        const userRoleLower = (req.user?.role || "").trim().toLowerCase();

        let targetSlug = "";
        if (userRoleLower === "superadmin") {
            targetSlug = String(
                req.query.companySlug ||
                req.headers["x-company-slug"] ||
                req.user?.companySlug ||
                ""
            ).toLowerCase().trim();
        } else {
            targetSlug = String(req.user?.companySlug || "").toLowerCase().trim();
        }

        const query = { _id: id };
        if (targetSlug) {
            query.companySlug = { $regex: new RegExp("^" + targetSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") };
        } else if (userRoleLower !== "superadmin") {
            return res.status(403).json({ success: false, message: "Unauthorized tenant access." });
        }

        const notification = await Notification.findOneAndDelete(query);
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
        const userRoleLower = (req.user?.role || "").trim().toLowerCase();

        let targetSlug = "";
        if (userRoleLower === "superadmin") {
            targetSlug = String(
                req.query.companySlug ||
                req.headers["x-company-slug"] ||
                req.user?.companySlug ||
                ""
            ).toLowerCase().trim();
        } else {
            targetSlug = String(req.user?.companySlug || "").toLowerCase().trim();
        }

        if (!targetSlug) {
            return res.status(400).json({ success: false, message: "Company identifier required to clear notifications." });
        }

        const filter = {
            companySlug: { $regex: new RegExp("^" + targetSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") }
        };

        await Notification.deleteMany(filter);

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