const MenuCategory = require("../../models/menuCategory/menuCategoryModel");
const createHttpError = require("http-errors");
const mongoose = require("mongoose");

// POST /api/menu-category
const addMenuCategory = async (req, res, next) => {
    try {
        const { companySlug, name, description, isActive } = req.body;

        if (!name || !name.trim()) {
            return next(createHttpError(400, "Category name is required!"));
        }

        let targetSlug = companySlug || req.headers["x-company-slug"] || req.query.companySlug || req.user?.companySlug;
        if (!targetSlug || targetSlug === "all") {
            const Company = require("../../models/company/companyModel");
            const firstCompany = await Company.findOne({ isDeleted: { $ne: true } });
            targetSlug = firstCompany ? firstCompany.companySlug : "default-company";
        }

        const dupFilter = {
            name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
            isDeleted: { $ne: true }
        };
        if (targetSlug) dupFilter.companySlug = targetSlug;

        const nameExists = await MenuCategory.findOne(dupFilter);
        if (nameExists) {
            return next(createHttpError(400, `A category named "${name.trim()}" already exists in this company!`));
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
        const category = new MenuCategory({
            companySlug: targetSlug,
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
        const targetSlug = req.query.companySlug || req.headers["x-company-slug"] || req.user?.companySlug;
        const filter = { isDeleted: { $ne: true } };
        if (targetSlug && targetSlug !== "all") {
            filter.companySlug = targetSlug;
        }

        const categories = await MenuCategory.find(filter).sort({ createdAt: 1 });
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
        const { companySlug, name, description, isActive } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(createHttpError(400, "Invalid category ID!"));
        }

        let targetSlug = companySlug || req.headers["x-company-slug"] || req.query.companySlug || req.user?.companySlug;

        const category = await MenuCategory.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!category) {
            return next(createHttpError(404, "Category not found!"));
        }

        const catSlug = category.companySlug || targetSlug;

        // Duplicate name check (exclude self)
        if (name && name.trim().toLowerCase() !== category.name.toLowerCase()) {
            const dupFilter = {
                name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
                _id: { $ne: id },
                isDeleted: { $ne: true }
            };
            if (catSlug) dupFilter.companySlug = catSlug;

            const nameExists = await MenuCategory.findOne(dupFilter);
            if (nameExists) {
                return next(createHttpError(400, `A category named "${name.trim()}" already exists in this company!`));
            }
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";

        if (name !== undefined) category.name = name.trim();
        if (description !== undefined) category.description = description.trim();
        if (isActive !== undefined) category.isActive = isActive;
        if (targetSlug && !category.companySlug) category.companySlug = targetSlug;
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
