const Inventory = require("../../models/inventory/inventoryModel");
const Purchase = require("../../models/vendor/purchaseModel");
const Expense = require("../../models/expense/expenseModel");
const createHttpError = require("http-errors");
const mongoose = require("mongoose");

// GET /api/inventory
const getInventoryItems = async (req, res, next) => {
    try {
        const items = await Inventory.find({ isDeleted: { $ne: true } })
            .select("-adjustments")
            .populate("vendor")
            .sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            message: "Inventory items retrieved successfully!",
            data: items
        });
    } catch (error) {
        next(error);
    }
};

// POST /api/inventory
const createInventoryItem = async (req, res, next) => {
    try {
        const { name, unit, currentStock, lowStockThreshold, targetStock, cost, category, vendor, paymentStatus, paymentMethod, paidAmount } = req.body;

        if (!name || !name.trim()) {
            return next(createHttpError(400, "Item name is required!"));
        }
        if (!unit || !unit.trim()) {
            return next(createHttpError(400, "Item unit is required!"));
        }

        // Validate unit choices
        const validUnits = ["kg", "g", "L", "ml", "pcs", "box", "pack"];
        if (!validUnits.includes(unit)) {
            return next(createHttpError(400, "Invalid unit choice!"));
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";

        // Check uniqueness of active items
        const duplicate = await Inventory.findOne({ name, isDeleted: { $ne: true } });
        if (duplicate) {
            return next(createHttpError(400, "Inventory item with this name already exists!"));
        }

        const item = new Inventory({
            name,
            unit,
            currentStock: currentStock !== undefined ? Number(currentStock) : 0,
            lowStockThreshold: (lowStockThreshold !== undefined && lowStockThreshold !== "" && lowStockThreshold !== null) ? Number(lowStockThreshold) : null,
            targetStock: (targetStock !== undefined && targetStock !== "" && targetStock !== null) ? Number(targetStock) : null,
            cost: cost !== undefined ? Number(cost) : 0,
            category: category || "Ingredients",
            vendor: vendor || null,
            createdBy: actorName
        });

        await item.save();

        // Automatically log initial purchase or expense if stock > 0
        if (item.currentStock > 0) {
            const isPaid = paymentStatus === "Paid";
            const isPartial = paymentStatus === "Partial";
            const totalCost = item.currentStock * item.cost;
            let actualPaidAmount = 0;
            if (isPaid) {
                actualPaidAmount = totalCost;
            } else if (isPartial) {
                actualPaidAmount = Math.min(Number(paidAmount) || 0, totalCost);
            }
            
            const resolvedStatus = isPaid ? "Paid" : isPartial ? "Partial" : "Credit";
            const resolvedMethod = (isPaid || isPartial) ? (paymentMethod || "Cash") : "Credit";

            const purchase = new Purchase({
                item: item._id,
                vendor: item.vendor || null,
                quantity: item.currentStock,
                unitCost: item.cost,
                totalCost: totalCost,
                paidAmount: actualPaidAmount,
                paymentStatus: resolvedStatus,
                paymentMethod: resolvedMethod
            });
            await purchase.save();

            // Removed automatic expense creation on purchase as requested to avoid duplicate cash out display
        }

        const populated = await Inventory.findById(item._id).populate("vendor");

        res.status(201).json({
            success: true,
            message: "Inventory item created successfully!",
            data: populated
        });
    } catch (error) {
        next(error);
    }
};

// PUT /api/inventory/:id
const updateInventoryItem = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, unit, currentStock, lowStockThreshold, targetStock, cost, category, vendor, paymentStatus, paymentMethod, paidAmount, chequeDate } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(createHttpError(400, "Invalid item ID!"));
        }

        const item = await Inventory.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!item) {
            return next(createHttpError(404, "Inventory item not found!"));
        }

        // Validate unit if provided
        if (unit) {
            const validUnits = ["kg", "g", "L", "ml", "pcs", "box", "pack"];
            if (!validUnits.includes(unit)) {
                return next(createHttpError(400, "Invalid unit choice!"));
            }
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";

        // Check uniqueness of active items if name changed
        if (name && name.trim().toLowerCase() !== item.name.toLowerCase()) {
            const duplicate = await Inventory.findOne({ name, isDeleted: { $ne: true } });
            if (duplicate) {
                return next(createHttpError(400, "Inventory item with this name already exists!"));
            }
        }

        const prevStock = item.currentStock;
        const prevVendor = item.vendor;

        // Perform updates
        if (name) item.name = name;
        if (unit) item.unit = unit;
        if (currentStock !== undefined) item.currentStock = Number(currentStock);
        if (lowStockThreshold !== undefined) item.lowStockThreshold = (lowStockThreshold === "" || lowStockThreshold === null) ? null : Number(lowStockThreshold);
        if (targetStock !== undefined) item.targetStock = (targetStock === "" || targetStock === null) ? null : Number(targetStock);
        if (cost !== undefined) item.cost = Number(cost);
        if (category) item.category = category;
        if (vendor !== undefined) item.vendor = vendor || null;

        item.updatedBy = actorName;
        item.updatedOn = new Date();

        await item.save();

        const getVendorId = (v) => {
            if (!v) return "";
            if (typeof v === "object" && v._id) return String(v._id);
            return String(v);
        };
        const vendorChanged = getVendorId(item.vendor) !== getVendorId(prevVendor);
        const diff = item.currentStock - prevStock;

        if (vendorChanged) {
            if (item.vendor) {
                // If there were no purchases before, create an initial one
                const existingCount = await Purchase.countDocuments({ item: item._id });
                if (existingCount === 0 && item.currentStock > 0) {
                    const isPaid = paymentStatus === "Paid";
                    const isPartial = paymentStatus === "Partial";
                    const totalCost = item.currentStock * item.cost;
                    let actualPaidAmount = 0;
                    if (isPaid) {
                        actualPaidAmount = totalCost;
                    } else if (isPartial) {
                        actualPaidAmount = Math.min(Number(paidAmount) || 0, totalCost);
                    }
                    const resolvedStatus = isPaid ? "Paid" : isPartial ? "Partial" : "Credit";
                    const resolvedMethod = (isPaid || isPartial) ? (paymentMethod || "Cash") : "Credit";

                    const purchase = new Purchase({
                        item: item._id,
                        vendor: item.vendor,
                        quantity: item.currentStock,
                        unitCost: item.cost,
                        totalCost: totalCost,
                        paidAmount: actualPaidAmount,
                        paymentStatus: resolvedStatus,
                        paymentMethod: resolvedMethod,
                        chequeDate: (resolvedMethod === "Cheque" && chequeDate) ? new Date(chequeDate) : undefined
                    });
                    await purchase.save();

                    // Removed automatic expense creation to avoid duplicate cash out display
                }
            }
        }

        if (diff > 0) {
            const isPaid = paymentStatus === "Paid";
            const isPartial = paymentStatus === "Partial";
            const totalCost = diff * item.cost;
            let actualPaidAmount = 0;
            if (isPaid) {
                actualPaidAmount = totalCost;
            } else if (isPartial) {
                actualPaidAmount = Math.min(Number(paidAmount) || 0, totalCost);
            }
            const resolvedStatus = isPaid ? "Paid" : isPartial ? "Partial" : "Credit";
            const resolvedMethod = (isPaid || isPartial) ? (paymentMethod || "Cash") : "Credit";

            const purchase = new Purchase({
                item: item._id,
                vendor: item.vendor || null,
                quantity: diff,
                unitCost: item.cost,
                totalCost: totalCost,
                paidAmount: actualPaidAmount,
                paymentStatus: resolvedStatus,
                paymentMethod: resolvedMethod,
                chequeDate: (resolvedMethod === "Cheque" && chequeDate) ? new Date(chequeDate) : undefined
            });
            await purchase.save();

            // Removed automatic expense creation to avoid duplicate cash out display
        }

        const populated = await Inventory.findById(item._id).populate("vendor");

        res.status(200).json({
            success: true,
            message: "Inventory item updated successfully!",
            data: populated
        });
    } catch (error) {
        next(error);
    }
};

// DELETE /api/inventory/:id
const deleteInventoryItem = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(createHttpError(400, "Invalid item ID!"));
        }

        const item = await Inventory.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!item) {
            return next(createHttpError(404, "Inventory item not found!"));
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";

        item.isDeleted = true;
        item.name = `${item.name}_deleted_${Date.now()}`;
        item.deletedBy = actorName;
        item.deletedOn = new Date();
        item.updatedBy = actorName;
        item.updatedOn = new Date();

        await item.save();

        res.status(200).json({
            success: true,
            message: "Inventory item deleted successfully!"
        });
    } catch (error) {
        next(error);
    }
};

// GET /api/inventory/:id/purchases
const getInventoryPurchases = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(createHttpError(400, "Invalid item ID!"));
        }

        const purchases = await Purchase.find({ item: id })
            .populate("vendor", "name contactNumber")
            .sort({ purchaseDate: -1 });

        res.status(200).json({
            success: true,
            message: "Inventory item purchase history retrieved successfully!",
            data: purchases
        });
    } catch (error) {
        next(error);
    }
};

// POST /api/inventory/:id/deduct
const deductInventoryItem = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { quantity, reason, notes } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(createHttpError(404, "Invalid inventory item ID!"));
        }

        const item = await Inventory.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!item) {
            return next(createHttpError(404, "Inventory item not found!"));
        }

        const deductQty = Number(quantity);
        if (isNaN(deductQty) || deductQty <= 0) {
            return next(createHttpError(400, "Deduct quantity must be a positive number greater than 0!"));
        }

        if (deductQty > item.currentStock) {
            return next(createHttpError(400, `Cannot deduct ${deductQty} ${item.unit}. Only ${item.currentStock} ${item.unit} available in stock!`));
        }

        if (!reason || !reason.trim()) {
            return next(createHttpError(400, "Reason is required for deduction!"));
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";

        const newAdjustment = {
            quantity: deductQty,
            reason: reason.trim(),
            notes: notes ? notes.trim() : "",
            date: new Date(),
            adjustedBy: actorName
        };

        await Inventory.updateOne(
            { _id: id },
            {
                $inc: { currentStock: -deductQty },
                $push: { adjustments: newAdjustment }
            }
        );

        const updatedItem = await Inventory.findById(id).select("-adjustments").populate("vendor");

        res.status(200).json({
            success: true,
            message: `Successfully deducted ${deductQty} ${item.unit} from ${item.name}.`,
            data: updatedItem
        });
    } catch (error) {
        next(error);
    }
};

// GET /api/inventory/:id
const getInventoryItemById = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(createHttpError(400, "Invalid item ID!"));
        }

        const item = await Inventory.findOne({ _id: id, isDeleted: { $ne: true } })
            .populate("vendor");

        if (!item) {
            return next(createHttpError(404, "Inventory item not found!"));
        }

        res.status(200).json({
            success: true,
            message: "Inventory item retrieved successfully!",
            data: item
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getInventoryItems,
    getInventoryItemById,
    createInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    getInventoryPurchases,
    deductInventoryItem
};
