const DropdownOption = require("../../models/dropdownOption/dropdownOptionModel");
const createHttpError = require("http-errors");

// GET /api/dropdown-options
const getDropdownOptions = async (req, res, next) => {
    try {
        const { usedFor } = req.query;
        const query = { isDeleted: false };
        
        if (usedFor) {
            query.usedFor = usedFor;
        } else {
            query.usedFor = { $nin: ["area_type", "table_area_type"] };
        }

        // Standard users only see active options
        if (!req.user || req.user.role !== "Superadmin") {
            query.isActive = true;
        }

        const options = await DropdownOption.find(query).sort({ createdAt: 1 });

        res.status(200).json({
            success: true,
            message: "Dropdown options retrieved successfully!",
            data: options
        });
    } catch (error) {
        next(error);
    }
};

// POST /api/dropdown-options
const createDropdownOption = async (req, res, next) => {
    try {
        const { name, value, usedFor } = req.body;

        if (!name || !name.trim()) {
            return next(createHttpError(400, "Name is required"));
        }
        if (!value || !value.trim()) {
            return next(createHttpError(400, "Value is required"));
        }
        if (!usedFor || !usedFor.trim()) {
            return next(createHttpError(400, "usedFor classification is required"));
        }

        // Check for duplicates
        const existing = await DropdownOption.findOne({
            value: value.trim(),
            usedFor: usedFor.trim(),
            isDeleted: false
        });

        if (existing) {
            return next(createHttpError(400, "An option with this value already exists for this dropdown"));
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";

        const newOption = new DropdownOption({
            name: name.trim(),
            value: value.trim(),
            usedFor: usedFor.trim(),
            createdBy: actorName
        });

        await newOption.save();

        res.status(201).json({
            success: true,
            message: "Dropdown option created successfully!",
            data: newOption
        });
    } catch (error) {
        next(error);
    }
};

// PUT /api/dropdown-options/:id
const updateDropdownOption = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, value, usedFor, isActive } = req.body;

        const option = await DropdownOption.findOne({ _id: id, isDeleted: false });
        if (!option) {
            return next(createHttpError(404, "Dropdown option not found"));
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";

        if (name !== undefined) option.name = name.trim();
        if (value !== undefined) option.value = value.trim();
        if (usedFor !== undefined) option.usedFor = usedFor.trim();
        if (isActive !== undefined) option.isActive = isActive;
        
        option.updatedBy = actorName;

        await option.save();

        res.status(200).json({
            success: true,
            message: "Dropdown option updated successfully!",
            data: option
        });
    } catch (error) {
        next(error);
    }
};

// DELETE /api/dropdown-options/:id
const deleteDropdownOption = async (req, res, next) => {
    try {
        const { id } = req.params;

        const option = await DropdownOption.findOne({ _id: id, isDeleted: false });
        if (!option) {
            return next(createHttpError(404, "Dropdown option not found"));
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";

        option.isDeleted = true;
        option.isActive = false;
        option.deletedBy = actorName;

        await option.save();

        res.status(200).json({
            success: true,
            message: "Dropdown option soft-deleted successfully!",
            data: option
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getDropdownOptions,
    createDropdownOption,
    updateDropdownOption,
    deleteDropdownOption
};
