const Table = require("../../models/table/tableModel");
const TableArea = require("../../models/tableArea/tableAreaModel");
const createHttpError = require("http-errors");
const mongoose = require("mongoose");

const addTable = async (req, res, next) => {
    try {
        const { tableNo, seats, tableArea, status, isActive } = req.body;
        if (!tableNo) {
            const error = createHttpError(400, "Please provide table No!");
            return next(error);
        }
        if (!tableArea) {
            const error = createHttpError(400, "Please provide table area!");
            return next(error);
        }

        const isTablePresent = await Table.findOne({ tableNo, isDeleted: { $ne: true } });
        if (isTablePresent) {
            const error = createHttpError(400, "Table already exists!");
            return next(error);
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
        const newTable = new Table({ 
            tableNo, 
            seats: seats || 4, 
            tableArea,
            status: status || "Empty",
            isActive: isActive !== undefined ? isActive : true,
            isDeleted: false,
            createdBy: actorName
        });
        await newTable.save();
        await newTable.populate("tableArea", "tableArea description isActive _id");

        res.status(201).json({ 
            success: true, 
            message: "Table added successfully!", 
            data: newTable 
        });
    } catch (error) {
        next(error);
    }
};

const getTables = async (req, res, next) => {
    try {
        const tables = await Table.find({ isDeleted: { $ne: true } })
            .populate({
                path: "currentOrder",
                select: "customerDetails orderStatus guestSessionId items bills orderType"
            })
            .populate("tableArea", "tableArea description isActive _id");

        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        res.status(200).json({ 
            success: true, 
            message: "Tables retrieved successfully!", 
            data: tables 
        });
    } catch (error) {
        next(error);
    }
};

const getTableById = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            const error = createHttpError(404, "Invalid id!");
            return next(error);
        }

        const table = await Table.findOne({ _id: id, isDeleted: { $ne: true } }).populate("tableArea", "tableArea description isActive _id");
        if (!table) {
            const error = createHttpError(404, "Table not found!");
            return next(error);
        }

        res.status(200).json({
            success: true,
            message: "Table retrieved successfully!",
            data: table
        });
    } catch (error) {
        next(error);
    }
};

const updateTable = async (req, res, next) => {
    try {
        const { status, orderId, tableNo, seats, tableArea, isActive } = req.body;
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            const error = createHttpError(404, "Invalid id!");
            return next(error);
        }

        // Validate uniqueness if tableNo is changed
        if (tableNo) {
            const existing = await Table.findOne({ tableNo, _id: { $ne: id }, isDeleted: { $ne: true } });
            if (existing) {
                const error = createHttpError(400, "Table name already exists!");
                return next(error);
            }
        }

        const updateData = {};
        if (status !== undefined) updateData.status = status;
        if (orderId !== undefined) updateData.currentOrder = orderId;
        if (tableNo !== undefined) updateData.tableNo = tableNo;
        if (seats !== undefined) updateData.seats = seats;
        if (tableArea !== undefined) updateData.tableArea = tableArea;
        if (isActive !== undefined) updateData.isActive = isActive;

        const table = await Table.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!table) {
            const error = createHttpError(404, "Table not found!");
            return next(error);
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
        table.updatedBy = actorName;
        table.updatedOn = new Date();

        if (status !== undefined) {
            if (status === "Empty" && table.parentTable) {
                table.isDeleted = true;
                table.tableNo = `${table.tableNo}_deleted_${Date.now()}`;
                table.deletedBy = actorName;
                table.deletedOn = new Date();
                table.status = "Empty";
                table.currentOrder = null;
            } else {
                table.status = status;
            }
        }
        if (orderId !== undefined) table.currentOrder = orderId;
        if (tableNo !== undefined) table.tableNo = tableNo;
        if (seats !== undefined) table.seats = seats;
        if (tableArea !== undefined) table.tableArea = tableArea;
        if (isActive !== undefined) table.isActive = isActive;

        await table.save();
        await table.populate("tableArea", "tableArea description isActive _id");

        res.status(200).json({ 
            success: true, 
            message: "Table updated successfully!", 
            data: table 
        });
    } catch (error) {
        next(error);
    }
};

const deleteTable = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            const error = createHttpError(404, "Invalid id!");
            return next(error);
        }

        const table = await Table.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!table) {
            const error = createHttpError(404, "Table not found!");
            return next(error);
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
        // Rename tableNo to release uniqueness index constraint, and set isDeleted true
        table.isDeleted = true;
        table.tableNo = `${table.tableNo}_deleted_${Date.now()}`;
        table.deletedBy = actorName;
        table.deletedOn = new Date();
        table.updatedBy = actorName;
        table.updatedOn = new Date();
        await table.save();

        res.status(200).json({
            success: true,
            message: "Table deleted successfully (soft delete)!"
        });
    } catch (error) {
        next(error);
    }
};

// PATCH /api/table/:id/qr
const saveTableQr = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { qrLink, qrImage } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(createHttpError(400, "Invalid table ID!"));
        }

        if (!qrLink || typeof qrLink !== "string" || !qrLink.trim()) {
            return next(createHttpError(400, "A valid QR code URL/link is required!"));
        }

        const table = await Table.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!table) {
            return next(createHttpError(404, "Table not found!"));
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
        table.qrLink = qrLink.trim();
        if (qrImage) {
            table.qrImage = qrImage.trim();
        }
        table.qrGeneratedAt = new Date();
        table.updatedBy = actorName;
        table.updatedOn = new Date();

        await table.save();
        await table.populate("tableArea", "tableArea description isActive _id");

        res.status(200).json({
            success: true,
            message: "QR code and image saved successfully!",
            data: table
        });
    } catch (error) {
        next(error);
    }
};

const duplicateTable = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            const error = createHttpError(400, "Invalid table ID!");
            return next(error);
        }

        const table = await Table.findOne({ _id: id, isDeleted: { $ne: true } }).populate("tableArea");
        if (!table) {
            const error = createHttpError(404, "Table not found!");
            return next(error);
        }

        const tableAreaObj = table.tableArea;
        if (!tableAreaObj) {
            const error = createHttpError(400, "Table area not configured for this table!");
            return next(error);
        }

        // 1. Role / Permissions check
        const userRole = req.user ? req.user.role : "waiter";
        if (userRole !== "Superadmin" && userRole !== "Admin") {
            const RolePermission = require("../../models/superadmin/rolePermissionModel");
            const perm = await RolePermission.findOne({ role: userRole, isDeleted: { $ne: true } });
            const allowedSubMenus = perm ? perm.allowedSubMenus || [] : [];
            if (!allowedSubMenus.includes("duplicateTable")) {
                const error = createHttpError(403, "You do not have permission to duplicate tables!");
                return next(error);
            }
        }

        // Find parent table ID (in case we clicked a duplicate, find its parent, or use itself)
        const parentId = table.parentTable || table._id;
        const parentTable = table.parentTable ? await Table.findOne({ _id: parentId, isDeleted: { $ne: true } }) : table;

        if (!parentTable) {
            const error = createHttpError(404, "Parent table not found!");
            return next(error);
        }

        // Count all active children sharing this parent
        const childInstances = await Table.find({
            parentTable: parentId,
            isDeleted: { $ne: true }
        }).sort({ sharingNum: 1 });

        const count = 1 + childInstances.length;

        // Perform capacity checks:
        // Admin/Superadmin limit: total instances <= parentTable.seats
        // Waiter/Cashier (system user) limit: total instances <= tableArea.noOfSitting - 1
        const maxInstances = (userRole === "Superadmin" || userRole === "Admin")
            ? (parentTable.seats || 4)
            : (tableAreaObj.noOfSitting ? tableAreaObj.noOfSitting - 1 : 3);

        if (count >= maxInstances) {
            const error = createHttpError(400, `Cannot duplicate further! Seating capacity limit reached (${maxInstances} instances).`);
            return next(error);
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";

        // Find the next sharingNum for children (find the first available number starting from 1)
        const existingSharingNums = childInstances.map(ti => ti.sharingNum).filter(n => n !== null && n !== undefined);
        let nextSharingNum = 1;
        while (existingSharingNums.includes(nextSharingNum)) {
            nextSharingNum++;
        }

        const baseName = parentTable.tableNo.replace(/\s*-\s*Duplicate\s*\d+$/, "");
        const duplicateNo = `${baseName} - Duplicate ${nextSharingNum}`;

        const newTable = new Table({
            tableNo: duplicateNo,
            seats: parentTable.seats,
            tableArea: parentTable.tableArea._id || parentTable.tableArea,
            status: "Empty",
            parentTable: parentTable._id,
            sharingNum: nextSharingNum,
            isActive: true,
            createdBy: actorName
        });

        await newTable.save();
        await newTable.populate("tableArea", "tableArea description isActive _id");

        res.status(201).json({
            success: true,
            message: "Table space duplicated successfully!",
            data: newTable
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { 
    addTable, 
    getTables, 
    updateTable, 
    getTableById,
    deleteTable,
    saveTableQr,
    duplicateTable
};