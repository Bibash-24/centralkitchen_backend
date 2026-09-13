const Combo = require("../../models/combo/comboModel");
const createHttpError = require("http-errors");
const mongoose = require("mongoose");

// POST /api/combo
const addCombo = async (req, res, next) => {
    try {
        const { name, itemsList, price, original } = req.body;

        if (!name || !name.trim()) {
            return next(createHttpError(400, "Combo name is required!"));
        }
        if (!itemsList || !itemsList.trim()) {
            return next(createHttpError(400, "Bundled items list is required!"));
        }
        if (price === undefined || isNaN(price) || Number(price) < 0) {
            return next(createHttpError(400, "A valid combo price is required!"));
        }
        if (original === undefined || isNaN(original) || Number(original) < 0) {
            return next(createHttpError(400, "A valid original price is required!"));
        }

        // Duplicate name check
        const nameExists = await Combo.findOne({
            name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
            isDeleted: { $ne: true }
        });
        if (nameExists) {
            return next(createHttpError(400, `A combo deal named "${name.trim()}" already exists!`));
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
        const combo = new Combo({
            name: name.trim(),
            itemsList: itemsList.trim(),
            price: Number(price),
            original: Number(original),
            createdBy: actorName
        });

        await combo.save();

        res.status(201).json({
            success: true,
            message: "Combo deal created successfully!",
            data: combo
        });
    } catch (error) {
        next(error);
    }
};

// GET /api/combo
const getCombos = async (req, res, next) => {
    try {
        const combos = await Combo
            .find({ isDeleted: { $ne: true } })
            .sort({ createdAt: 1 });

        res.status(200).json({
            success: true,
            message: "Combo deals retrieved successfully!",
            data: combos
        });
    } catch (error) {
        next(error);
    }
};

// PUT /api/combo/:id
const updateCombo = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, itemsList, price, original, isActive } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(createHttpError(400, "Invalid combo ID!"));
        }

        const combo = await Combo.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!combo) {
            return next(createHttpError(404, "Combo deal not found!"));
        }

        // Duplicate name check
        if (name && name.trim().toLowerCase() !== combo.name.toLowerCase()) {
            const nameExists = await Combo.findOne({
                name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
                _id: { $ne: id },
                isDeleted: { $ne: true }
            });
            if (nameExists) {
                return next(createHttpError(400, `A combo deal named "${name.trim()}" already exists!`));
            }
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
        if (name !== undefined) combo.name = name.trim();
        if (itemsList !== undefined) combo.itemsList = itemsList.trim();
        if (price !== undefined) combo.price = Number(price);
        if (original !== undefined) combo.original = Number(original);
        if (isActive !== undefined) combo.isActive = isActive;
        combo.updatedBy = actorName;
        combo.updatedOn = new Date();

        await combo.save();

        res.status(200).json({
            success: true,
            message: "Combo deal updated successfully!",
            data: combo
        });
    } catch (error) {
        next(error);
    }
};

// DELETE /api/combo/:id (soft delete)
const deleteCombo = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(createHttpError(400, "Invalid combo ID!"));
        }

        const combo = await Combo.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!combo) {
            return next(createHttpError(404, "Combo deal not found!"));
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
        combo.isDeleted = true;
        combo.name = `${combo.name}_deleted_${Date.now()}`;
        combo.deletedBy = actorName;
        combo.deletedOn = new Date();
        combo.updatedBy = actorName;
        combo.updatedOn = new Date();
        await combo.save();

        res.status(200).json({
            success: true,
            message: "Combo deal deleted successfully!"
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { addCombo, getCombos, updateCombo, deleteCombo };
