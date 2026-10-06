const Customer = require("../../models/customer/customerModel");
const Expense = require("../../models/expense/expenseModel");
const User = require("../../models/user/userModel");
const RestaurantConfig = require("../../models/restaurant/restaurantModel");
const createError = require("../../middlewares/globalErrorHandler");

const getCustomers = async (req, res, next) => {
  try {
    const targetSlug = req.query.companySlug || req.headers["x-company-slug"] || req.user?.companySlug;
    const { search } = req.query;
    
    const filter = {
      isDeleted: { $ne: true },
      $or: [{ type: "customer" }, { type: { $exists: false } }, { type: null }]
    };

    if (targetSlug && targetSlug !== "all") {
      filter.companySlug = targetSlug;
    }

    if (search && search.trim()) {
      filter.$and = [
        {
          $or: [
            { name: { $regex: search.trim(), $options: "i" } },
            { phone: { $regex: search.trim(), $options: "i" } },
            { email: { $regex: search.trim(), $options: "i" } },
            { address: { $regex: search.trim(), $options: "i" } }
          ]
        }
      ];
    }

    const customers = await Customer.find(filter).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: customers });
  } catch (error) {
    next(error);
  }
};

const createCustomer = async (req, res, next) => {
  try {
    const { companySlug, name, phone, email, address, creditLimit, currentBalance, isBlacklisted, blacklistReason } = req.body;
    const targetSlug = companySlug || req.headers["x-company-slug"] || req.user?.companySlug ;

    if (!name || !name.trim()) return next(createError(400, "Customer name is required!"));
    if (!phone || !phone.trim()) return next(createError(400, "Phone number is required!"));

    const existing = await Customer.findOne({
      phone: phone.trim(),
      companySlug: targetSlug,
      isDeleted: { $ne: true }
    });
    if (existing) return next(createError(400, "Customer with this phone number already exists!"));

    const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";

    const customer = new Customer({
      companySlug: targetSlug,
      type: "customer",
      name: name.trim(),
      phone: phone.trim(),
      email: email ? email.trim() : "",
      address: address ? address.trim() : "",
      creditLimit: creditLimit !== undefined ? Number(creditLimit) : 10000,
      currentBalance: currentBalance !== undefined ? Number(currentBalance) : 0,
      isBlacklisted: Boolean(isBlacklisted),
      blacklistReason: isBlacklisted ? (blacklistReason || "Manual blacklist") : "",
      createdBy: actorName,
      createdOn: new Date()
    });

    if (currentBalance > 0) {
      customer.creditHistory.push({
        type: "credit",
        amount: Number(currentBalance),
        note: "Initial Credit Balance",
        timestamp: new Date()
      });
    }

    await customer.save();
    res.status(201).json({ success: true, message: "Customer created successfully", data: customer });
  } catch (error) {
    next(error);
  }
};

const updateCustomer = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, phone, email, address, creditLimit, currentBalance, isBlacklisted, blacklistReason } = req.body;

    const customer = await Customer.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!customer) return next(createError(404, "Customer not found!"));

    const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";

    if (name) customer.name = name.trim();
    if (phone) customer.phone = phone.trim();
    if (email !== undefined) customer.email = email.trim();
    if (address !== undefined) customer.address = address.trim();
    if (creditLimit !== undefined) customer.creditLimit = Number(creditLimit);

    if (currentBalance !== undefined && !isNaN(Number(currentBalance))) {
      const targetBal = Number(currentBalance);
      if (targetBal !== customer.currentBalance) {
        const diff = targetBal - customer.currentBalance;
        customer.creditHistory.push({
          type: diff > 0 ? "credit" : "payment",
          amount: Math.abs(diff),
          note: `Manual Balance Adjustment (Rs ${customer.currentBalance} -> Rs ${targetBal}) by ${actorName}`,
          timestamp: new Date()
        });
        customer.currentBalance = targetBal;
      }
    }

    if (isBlacklisted !== undefined) {
      customer.isBlacklisted = Boolean(isBlacklisted);
      customer.blacklistReason = isBlacklisted ? (blacklistReason || "Manual blacklist") : "";
    }

    customer.updatedBy = actorName;
    customer.updatedOn = new Date();

    await customer.save();
    res.status(200).json({ success: true, message: "Customer updated successfully", data: customer });
  } catch (error) {
    next(error);
  }
};

const deleteCustomer = async (req, res, next) => {
  try {
    const { id } = req.params;
    const customer = await Customer.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!customer) return next(createError(404, "Customer not found!"));

    const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
    const uniqueSuffix = `deleted-${Date.now()}`;

    customer.phone = `${customer.phone}-del-${uniqueSuffix}`;
    customer.isDeleted = true;
    customer.deletedBy = actorName;
    customer.deletedOn = new Date();
    customer.updatedBy = actorName;
    customer.updatedOn = new Date();

    await customer.save();
    res.status(200).json({ success: true, message: `Customer ${customer.name} deleted successfully`, data: { id: customer._id } });
  } catch (error) {
    next(error);
  }
};

const recordPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount, note, date } = req.body;
    const payVal = Number(amount);
    if (!amount || isNaN(payVal) || payVal <= 0) return next(createError(400, "Payment amount must be greater than 0!"));

    const customer = await Customer.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!customer) return next(createError(404, "Customer not found!"));

    const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
    const newHistoryEntry = {
      type: "payment",
      amount: payVal,
      note: note || "Customer Repayment",
      timestamp: date ? new Date(date) : new Date()
    };
    const finalBalance = Math.max(0, Number((customer.currentBalance - payVal).toFixed(2)));

    await Customer.updateOne(
      { _id: id },
      {
        $set: { currentBalance: finalBalance, updatedBy: actorName, updatedOn: new Date() },
        $push: { creditHistory: newHistoryEntry }
      }
    );

    const updatedCustomer = await Customer.findById(id);
    res.status(200).json({ success: true, message: `Payment of Rs ${payVal} recorded successfully`, data: updatedCustomer });
  } catch (error) {
    next(error);
  }
};

module.exports = { getCustomers, createCustomer, updateCustomer, deleteCustomer, recordPayment };
