const MenuCategory = require("../../models/menuCategory/menuCategoryModel");
const createHttpError = require("http-errors");
const mongoose = require("mongoose");

// POST /api/menu-category
const addMenuCategory = async (req, res, next) => {
    try {
        const { name, description, isActive } = req.body;

        if (!name || !name.trim()) {
            return next(createHttpError(400, "Category name is required!"));
        }

        const nameExists = await MenuCategory.findOne({
            name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
            isDeleted: { $ne: true }
        });
        if (nameExists) {
            return next(createHttpError(400, `A category named "${name.trim()}" already exists!`));
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
        const category = new MenuCategory({
            name: name.trim(),
            description: description ? description.trim() : "",
            isActive: isActive !== undefined ? isActive : true,
            createdBy: actorName
        });

        await category.save();

        res.status(201).json({
            success: true,
            message: "Menu category created successfully!",
            data: category
        });
    } catch (error) {
        next(error);
    }
};

// GET /api/menu-category
const getMenuCategories = async (req, res, next) => {
    try {
        const categories = await MenuCategory.find({ isDeleted: { $ne: true } }).sort({ createdAt: 1 });
        res.status(200).json({
            success: true,
            message: "Menu categories retrieved successfully!",
            data: categories
        });
    } catch (error) {
        next(error);
    }
};

// PUT /api/menu-category/:id
const updateMenuCategory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, description, isActive } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(createHttpError(400, "Invalid category ID!"));
        }

        const category = await MenuCategory.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!category) {
            return next(createHttpError(404, "Category not found!"));
        }

        // Duplicate name check (exclude self)
        if (name && name.trim().toLowerCase() !== category.name.toLowerCase()) {
            const nameExists = await MenuCategory.findOne({
                name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
                _id: { $ne: id },
                isDeleted: { $ne: true }
            });
            if (nameExists) {
                return next(createHttpError(400, `A category named "${name.trim()}" already exists!`));
            }
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";

        if (name !== undefined) category.name = name.trim();
        if (description !== undefined) category.description = description.trim();
        if (isActive !== undefined) category.isActive = isActive;
        category.updatedBy = actorName;

        await category.save();

        res.status(200).json({
            success: true,
            message: "Menu category updated successfully!",
            data: category
        });
    } catch (error) {
        next(error);
    }
};

// DELETE /api/menu-category/:id  (soft delete)
const deleteMenuCategory = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(createHttpError(400, "Invalid category ID!"));
        }

        const category = await MenuCategory.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!category) {
            return next(createHttpError(404, "Category not found!"));
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";

        // Soft delete — rename to release unique index
        category.isDeleted = true;
        category.name = `${category.name}_deleted_${Date.now()}`;
        category.deletedBy = actorName;
        category.deletedOn = new Date();
        category.updatedBy = actorName;

        await category.save();

        res.status(200).json({
            success: true,
            message: "Menu category deleted successfully!"
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    addMenuCategory,
    getMenuCategories,
    updateMenuCategory,
    deleteMenuCategory
};
