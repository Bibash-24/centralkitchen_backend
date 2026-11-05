const MenuItem = require("../../models/menuItem/menuItemModel");
const MenuCategory = require("../../models/menuCategory/menuCategoryModel");
const createHttpError = require("http-errors");
const mongoose = require("mongoose");

// POST /api/menu-item
const addMenuItem = async (req, res, next) => {
    try {
        const { companySlug, name, price, categoryId, isSalesHourItem, startTime, endTime, salePrice, recipe } = req.body;

        if (!name || !name.trim()) {
            return next(createHttpError(400, "Item name is required!"));
        }

        let targetSlug = companySlug || req.headers["x-company-slug"] || req.query.companySlug || req.user?.companySlug;
        if (!targetSlug || targetSlug === "all") {
            const Company = require("../../models/company/companyModel");
            const firstCompany = await Company.findOne({ isDeleted: { $ne: true } });
            targetSlug = firstCompany ? firstCompany.companySlug : "default-company";
        }

        const priceStr = String(price).trim();
        const isValidPrice = /^[0-9/]+$/.test(priceStr) && priceStr.split('/').every(part => !isNaN(part) && Number(part) > 0);
        if (!isValidPrice) {
            return next(createHttpError(400, "A valid price is required (only positive numbers and slashes allowed)!"));
        }
        if (!categoryId || !mongoose.Types.ObjectId.isValid(categoryId)) {
            return next(createHttpError(400, "A valid category is required!"));
        }

        // Make sure category exists and is not deleted
        const category = await MenuCategory.findOne({ _id: categoryId, isDeleted: { $ne: true } });
        if (!category) {
            return next(createHttpError(404, "Category not found!"));
        }

        // Duplicate name check
        const dupFilter = {
            name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
            isDeleted: { $ne: true }
        };
        if (targetSlug) dupFilter.companySlug = targetSlug;

        const nameExists = await MenuItem.findOne(dupFilter);
        if (nameExists) {
            return next(createHttpError(400, `A menu item named "${name.trim()}" already exists in this company!`));
        }

        // Validate promo price
        let validatedSalePrice = null;
        if (isSalesHourItem && salePrice) {
            const salePriceStr = String(salePrice).trim();
            const isValidSalePrice = /^[0-9/]+$/.test(salePriceStr) && salePriceStr.split('/').every(part => !isNaN(part) && Number(part) > 0);
            if (!isValidSalePrice) {
                return next(createHttpError(400, "A valid promotional price is required (only positive numbers and slashes allowed)!"));
            }
            validatedSalePrice = salePriceStr;
        }

        // Validate recipe if provided
        let itemRecipe = [];
        if (recipe !== undefined) {
            if (!Array.isArray(recipe)) {
                return next(createHttpError(400, "Recipe must be an array of ingredient mappings!"));
            }
            for (const ing of recipe) {
                if (!ing.inventoryItem || !mongoose.Types.ObjectId.isValid(ing.inventoryItem)) {
                    return next(createHttpError(400, "Each recipe ingredient must have a valid inventory item ID!"));
                }
                if (ing.ratio === undefined || isNaN(ing.ratio) || Number(ing.ratio) <= 0) {
                    return next(createHttpError(400, "Each recipe ingredient must have a valid ratio greater than 0!"));
                }
            }
            itemRecipe = recipe.map(ing => ({
                inventoryItem: ing.inventoryItem,
                ratio: Number(ing.ratio)
            }));
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";

        const item = new MenuItem({
            companySlug: targetSlug,
            name: name.trim(),
            price: priceStr,
            category: categoryId,
            isSalesHourItem: !!isSalesHourItem,
            startTime: isSalesHourItem ? startTime : null,
            endTime: isSalesHourItem ? endTime : null,
            salePrice: validatedSalePrice,
            recipe: itemRecipe,
            createdBy: actorName
        });

        await item.save();
        await item.populate("category", "name isActive");
        await item.populate("recipe.inventoryItem", "name unit");

        res.status(201).json({
            success: true,
            message: "Menu item created successfully!",
            data: item
        });
    } catch (error) {
        next(error);
    }
};

// GET /api/menu-item
const getMenuItems = async (req, res, next) => {
    try {
        const targetSlug = req.query.companySlug || req.headers["x-company-slug"] || req.user?.companySlug;
        const filter = { isDeleted: { $ne: true } };
        if (targetSlug && targetSlug !== "all") {
            filter.companySlug = targetSlug;
        }

        const items = await MenuItem
            .find(filter)
            .populate("category", "name isActive")
            .populate("recipe.inventoryItem", "name unit")
            .sort({ createdAt: 1 });

        res.status(200).json({
            success: true,
            message: "Menu items retrieved successfully!",
            data: items
        });
    } catch (error) {
        next(error);
    }
};

// PUT /api/menu-item/:id
const updateMenuItem = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { companySlug, name, price, categoryId, isActive, isSalesHourItem, startTime, endTime, salePrice, recipe } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(createHttpError(400, "Invalid item ID!"));
        }

        let targetSlug = companySlug || req.headers["x-company-slug"] || req.query.companySlug || req.user?.companySlug;

        const item = await MenuItem.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!item) {
            return next(createHttpError(404, "Menu item not found!"));
        }

        const itemSlug = item.companySlug || targetSlug;

        // Duplicate name check (exclude self)
        if (name && name.trim().toLowerCase() !== item.name.toLowerCase()) {
            const dupFilter = {
                name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
                _id: { $ne: id },
                isDeleted: { $ne: true }
            };
            if (itemSlug) dupFilter.companySlug = itemSlug;

            const nameExists = await MenuItem.findOne(dupFilter);
            if (nameExists) {
                return next(createHttpError(400, `A menu item named "${name.trim()}" already exists in this company!`));
            }
        }

        if (categoryId) {
            if (!mongoose.Types.ObjectId.isValid(categoryId)) {
                return next(createHttpError(400, "Invalid category ID!"));
            }
            const category = await MenuCategory.findOne({ _id: categoryId, isDeleted: { $ne: true } });
            if (!category) {
                return next(createHttpError(404, "Category not found!"));
            }
            item.category = categoryId;
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
        if (name !== undefined) item.name = name.trim();
        if (price !== undefined) {
            const priceStr = String(price).trim();
            const isValidPrice = /^[0-9/]+$/.test(priceStr) && priceStr.split('/').every(part => !isNaN(part) && Number(part) > 0);
            if (!isValidPrice) {
                return next(createHttpError(400, "A valid price is required (only positive numbers and slashes allowed)!"));
            }
            item.price = priceStr;
        }
        if (isActive !== undefined) item.isActive = isActive;
        
        const validatePromoPrice = (sp) => {
            if (!sp) return null;
            const spStr = String(sp).trim();
            const isValidSp = /^[0-9/]+$/.test(spStr) && spStr.split('/').every(part => !isNaN(part) && Number(part) > 0);
            if (!isValidSp) {
                throw createHttpError(400, "A valid promotional price is required (only positive numbers and slashes allowed)!");
            }
            return spStr;
        };

        if (isSalesHourItem !== undefined) {
            item.isSalesHourItem = !!isSalesHourItem;
            if (item.isSalesHourItem) {
                if (startTime !== undefined) item.startTime = startTime;
                if (endTime !== undefined) item.endTime = endTime;
                if (salePrice !== undefined) {
                    try {
                        item.salePrice = validatePromoPrice(salePrice);
                    } catch (err) {
                        return next(err);
                    }
                }
            } else {
                item.startTime = null;
                item.endTime = null;
                item.salePrice = null;
            }
        } else {
            if (startTime !== undefined) item.startTime = startTime;
            if (endTime !== undefined) item.endTime = endTime;
            if (salePrice !== undefined) {
                try {
                    item.salePrice = item.isSalesHourItem ? validatePromoPrice(salePrice) : null;
                } catch (err) {
                    return next(err);
                }
            }
        }

        if (recipe !== undefined) {
            if (!Array.isArray(recipe)) {
                return next(createHttpError(400, "Recipe must be an array of ingredient mappings!"));
            }
            for (const ing of recipe) {
                if (!ing.inventoryItem || !mongoose.Types.ObjectId.isValid(ing.inventoryItem)) {
                    return next(createHttpError(400, "Each recipe ingredient must have a valid inventory item ID!"));
                }
                if (ing.ratio === undefined || isNaN(ing.ratio) || Number(ing.ratio) <= 0) {
                    return next(createHttpError(400, "Each recipe ingredient must have a valid ratio greater than 0!"));
                }
            }
            item.recipe = recipe.map(ing => ({
                inventoryItem: ing.inventoryItem,
                ratio: Number(ing.ratio)
            }));
        }

        if (targetSlug && !item.companySlug) item.companySlug = targetSlug;
        item.updatedBy = actorName;

        await item.save();
        await item.populate("category", "name isActive");
        await item.populate("recipe.inventoryItem", "name unit");

        res.status(200).json({
            success: true,
            message: "Menu item updated successfully!",
            data: item
        });
    } catch (error) {
        next(error);
    }
};

// DELETE /api/menu-item/:id  (soft delete)
const deleteMenuItem = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(createHttpError(400, "Invalid item ID!"));
        }

        const item = await MenuItem.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!item) {
            return next(createHttpError(404, "Menu item not found!"));
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";

        item.isDeleted = true;
        item.name = `${item.name}_deleted_${Date.now()}`;
        item.deletedBy = actorName;
        item.deletedOn = new Date();
        item.updatedBy = actorName;

        await item.save();

        res.status(200).json({
            success: true,
            message: "Menu item deleted successfully!"
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { addMenuItem, getMenuItems, updateMenuItem, deleteMenuItem };
