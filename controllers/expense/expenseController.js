const Expense = require("../../models/expense/expenseModel");
const createHttpError = require("http-errors");

// GET /api/expense
const getExpenses = async (req, res, next) => {
    try {
        const { startDate, endDate, period } = req.query;
        let query = {};

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
            query.date = dateQuery;
        }

        const expenses = await Expense.find(query)
            .populate("vendor")
            .populate("customer")
            .populate("staff")
            .sort({ date: -1 });

        res.status(200).json({
            success: true,
            message: "Expenses retrieved successfully!",
            data: expenses
        });
    } catch (error) {
        next(error);
    }
};

// POST /api/expense
const createExpense = async (req, res, next) => {
    try {
        const { description, category, amount, date, method, staff } = req.body;

        if (!description || !description.trim()) {
            return next(createHttpError(400, "Description is required!"));
        }
        if (!amount || isNaN(amount) || Number(amount) <= 0) {
            return next(createHttpError(400, "Valid expense amount is required!"));
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";

        const expense = new Expense({
            description: description.trim(),
            category: category || "Ingredients",
            amount: Number(amount),
            date: date ? new Date(date) : new Date(),
            method: method || "Cash",
            staff: staff || null,
            createdBy: actorName
        });

        await expense.save();

        res.status(201).json({
            success: true,
            message: "Expense recorded successfully!",
            data: expense
        });
    } catch (error) {
        next(error);
    }
};

// DELETE /api/expense/:id
const deleteExpense = async (req, res, next) => {
    try {
        const { id } = req.params;
        const expense = await Expense.findByIdAndDelete(id);

        if (!expense) {
            return next(createHttpError(404, "Expense record not found!"));
        }

        res.status(200).json({
            success: true,
            message: "Expense record deleted successfully!"
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getExpenses,
    createExpense,
    deleteExpense
};
