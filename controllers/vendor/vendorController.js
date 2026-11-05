const Vendor = require("../../models/vendor/vendorModel");
const Purchase = require("../../models/vendor/purchaseModel");
const createError = require("http-errors");

const getVendors = async (req, res, next) => {
    try {
        const targetSlug = req.query.companySlug || req.headers["x-company-slug"] || req.user?.companySlug;
        const filter = { isDeleted: { $ne: true } };
        if (targetSlug && targetSlug !== "all") {
            filter.$or = [
                { companySlug: targetSlug },
                { companySlug: { $exists: false } },
                { companySlug: null },
                { companySlug: "" }
            ];
        }

        const vendors = await Vendor.find(filter).sort({ createdAt: -1 });
        
        const enrichedVendors = [];
        for (const vendor of vendors) {
            const purchases = await Purchase.find({ vendor: vendor._id });
            const totalPaid = purchases.reduce((sum, p) => sum + (p.paidAmount || 0), 0);
            const totalRemaining = purchases.reduce((sum, p) => sum + ((p.totalCost || 0) - (p.paidAmount || 0)), 0);
            
            const vendorObj = vendor.toObject();
            vendorObj.totalPaid = totalPaid;
            vendorObj.totalRemaining = totalRemaining;
            enrichedVendors.push(vendorObj);
        }

        res.status(200).json({
            success: true,
            message: "Vendors retrieved successfully",
            data: enrichedVendors
        });
    } catch (error) {
        next(error);
    }
};

const createVendor = async (req, res, next) => {
    try {
        const { companySlug, name, contactNumber, address, email, isActive } = req.body;
        let targetSlug = (companySlug && String(companySlug).trim() !== "" && companySlug !== "all")
            ? String(companySlug).trim()
            : (req.headers["x-company-slug"] || req.query.companySlug || req.user?.companySlug);

        if (!targetSlug || targetSlug === "all" || String(targetSlug).trim() === "") {
            const Company = require("../../models/company/companyModel");
            const firstCompany = await Company.findOne({ isDeleted: { $ne: true } });
            if (firstCompany && firstCompany.companySlug) {
                targetSlug = firstCompany.companySlug;
            } else {
                targetSlug = "default-company";
            }
        }

        if (!name || !contactNumber || !address) {
            const error = createError(400, "Full Name, Contact Number, and Address are required!");
            return next(error);
        }

        // Phone format validation (Nepal 10 digits starting with 98 or 97)
        if (!/^(98|97)\d{8}$/.test(contactNumber)) {
            const error = createError(400, "Please provide a valid 10-digit contact number starting with 98 or 97!");
            return next(error);
        }

        // Email format validation (optional)
        if (email && !/\S+@\S+\.\S+/.test(email)) {
            const error = createError(400, "Please provide a valid email address!");
            return next(error);
        }

        // Check unique contactNumber constraints
        const phoneFilter = {
            isDeleted: { $ne: true },
            contactNumber
        };
        if (targetSlug) {
            phoneFilter.$or = [
                { companySlug: targetSlug },
                { companySlug: { $exists: false } },
                { companySlug: null },
                { companySlug: "" }
            ];
        }
        const existingByPhone = await Vendor.findOne(phoneFilter);
        if (existingByPhone) {
            const error = createError(400, "Vendor with this contact number already exists!");
            return next(error);
        }

        // Check unique email constraints if email is provided
        if (email) {
            const emailFilter = {
                isDeleted: { $ne: true },
                email
            };
            if (targetSlug) {
                emailFilter.$or = [
                    { companySlug: targetSlug },
                    { companySlug: { $exists: false } },
                    { companySlug: null },
                    { companySlug: "" }
                ];
            }
            const existingByEmail = await Vendor.findOne(emailFilter);
            if (existingByEmail) {
                const error = createError(400, "Vendor with this email address already exists!");
                return next(error);
            }
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
        const vendor = new Vendor({
            companySlug: targetSlug || "default-company",
            name: name.trim(),
            contactNumber: contactNumber.trim(),
            address: address.trim(),
            email: email ? email.trim() : "",
            isActive: isActive !== undefined ? isActive : true,
            createdBy: actorName
        });

        await vendor.save();

        res.status(201).json({
            success: true,
            message: "Vendor created successfully",
            data: vendor
        });
    } catch (error) {
        next(error);
    }
};

const updateVendor = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { companySlug, name, contactNumber, address, email, isActive } = req.body;
        let targetSlug = (companySlug && String(companySlug).trim() !== "" && companySlug !== "all")
            ? String(companySlug).trim()
            : (req.headers["x-company-slug"] || req.query.companySlug || req.user?.companySlug);

        if (!name || !contactNumber || !address) {
            const error = createError(400, "Full Name, Contact Number, and Address are required!");
            return next(error);
        }

        // Phone format validation (Nepal 10 digits starting with 98 or 97)
        if (!/^(98|97)\d{8}$/.test(contactNumber)) {
            const error = createError(400, "Please provide a valid 10-digit contact number starting with 98 or 97!");
            return next(error);
        }

        // Email format validation (optional)
        if (email && !/\S+@\S+\.\S+/.test(email)) {
            const error = createError(400, "Please provide a valid email address!");
            return next(error);
        }

        const vendor = await Vendor.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!vendor) {
            const error = createError(404, "Vendor not found!");
            return next(error);
        }

        if (!targetSlug || targetSlug === "all" || String(targetSlug).trim() === "") {
            targetSlug = vendor.companySlug || req.user?.companySlug || "default-company";
        }

        const vendorSlug = targetSlug || vendor.companySlug || "default-company";

        // Check constraints matching other vendors
        const otherPhoneFilter = {
            _id: { $ne: id },
            isDeleted: { $ne: true },
            contactNumber
        };
        if (vendorSlug) {
            otherPhoneFilter.$or = [
                { companySlug: vendorSlug },
                { companySlug: { $exists: false } },
                { companySlug: null },
                { companySlug: "" }
            ];
        }
        const otherByPhone = await Vendor.findOne(otherPhoneFilter);
        if (otherByPhone) {
            const error = createError(400, "Vendor with this contact number already exists!");
            return next(error);
        }

        if (email) {
            const otherEmailFilter = {
                _id: { $ne: id },
                isDeleted: { $ne: true },
                email
            };
            if (vendorSlug) {
                otherEmailFilter.$or = [
                    { companySlug: vendorSlug },
                    { companySlug: { $exists: false } },
                    { companySlug: null },
                    { companySlug: "" }
                ];
            }
            const otherByEmail = await Vendor.findOne(otherEmailFilter);
            if (otherByEmail) {
                const error = createError(400, "Vendor with this email address already exists!");
                return next(error);
            }
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
        vendor.name = name.trim();
        vendor.contactNumber = contactNumber.trim();
        vendor.address = address.trim();
        vendor.email = email ? email.trim() : "";
        if (isActive !== undefined) {
            vendor.isActive = isActive;
        }
        if (targetSlug && (!vendor.companySlug || vendor.companySlug === "")) {
            vendor.companySlug = targetSlug;
        }
        vendor.updatedBy = actorName;
        vendor.updatedOn = new Date();

        await vendor.save();

        res.status(200).json({
            success: true,
            message: "Vendor details updated successfully",
            data: vendor
        });
    } catch (error) {
        next(error);
    }
};

const deleteVendor = async (req, res, next) => {
    try {
        const { id } = req.params;
        const vendor = await Vendor.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!vendor) {
            const error = createError(404, "Vendor not found!");
            return next(error);
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
        const uniqueSuffix = `deleted-${Date.now()}`;
        if (vendor.email) {
            vendor.email = vendor.email.replace("@", `-${uniqueSuffix}@`);
        }
        vendor.contactNumber = `${vendor.contactNumber}-del-${uniqueSuffix}`;
        vendor.isDeleted = true;
        vendor.deletedBy = actorName;
        vendor.deletedOn = new Date();
        vendor.updatedBy = actorName;
        vendor.updatedOn = new Date();

        await vendor.save();

        res.status(200).json({
            success: true,
            message: `Vendor ${vendor.name} has been deleted successfully.`,
            data: { id: vendor._id }
        });
    } catch (error) {
        next(error);
    }
};

const getVendorHistory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const history = await Purchase.find({ vendor: id })
            .populate({ path: "item", select: "-adjustments" })
            .sort({ purchaseDate: -1 });

        res.status(200).json({
            success: true,
            message: "Vendor purchase history retrieved successfully",
            data: history
        });
    } catch (error) {
        next(error);
    }
};

const settleVendorBalance = async (req, res, next) => {
    try {
        const { vendorId, amount, paymentMethod, paymentDate, chequeDate } = req.body;
        if (!vendorId || amount === undefined || Number(amount) <= 0 || !paymentMethod) {
            const error = createError(400, "Vendor ID, amount, and payment method are required!");
            return next(error);
        }

        if (paymentMethod === "Cheque" && !chequeDate) {
            const error = createError(400, "Cheque date is required when payment method is Cheque!");
            return next(error);
        }

        const Expense = require("../../models/expense/expenseModel");

        const vendor = await Vendor.findOne({ _id: vendorId, isDeleted: { $ne: true } });
        if (!vendor) {
            const error = createError(404, "Vendor not found!");
            return next(error);
        }

        let settleAmount = Number(amount);
        const purchases = await Purchase.find({ vendor: vendorId, paymentStatus: { $ne: "Paid" } }).sort({ purchaseDate: 1 });

        let allocated = 0;
        for (const purchase of purchases) {
            if (settleAmount <= 0) break;

            const remaining = purchase.totalCost - purchase.paidAmount;
            if (remaining <= 0) continue;

            const pay = Math.min(settleAmount, remaining);
            purchase.paidAmount += pay;
            settleAmount -= pay;
            allocated += pay;

            // Update the payment method of the purchase to reflect how it was settled
            purchase.paymentMethod = paymentMethod;
            if (paymentMethod === "Cheque") {
                purchase.chequeDate = chequeDate ? new Date(chequeDate) : undefined;
            }

            if (purchase.paidAmount >= purchase.totalCost) {
                purchase.paymentStatus = "Paid";
            } else {
                purchase.paymentStatus = "Partial";
            }

            await purchase.save();
        }


        if (allocated > 0) {
            const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
            const expense = new Expense({
                description: `Payment settlement of रु ${allocated.toLocaleString('en-IN')} to Vendor ${vendor.name}`,
                category: "Ingredients",
                amount: allocated,
                date: paymentDate ? new Date(paymentDate) : new Date(),
                method: paymentMethod,
                createdBy: actorName,
                chequeDate: paymentMethod === "Cheque" && chequeDate ? new Date(chequeDate) : undefined,
                vendor: vendor._id
            });
            await expense.save();
        }

        res.status(200).json({
            success: true,
            message: `Successfully settled रु ${allocated.toLocaleString('en-IN')} with Vendor ${vendor.name}.`,
            data: {
                allocated,
                remainingChange: settleAmount
            }
        });
    } catch (error) {
        next(error);
    }
};

const getAllPurchases = async (req, res, next) => {
    try {
        const { startDate, endDate, period, companySlug } = req.query;
        let query = {};

        const targetCompanySlug = companySlug || req.user?.companySlug;
        if (targetCompanySlug) {
            query.companySlug = targetCompanySlug;
        }

        // Filter by date range or period
        let dateQuery = {};
        if (startDate || endDate) {
            if (startDate) {
                const start = new Date(startDate);
                start.setHours(0, 0, 0, 0);
                dateQuery.$gte = start;
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                dateQuery.$lte = end;
            }
        } else if (period) {
            if (period === "today") {
                const start = new Date();
                start.setHours(0, 0, 0, 0);
                dateQuery.$gte = start;
            } else if (period === "yesterday") {
                const start = new Date();
                start.setDate(start.getDate() - 1);
                start.setHours(0, 0, 0, 0);
                const end = new Date();
                end.setDate(end.getDate() - 1);
                end.setHours(23, 59, 59, 999);
                dateQuery.$gte = start;
                dateQuery.$lte = end;
            } else if (period === "7days") {
                const start = new Date();
                start.setDate(start.getDate() - 7);
                start.setHours(0, 0, 0, 0);
                dateQuery.$gte = start;
            } else if (period === "month") {
                const start = new Date();
                start.setDate(1);
                start.setHours(0, 0, 0, 0);
                dateQuery.$gte = start;
            }
        }

        if (Object.keys(dateQuery).length > 0) {
            query.purchaseDate = dateQuery;
        }

        const purchases = await Purchase.find(query)
            .populate("vendor")
            .populate({ path: "item", select: "-adjustments" })
            .sort({ purchaseDate: -1 });

        res.status(200).json({
            success: true,
            data: purchases
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { getVendors, createVendor, updateVendor, deleteVendor, getVendorHistory, settleVendorBalance, getAllPurchases };
