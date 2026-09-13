const Creditor = require("../../models/creditor/creditorModel");
const RestaurantConfig = require("../../models/restaurant/restaurantModel");
const User = require("../../models/user/userModel");
const Expense = require("../../models/expense/expenseModel");
const bcrypt = require("bcrypt");
const createError = require("http-errors");

const getCreditors = async (req, res, next) => {
    try {
        const creditors = await Creditor.find({ isDeleted: { $ne: true } }).sort({ createdAt: -1 });
        
        res.status(200).json({
            success: true,
            message: "Creditors retrieved successfully",
            data: creditors
        });
    } catch (error) {
        next(error);
    }
};

const createCreditor = async (req, res, next) => {
    try {
        const { name, phone, address, email, creditLimit, existingCreditAmount, currentBalance, openingBalance } = req.body;
        if (!name || !phone || !address) {
            const error = createError(400, "Full Name, Phone Number, and Address are required!");
            return next(error);
        }

        // Phone format validation (Nepal 10 digits starting with 98 or 97)
        if (!/^(98|97)\d{8}$/.test(phone)) {
            const error = createError(400, "Please provide a valid 10-digit contact number starting with 98 or 97!");
            return next(error);
        }

        // Email format validation (optional)
        if (email && !/\S+@\S+\.\S+/.test(email)) {
            const error = createError(400, "Please provide a valid email address!");
            return next(error);
        }

        // Check duplicate full name (case-insensitive)
        const existingByName = await Creditor.findOne({
            isDeleted: { $ne: true },
            name: { $regex: new RegExp(`^${name.trim()}$`, "i") }
        });
        if (existingByName) {
            const error = createError(400, "Creditor with this full name already exists!");
            return next(error);
        }

        // Check duplicate phone
        const existingByPhone = await Creditor.findOne({
            isDeleted: { $ne: true },
            phone
        });
        if (existingByPhone) {
            const error = createError(400, "Creditor with this phone number already exists!");
            return next(error);
        }

        // Check duplicate email
        if (email) {
            const existingByEmail = await Creditor.findOne({
                isDeleted: { $ne: true },
                email
            });
            if (existingByEmail) {
                const error = createError(400, "Creditor with this email address already exists!");
                return next(error);
            }
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
        const initialBalanceRaw = existingCreditAmount !== undefined ? existingCreditAmount : 
                                 currentBalance !== undefined ? currentBalance : 
                                 openingBalance !== undefined ? openingBalance : 0;
        const initialBalance = Number(initialBalanceRaw);
        const validInitialBalance = !isNaN(initialBalance) && initialBalance > 0 ? initialBalance : 0;

        const creditor = new Creditor({
            name,
            phone,
            address,
            email: email || "",
            creditLimit: creditLimit !== undefined && creditLimit !== "" ? Number(creditLimit) : 5000,
            currentBalance: validInitialBalance,
            createdBy: actorName,
            creditHistory: validInitialBalance > 0 ? [
                {
                    type: "credit",
                    amount: validInitialBalance,
                    note: "Opening Balance / Existing Credit Amount",
                    timestamp: new Date()
                }
            ] : []
        });

        await creditor.save();

        res.status(201).json({
            success: true,
            message: "Creditor registered successfully",
            data: creditor
        });
    } catch (error) {
        next(error);
    }
};

const updateCreditor = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, phone, address, email, creditLimit, isBlacklisted, blacklistReason, existingCreditAmount, currentBalance } = req.body;

        if (!name || !phone || !address) {
            const error = createError(400, "Full Name, Phone Number, and Address are required!");
            return next(error);
        }

        // Phone format validation (Nepal 10 digits starting with 98 or 97)
        if (!/^(98|97)\d{8}$/.test(phone)) {
            const error = createError(400, "Please provide a valid 10-digit contact number starting with 98 or 97!");
            return next(error);
        }

        // Email format validation (optional)
        if (email && !/\S+@\S+\.\S+/.test(email)) {
            const error = createError(400, "Please provide a valid email address!");
            return next(error);
        }

        const creditor = await Creditor.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!creditor) {
            const error = createError(404, "Creditor not found!");
            return next(error);
        }

        // Check unique full name constraints excluding current creditor
        const otherByName = await Creditor.findOne({
            _id: { $ne: id },
            isDeleted: { $ne: true },
            name: { $regex: new RegExp(`^${name.trim()}$`, "i") }
        });
        if (otherByName) {
            const error = createError(400, "Creditor with this full name already exists!");
            return next(error);
        }

        // Check unique contact number constraints excluding current creditor
        const otherByPhone = await Creditor.findOne({
            _id: { $ne: id },
            isDeleted: { $ne: true },
            phone
        });
        if (otherByPhone) {
            const error = createError(400, "Creditor with this phone number already exists!");
            return next(error);
        }

        if (email) {
            const otherByEmail = await Creditor.findOne({
                _id: { $ne: id },
                isDeleted: { $ne: true },
                email
            });
            if (otherByEmail) {
                const error = createError(400, "Creditor with this email address already exists!");
                return next(error);
            }
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
        creditor.name = name;
        creditor.phone = phone;
        creditor.address = address;
        creditor.email = email || "";
        if (creditLimit !== undefined && creditLimit !== "") {
            creditor.creditLimit = Number(creditLimit);
        }

        // Update balance / existing credit amount if provided
        const targetBalanceRaw = existingCreditAmount !== undefined ? existingCreditAmount : currentBalance;
        if (targetBalanceRaw !== undefined && targetBalanceRaw !== "") {
            const targetBalance = Number(targetBalanceRaw);
            if (!isNaN(targetBalance) && targetBalance >= 0 && targetBalance !== creditor.currentBalance) {
                const diff = targetBalance - creditor.currentBalance;
                creditor.creditHistory.push({
                    type: diff > 0 ? "credit" : "payment",
                    amount: Math.abs(diff),
                    note: `Manual Balance Adjustment (रु ${creditor.currentBalance.toLocaleString('en-IN')} -> रु ${targetBalance.toLocaleString('en-IN')}) by ${actorName}`,
                    timestamp: new Date()
                });
                creditor.currentBalance = targetBalance;
            }
        }

        if (isBlacklisted !== undefined) {
            creditor.isBlacklisted = isBlacklisted;
            if (isBlacklisted) {
                creditor.blacklistReason = blacklistReason || "Manual blacklist";
            } else {
                creditor.blacklistReason = "";
            }
        }
        creditor.updatedBy = actorName;
        creditor.updatedOn = new Date();

        await creditor.save();

        res.status(200).json({
            success: true,
            message: "Creditor details updated successfully",
            data: creditor
        });
    } catch (error) {
        next(error);
    }
};

const deleteCreditor = async (req, res, next) => {
    try {
        const { id } = req.params;
        const creditor = await Creditor.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!creditor) {
            const error = createError(404, "Creditor not found!");
            return next(error);
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
        const uniqueSuffix = `deleted-${Date.now()}`;
        if (creditor.email) {
            creditor.email = creditor.email.replace("@", `-${uniqueSuffix}@`);
        }
        creditor.phone = `${creditor.phone}-del-${uniqueSuffix}`;
        creditor.isDeleted = true;
        creditor.deletedBy = actorName;
        creditor.deletedOn = new Date();
        creditor.updatedBy = actorName;
        creditor.updatedOn = new Date();

        await creditor.save();

        res.status(200).json({
            success: true,
            message: `Creditor ${creditor.name} has been deleted successfully.`,
            data: { id: creditor._id }
        });
    } catch (error) {
        next(error);
    }
};

const recordPayment = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { amount, note, date } = req.body;

        if (!amount || Number(amount) <= 0) {
            const error = createError(400, "Repayment amount must be greater than 0!");
            return next(error);
        }

        const creditor = await Creditor.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!creditor) {
            const error = createError(404, "Creditor not found!");
            return next(error);
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
        const payVal = Number(amount);
        const newHistoryEntry = {
            type: "payment",
            amount: payVal,
            note: note || "Manual Repayment",
            timestamp: date ? new Date(date) : new Date()
        };
        const finalBalance = Math.max(0, Number((creditor.currentBalance - payVal).toFixed(2)));

        await Creditor.updateOne(
            { _id: id },
            {
                $set: {
                    currentBalance: finalBalance,
                    updatedBy: actorName,
                    updatedOn: new Date()
                },
                $push: { creditHistory: newHistoryEntry }
            }
        );

        const updatedCreditor = await Creditor.findById(id);

        res.status(200).json({
            success: true,
            message: `Repayment of रु ${payVal.toLocaleString('en-IN')} recorded successfully.`,
            data: updatedCreditor
        });
    } catch (error) {
        next(error);
    }
};

const waiveCredit = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { passwordOrPin, note } = req.body;

        if (!passwordOrPin) {
            const error = createError(400, "PIN or Password is required to confirm waiver!");
            return next(error);
        }

        if (!note || !note.trim()) {
            const error = createError(400, "Waiver remarks/reason is required!");
            return next(error);
        }

        const creditor = await Creditor.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!creditor) {
            const error = createError(404, "Creditor not found!");
            return next(error);
        }

        const waivedAmount = creditor.currentBalance;
        if (waivedAmount <= 0) {
            const error = createError(400, "Creditor has no outstanding balance to waive!");
            return next(error);
        }

        // 1. Fetch active configuration to verify features & roles
        const config = await RestaurantConfig.findOne({});
        const waiverEnabled = config ? config.creditWaiverEnabled !== false : true;
        if (!waiverEnabled) {
            const error = createError(400, "Credit Waiver feature is currently disabled in the configuration!");
            return next(error);
        }

        // 2. Validate role permission
        const userRole = req.user ? req.user.role : null;
        const waiverRoles = config ? config.creditWaiverRoles || ["Admin"] : ["Admin"];
        const isAuthorized = userRole === "Superadmin" || waiverRoles.includes(userRole);
        if (!isAuthorized) {
            const error = createError(403, "You do not have the required role to authorize credit waivers!");
            return next(error);
        }

        // 3. Confirm password or PIN of the active user
        const dbUser = await User.findById(req.user._id);
        if (!dbUser) {
            const error = createError(404, "Active user profile not found!");
            return next(error);
        }

        let isMatch = false;
        // Check PIN first if provided pin length is <= 6
        if (passwordOrPin.length <= 6 && dbUser.pin) {
            isMatch = await bcrypt.compare(String(passwordOrPin), dbUser.pin);
        }
        // Check password if PIN didn't match or wasn't checked
        if (!isMatch) {
            isMatch = await bcrypt.compare(passwordOrPin, dbUser.password);
        }

        if (!isMatch) {
            const error = createError(400, "Invalid PIN or Password!");
            return next(error);
        }

        const actorName = req.user ? (req.user.name || req.user.email || String(req.user.role)) : "System";
        const newWaiverEntry = {
            type: "waiver",
            amount: waivedAmount,
            note: note || "Credit Waiver",
            timestamp: new Date()
        };

        await Creditor.updateOne(
            { _id: id },
            {
                $set: {
                    currentBalance: 0,
                    updatedBy: actorName,
                    updatedOn: new Date()
                },
                $push: { creditHistory: newWaiverEntry }
            }
        );

        // 5. Create a corresponding expense entry
        const waiverExpense = new Expense({
            description: `Credit Waiver - ${creditor.name} (${creditor.phone})`,
            category: "Others",
            amount: waivedAmount,
            method: "Credit Waiver",
            createdBy: actorName,
            date: new Date()
        });
        await waiverExpense.save();

        const updatedCreditor = await Creditor.findById(id);

        res.status(200).json({
            success: true,
            message: `Credit Waiver of रु ${waivedAmount.toLocaleString('en-IN')} approved successfully.`,
            data: updatedCreditor
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { getCreditors, createCreditor, updateCreditor, deleteCreditor, recordPayment, waiveCredit };
