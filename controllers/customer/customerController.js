const Customer = require("../../models/customer/customerModel");
const Creditor = require("../../models/creditor/creditorModel");
const createError = require("http-errors");

const getCustomers = async (req, res, next) => {
    try {
        const customers = await Customer.find({ isDeleted: { $ne: true } })
            .sort({ createdAt: -1 });
        
        // Floor points to eliminate any old decimal values from the database
        const flooredCustomers = customers.map(c => {
            const doc = c.toObject();
            doc.points = Math.floor(doc.points || 0);
            return doc;
        });

        res.status(200).json({
            success: true,
            message: "Customers retrieved successfully",
            data: flooredCustomers
        });
    } catch (error) {
        next(error);
    }
};

const createCustomer = async (req, res, next) => {
    try {
        const { name, phone, email } = req.body;
        if (!name || !phone) {
            const error = createError(400, "Name and Phone number are required!");
            return next(error);
        }

        // Validate email format if provided
        if (email && email.trim() !== "" && !/\S+@\S+\.\S+/.test(email)) {
            const error = createError(400, "Please provide a valid email address!");
            return next(error);
        }

        // Check if phone or email matches a creditor with outstanding debt
        const creditorConditions = [{ phone }];
        if (email && email.trim() !== "") {
            creditorConditions.push({ email: email.trim() });
        }

        const matchingCreditor = await Creditor.findOne({
            isDeleted: { $ne: true },
            currentBalance: { $gt: 0 },
            $or: creditorConditions
        });

        if (matchingCreditor) {
            const error = createError(
                400,
                `Cannot add customer. This phone or email matches a creditor (${matchingCreditor.name}) with an outstanding debt balance of रु ${matchingCreditor.currentBalance.toLocaleString('en-IN')}.`
            );
            return next(error);
        }

        // Check if customer with this full name already exists (case-insensitive)
        const existingByName = await Customer.findOne({
            isDeleted: { $ne: true },
            name: { $regex: new RegExp(`^${name.trim()}$`, "i") }
        });
        if (existingByName) {
            const error = createError(400, "Customer with this full name already exists!");
            return next(error);
        }

        // Check if customer already exists by phone or email (ignoring soft-deleted profiles)
        const orConditions = [{ phone }];
        if (email && email.trim() !== "") {
            orConditions.push({ email: email.trim() });
        }

        let existingCustomer = await Customer.findOne({
            isDeleted: { $ne: true },
            $or: orConditions
        });
        
        if (existingCustomer) {
            if (existingCustomer.phone === phone) {
                const error = createError(400, "Customer with this phone number already exists!");
                return next(error);
            }
            if (email && email.trim() !== "" && existingCustomer.email === email) {
                const error = createError(400, "Customer with this email address already exists!");
                return next(error);
            }
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
        const customer = new Customer({
            name,
            phone,
            email: email || undefined,
            visits: 0,
            spent: 0,
            points: 0,
            createdBy: actorName
        });

        await customer.save();

        res.status(201).json({
            success: true,
            message: "Customer created successfully",
            data: customer
        });
    } catch (error) {
        next(error);
    }
};

const updateCustomer = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, phone, email } = req.body;

        if (!name || !phone) {
            const error = createError(400, "Name and Phone number are required!");
            return next(error);
        }

        // Validate email format if provided
        if (email && email.trim() !== "" && !/\S+@\S+\.\S+/.test(email)) {
            const error = createError(400, "Please provide a valid email address!");
            return next(error);
        }

        const customer = await Customer.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!customer) {
            const error = createError(404, "Customer not found!");
            return next(error);
        }

        // Check if full name is already taken by another active customer (case-insensitive)
        const otherByName = await Customer.findOne({
            _id: { $ne: id },
            isDeleted: { $ne: true },
            name: { $regex: new RegExp(`^${name.trim()}$`, "i") }
        });
        if (otherByName) {
            const error = createError(400, "Customer with this full name already exists!");
            return next(error);
        }

        // Check if phone or email matches a creditor with outstanding debt
        const creditorConditions = [{ phone }];
        if (email && email.trim() !== "") {
            creditorConditions.push({ email: email.trim() });
        }

        const matchingCreditor = await Creditor.findOne({
            isDeleted: { $ne: true },
            currentBalance: { $gt: 0 },
            $or: creditorConditions
        });

        if (matchingCreditor) {
            const error = createError(
                400,
                `Cannot update customer. This phone or email matches a creditor (${matchingCreditor.name}) with an outstanding debt balance of रु ${matchingCreditor.currentBalance.toLocaleString('en-IN')}.`
            );
            return next(error);
        }

        // Check if phone or email is already taken by another active customer
        const orConditions = [{ phone }];
        if (email && email.trim() !== "") {
            orConditions.push({ email: email.trim() });
        }

        const otherCustomer = await Customer.findOne({
            _id: { $ne: id },
            isDeleted: { $ne: true },
            $or: orConditions
        });

        if (otherCustomer) {
            if (otherCustomer.phone === phone) {
                const error = createError(400, "Customer with this phone number already exists!");
                return next(error);
            }
            if (email && email.trim() !== "" && otherCustomer.email === email) {
                const error = createError(400, "Customer with this email address already exists!");
                return next(error);
            }
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
        customer.name = name;
        customer.phone = phone;
        customer.email = email || undefined;
        customer.updatedBy = actorName;
        customer.updatedOn = new Date();

        await customer.save();

        res.status(200).json({
            success: true,
            message: "Customer updated successfully",
            data: customer
        });
    } catch (error) {
        next(error);
    }
};

const deleteCustomer = async (req, res, next) => {
    try {
        const { id } = req.params;
        const customer = await Customer.findById(id);
        if (!customer || customer.isDeleted) {
            const error = createError(404, "Customer not found!");
            return next(error);
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
        // Release email and phone unique constraints on soft-delete
        const uniqueSuffix = `deleted-${Date.now()}`;
        if (customer.email) {
            customer.email = customer.email.replace("@", `-${uniqueSuffix}@`);
        }
        customer.phone = `${customer.phone}-del-${uniqueSuffix}`;
        customer.isDeleted = true;
        customer.deletedBy = actorName;
        customer.deletedOn = new Date();
        customer.updatedBy = actorName;
        customer.updatedOn = new Date();

        await customer.save();

        res.status(200).json({
            success: true,
            message: `Customer ${customer.name} has been deleted successfully.`,
            data: { id: customer._id }
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { getCustomers, createCustomer, updateCustomer, deleteCustomer };
