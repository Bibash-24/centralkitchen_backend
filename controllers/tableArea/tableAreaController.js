const TableArea = require("../../models/tableArea/tableAreaModel");
const Table = require("../../models/table/tableModel");
const createHttpError = require("http-errors");
const mongoose = require("mongoose");

// Helper function to sync table count and active state inside a Table Area (respecting soft deletes)
const syncTablesForArea = async (areaDocument, actorName) => {
    const areaId = areaDocument._id;
    const areaName = areaDocument.tableArea;
    const targetCount = areaDocument.noOfTables;

    // Enforce area isActive cascade to all non-deleted child tables
    await Table.updateMany({ tableArea: areaId, isDeleted: { $ne: true } }, { isActive: areaDocument.isActive });

    const existingTables = await Table.find({ tableArea: areaId, isDeleted: { $ne: true } });
    const diff = targetCount - existingTables.length;

    if (diff > 0) {
        // Generate new tables
        const namePrefix = areaName === "Sitting" ? "Table " : `${areaName} `;
        let nextNum = 1;
        
        for (let i = 0; i < diff; i++) {
            // Find a unique name (skipping soft-deleted tables)
            let uniqueNameFound = false;
            let candidateName = "";
            while (!uniqueNameFound) {
                candidateName = `${namePrefix}${nextNum}`;
                const exists = await Table.findOne({ tableNo: candidateName, isDeleted: { $ne: true } });
                if (!exists) {
                    uniqueNameFound = true;
                } else {
                    nextNum++;
                }
            }
            
            let defaultSeats = areaDocument.noOfSitting || 4;
            if (areaName.toLowerCase().includes("cabin")) defaultSeats = areaDocument.noOfSitting || 6;
            else if (areaName.toLowerCase().includes("stool")) defaultSeats = areaDocument.noOfSitting || 2;
            
            const newTable = new Table({
                tableNo: candidateName,
                seats: defaultSeats,
                tableArea: areaId,
                status: "Empty",
                isActive: areaDocument.isActive,
                createdBy: actorName || "System"
            });
            await newTable.save();
            nextNum++;
        }
    } else if (diff < 0) {
        // Prune surplus tables (soft delete excess starting from the highest/latest tables)
        const tablesToPrune = await Table.find({ tableArea: areaId, isDeleted: { $ne: true } })
            .sort({ _id: -1 })
            .limit(Math.abs(diff));
        
        for (const t of tablesToPrune) {
            t.isDeleted = true;
            t.tableNo = `${t.tableNo}_deleted_${Date.now()}`;
            t.deletedBy = actorName || "System";
            t.deletedOn = new Date();
            t.updatedBy = actorName || "System";
            t.updatedOn = new Date();
            await t.save();
        }
    }
};

const addTableArea = async (req, res, next) => {
    try {
        const { tableArea, noOfTables, noOfSitting, description, isActive, hourlyRate } = req.body;
        if (!tableArea) {
            const error = createHttpError(400, "Please provide table area!");
            return next(error);
        }
        if (noOfTables === undefined || noOfTables === null) {
            const error = createHttpError(400, "Please provide number of tables!");
            return next(error);
        }
        if (noOfSitting === undefined || noOfSitting === null || isNaN(Number(noOfSitting))) {
            const error = createHttpError(400, "Please provide a valid numeric number of sitting per area!");
            return next(error);
        }

        const isAreaPresent = await TableArea.findOne({ tableArea, isDeleted: { $ne: true } });
        if (isAreaPresent) {
            const error = createHttpError(400, "Table area with this name already exists!");
            return next(error);
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
        const newArea = new TableArea({ 
            tableArea, 
            noOfTables, 
            noOfSitting: Number(noOfSitting),
            description,
            isActive: isActive !== undefined ? isActive : true,
            isDeleted: false,
            hourlyRate: hourlyRate !== undefined ? Number(hourlyRate) : (tableArea.toLowerCase().includes("cabin") ? 250 : 0),
            createdBy: actorName
        });
        await newArea.save();

        // Sync and generate child tables
        await syncTablesForArea(newArea, actorName);

        res.status(201).json({
            success: true,
            message: "Table area added successfully!",
            data: newArea
        });
    } catch (error) {
        next(error);
    }
};

const getTableAreas = async (req, res, next) => {
    try {
        const areas = await TableArea.find({ isDeleted: { $ne: true } }).populate({ 
            path: "tables", 
            match: { isDeleted: { $ne: true } },
            select: "tableNo status seats isActive" 
        });
        res.status(200).json({
            success: true,
            message: "Table areas retrieved successfully!",
            data: areas
        });
    } catch (error) {
        next(error);
    }
};

const getTableAreaById = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            const error = createHttpError(404, "Invalid id!");
            return next(error);
        }

        const area = await TableArea.findOne({ _id: id, isDeleted: { $ne: true } }).populate({ 
            path: "tables", 
            match: { isDeleted: { $ne: true } },
            select: "tableNo status seats isActive" 
        });
        if (!area) {
            const error = createHttpError(404, "Table area not found!");
            return next(error);
        }

        res.status(200).json({
            success: true,
            message: "Table area retrieved successfully!",
            data: area
        });
    } catch (error) {
        next(error);
    }
};

const updateTableArea = async (req, res, next) => {
    try {
        const { tableArea, noOfTables, noOfSitting, description, isActive, hourlyRate } = req.body;
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            const error = createHttpError(404, "Invalid id!");
            return next(error);
        }

        // Validate uniqueness if changing the name
        if (tableArea) {
            const existing = await TableArea.findOne({ tableArea, _id: { $ne: id }, isDeleted: { $ne: true } });
            if (existing) {
                const error = createHttpError(400, "Table area with this name already exists!");
                return next(error);
            }
        }

        const updateObj = {};
        if (tableArea !== undefined) updateObj.tableArea = tableArea;
        if (noOfTables !== undefined) updateObj.noOfTables = noOfTables;
        if (noOfSitting !== undefined) updateObj.noOfSitting = Number(noOfSitting);
        if (description !== undefined) updateObj.description = description;
        if (isActive !== undefined) updateObj.isActive = isActive;
        if (hourlyRate !== undefined) updateObj.hourlyRate = Number(hourlyRate);

        const area = await TableArea.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!area) {
            const error = createHttpError(404, "Table area not found!");
            return next(error);
        }

        if (tableArea !== undefined) area.tableArea = tableArea;
        if (noOfTables !== undefined) area.noOfTables = noOfTables;
        if (noOfSitting !== undefined) area.noOfSitting = Number(noOfSitting);
        if (description !== undefined) area.description = description;
        if (isActive !== undefined) area.isActive = isActive;
        if (hourlyRate !== undefined) area.hourlyRate = Number(hourlyRate);

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
        area.updatedBy = actorName;
        area.updatedOn = new Date();

        await area.save();

        // Sync tables capacity and isActive cascade
        await syncTablesForArea(area, actorName);

        // Fetch again with populated updated child tables
        const updatedArea = await TableArea.findOne({ _id: id, isDeleted: { $ne: true } }).populate({ 
            path: "tables", 
            match: { isDeleted: { $ne: true } },
            select: "tableNo status seats isActive" 
        });

        res.status(200).json({
            success: true,
            message: "Table area updated successfully!",
            data: updatedArea
        });
    } catch (error) {
        next(error);
    }
};

const deleteTableArea = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            const error = createHttpError(404, "Invalid id!");
            return next(error);
        }

        const area = await TableArea.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!area) {
            const error = createHttpError(404, "Table area not found!");
            return next(error);
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
        
        // Rename tableArea key to release the name index, and set isDeleted true
        area.isDeleted = true;
        area.tableArea = `${area.tableArea}_deleted_${Date.now()}`;
        area.deletedBy = actorName;
        area.deletedOn = new Date();
        area.updatedBy = actorName;
        area.updatedOn = new Date();
        await area.save();

        // Cascade soft delete to child tables and release their names
        const childTables = await Table.find({ tableArea: id, isDeleted: { $ne: true } });
        for (const t of childTables) {
            t.isDeleted = true;
            t.tableNo = `${t.tableNo}_deleted_${Date.now()}`;
            t.deletedBy = actorName;
            t.deletedOn = new Date();
            t.updatedBy = actorName;
            t.updatedOn = new Date();
            await t.save();
        }

        res.status(200).json({
            success: true,
            message: "Table area and its associated tables deleted successfully (soft delete)!"
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    addTableArea,
    getTableAreas,
    getTableAreaById,
    updateTableArea,
    deleteTableArea
};
