const mongoose = require("mongoose");
const Inventory = require("../../models/inventory/inventoryModel");
const MenuItem = require("../../models/menuItem/menuItemModel");

/**
 * Deduct inventory for completed delivery order using the existing Inventory adjustments system.
 * Prevents duplicate deduction via order.inventoryDeducted flag.
 * Links adjustment to Order, Delivery, DO, Batch, and Customer.
 * 
 * @param {Object} order - Persisted Order document
 * @param {string} actorName - Name of the user or rider completing the delivery
 * @returns {Promise<boolean>} - true if deducted, false if skipped
 */
const deductDeliveryOrderInventory = async (order, actorName = "Delivery Handover") => {
    try {
        if (!order || !order.items || !Array.isArray(order.items) || order.items.length === 0) {
            return false;
        }

        // Idempotency: Prevent duplicate inventory deduction
        if (order.inventoryDeducted) {
            return false;
        }

        const companySlug = order.companySlug;
        const confirmedItems = (order.receiverConfirmation && Array.isArray(order.receiverConfirmation.itemsConfirmed) && order.receiverConfirmation.itemsConfirmed.length > 0)
            ? order.receiverConfirmation.itemsConfirmed
            : order.items;

        const doRef = order.doNumber || `DO-${order.orderNo}`;
        const batchRef = order.deliveryBatch || "General Batch";
        const customerRef = order.recipientName || "Franchise Outlet";

        for (const item of confirmedItems) {
            // Deduct based on actual receivedQuantity if confirmed, otherwise ordered quantity
            const qty = Number(item.receivedQuantity !== undefined ? item.receivedQuantity : item.quantity) || 1;
            if (qty <= 0) continue; // If 0 received, skip deduction

            let deducted = false;

            // 1. Try finding MenuItem recipe first (recipe ingredient deduction)
            let menuItem = null;
            if (item.menuItemId && mongoose.Types.ObjectId.isValid(item.menuItemId)) {
                menuItem = await MenuItem.findOne({ _id: item.menuItemId, isDeleted: { $ne: true } });
            }
            if (!menuItem && item.name) {
                const cleanName = item.name.replace(/\s*\([^)]*\)/g, '').trim();
                const escapedName = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                menuItem = await MenuItem.findOne({
                    name: new RegExp('^' + escapedName + '$', "i"),
                    isDeleted: { $ne: true },
                    ...(companySlug ? { companySlug } : {})
                });
            }

            if (menuItem && menuItem.recipe && Array.isArray(menuItem.recipe) && menuItem.recipe.length > 0) {
                for (const ing of menuItem.recipe) {
                    if (ing.inventoryItem) {
                        const ingQty = Number((qty * (Number(ing.ratio) || 1)).toFixed(3));
                        await Inventory.updateOne(
                            { _id: ing.inventoryItem },
                            {
                                $inc: { currentStock: -ingQty },
                                $push: {
                                    adjustments: {
                                        quantity: ingQty,
                                        reason: "Delivery Completed",
                                        notes: `Delivered Order #${order.orderNo} | DO: ${doRef} | Batch: ${batchRef} | Recipient: ${customerRef} (${item.name} x${qty})`,
                                        date: new Date(),
                                        adjustedBy: actorName
                                    }
                                }
                            }
                        );
                    }
                }
                deducted = true;
            }

            // 2. If no recipe ingredient was deducted, find matching Inventory item directly by name/id
            if (!deducted) {
                let invItem = null;
                if (item.menuItemId && mongoose.Types.ObjectId.isValid(item.menuItemId)) {
                    invItem = await Inventory.findOne({ _id: item.menuItemId, isDeleted: { $ne: true } });
                }
                if (!invItem && item.name) {
                    const cleanName = item.name.replace(/\s*\([^)]*\)/g, '').trim();
                    const escapedName = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    invItem = await Inventory.findOne({
                        name: new RegExp('^' + escapedName + '$', "i"),
                        isDeleted: { $ne: true },
                        ...(companySlug ? { companySlug } : {})
                    });
                }

                if (invItem) {
                    await Inventory.updateOne(
                        { _id: invItem._id },
                        {
                            $inc: { currentStock: -qty },
                            $push: {
                                adjustments: {
                                    quantity: qty,
                                    reason: "Delivery Completed",
                                    notes: `Delivered Order #${order.orderNo} | DO: ${doRef} | Batch: ${batchRef} | Recipient: ${customerRef}`,
                                    date: new Date(),
                                    adjustedBy: actorName
                                }
                            }
                        }
                    );
                }
            }
        }

        // Mark as deducted
        order.inventoryDeducted = true;
        order.inventoryDeductedAt = new Date();
        await order.save();
        return true;
    } catch (err) {
        console.error("Error deducting delivery order inventory:", err);
        return false;
    }
};

module.exports = {
    deductDeliveryOrderInventory
};
