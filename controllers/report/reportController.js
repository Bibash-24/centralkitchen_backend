const Order = { find: () => [] };
const Inventory = require("../../models/inventory/inventoryModel");
const Expense = require("../../models/expense/expenseModel");
const Purchase = require("../../models/vendor/purchaseModel");
const Creditor = require("../../models/creditor/creditorModel");
const Customer = { find: () => ({ populate: () => [] }) };
const MenuItem = require("../../models/menuItem/menuItemModel");
const createHttpError = require("http-errors");

// Helper to parse date ranges
const parseDateRange = (startDate, endDate, period) => {
    let start = new Date("2000-01-01");
    let end = new Date();

    if (period) {
        const today = new Date();
        if (period === "today") {
            start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
            end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
        } else if (period === "yesterday") {
            const yesterday = new Date();
            yesterday.setDate(today.getDate() - 1);
            start = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0, 0);
            end = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
        } else if (period === "7days") {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(today.getDate() - 7);
            start = new Date(sevenDaysAgo.getFullYear(), sevenDaysAgo.getMonth(), sevenDaysAgo.getDate(), 0, 0, 0, 0);
            end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
        } else if (period === "month") {
            start = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
            end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
        }
    } else {
        if (startDate) {
            const [sYear, sMonth, sDay] = startDate.split('-').map(Number);
            start = new Date(sYear, sMonth - 1, sDay, 0, 0, 0, 0);
        }
        if (endDate) {
            const [eYear, eMonth, eDay] = endDate.split('-').map(Number);
            end = new Date(eYear, eMonth - 1, eDay, 23, 59, 59, 999);
        }
    }

    return { start, end };
};

// 1. Sales & Revenue Reports
const getSalesRevenueReport = async (req, res, next) => {
    try {
        const { startDate, endDate, period } = req.query;
        const { start, end } = parseDateRange(startDate, endDate, period);

        // Fetch completed orders within range
        const orders = await Order.find({
            orderStatus: "Completed",
            createdAt: { $gte: start, $lte: end }
        }).populate("table");

        // A. Daily Sales Summary (Z-Report)
        const dailySummaryMap = {};
        let totalSales = 0;
        let totalTax = 0;
        let totalDiscount = 0;
        let totalOrders = 0;
        let totalGuests = 0;

        orders.forEach(order => {
            const d = new Date(order.createdAt);
            const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const bills = order.bills || {};
            const salesVal = bills.totalWithTax || 0;
            const taxVal = bills.tax || 0;
            const discountVal = bills.discount || 0;
            const guestsVal = order.customerDetails?.guests || 0;

            if (!dailySummaryMap[dateKey]) {
                dailySummaryMap[dateKey] = {
                    date: dateKey,
                    sales: 0,
                    tax: 0,
                    discount: 0,
                    ordersCount: 0,
                    guests: 0
                };
            }

            dailySummaryMap[dateKey].sales += salesVal;
            dailySummaryMap[dateKey].tax += taxVal;
            dailySummaryMap[dateKey].discount += discountVal;
            dailySummaryMap[dateKey].ordersCount += 1;
            dailySummaryMap[dateKey].guests += guestsVal;

            totalSales += salesVal;
            totalTax += taxVal;
            totalDiscount += discountVal;
            totalOrders += 1;
            totalGuests += guestsVal;
        });

        const dailySalesSummary = Object.values(dailySummaryMap).map(day => ({
            ...day,
            sales: Number(day.sales.toFixed(2)),
            tax: Number(day.tax.toFixed(2)),
            discount: Number(day.discount.toFixed(2)),
            aov: day.ordersCount > 0 ? Number((day.sales / day.ordersCount).toFixed(2)) : 0
        })).sort((a, b) => b.date.localeCompare(a.date));

        const zReportSummary = {
            totalSales: Number(totalSales.toFixed(2)),
            totalTax: Number(totalTax.toFixed(2)),
            totalDiscount: Number(totalDiscount.toFixed(2)),
            totalOrders,
            totalGuests,
            aov: totalOrders > 0 ? Number((totalSales / totalOrders).toFixed(2)) : 0
        };

        // B. Item Sales Performance (Product Mix)
        const itemPerfMap = {};
        orders.forEach(order => {
            (order.items || []).forEach(item => {
                const name = item.name;
                const qty = item.quantity || 0;
                const price = item.price || 0;

                if (!itemPerfMap[name]) {
                    itemPerfMap[name] = {
                        name,
                        quantitySold: 0,
                        revenue: 0
                    };
                }
                itemPerfMap[name].quantitySold += qty;
                itemPerfMap[name].revenue += price;
            });
        });

        const itemSalesPerformance = Object.values(itemPerfMap).map(i => ({
            ...i,
            revenue: Number(i.revenue.toFixed(2))
        })).sort((a, b) => b.quantitySold - a.quantitySold);

        // C. Category Sales Report
        const menuItems = await MenuItem.find().populate("category");
        const categoryMap = {};
        menuItems.forEach(item => {
            categoryMap[item.name] = item.category?.name || "Uncategorized";
        });

        const categorySalesMap = {};
        orders.forEach(order => {
            (order.items || []).forEach(item => {
                const catName = categoryMap[item.name] || (item.categoryName ? item.categoryName : "Uncategorized");
                const qty = item.quantity || 0;
                const price = item.price || 0;

                if (!categorySalesMap[catName]) {
                    categorySalesMap[catName] = {
                        categoryName: catName,
                        quantitySold: 0,
                        revenue: 0
                    };
                }
                categorySalesMap[catName].quantitySold += qty;
                categorySalesMap[catName].revenue += price;
            });
        });

        const categorySalesReport = Object.values(categorySalesMap).map(c => ({
            ...c,
            revenue: Number(c.revenue.toFixed(2))
        })).sort((a, b) => b.revenue - a.revenue);

        // D. Hourly Sales & Peak Time Analysis
        const hourlySalesMap = Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            hourLabel: `${String(i).padStart(2, '0')}:00`,
            ordersCount: 0,
            revenue: 0,
            sales: 0,
            tax: 0,
            discount: 0,
            guests: 0
        }));

        orders.forEach(order => {
            const hour = new Date(order.createdAt).getHours();
            const bills = order.bills || {};
            const rev = bills.totalWithTax || 0;
            const taxVal = bills.tax || 0;
            const discountVal = bills.discount || 0;
            const guestsVal = order.customerDetails?.guests || 0;

            hourlySalesMap[hour].ordersCount += 1;
            hourlySalesMap[hour].revenue += rev;
            hourlySalesMap[hour].sales += rev;
            hourlySalesMap[hour].tax += taxVal;
            hourlySalesMap[hour].discount += discountVal;
            hourlySalesMap[hour].guests += guestsVal;
        });

        const hourlySales = hourlySalesMap.map(h => ({
            ...h,
            revenue: Number(h.revenue.toFixed(2)),
            sales: Number(h.sales.toFixed(2)),
            tax: Number(h.tax.toFixed(2)),
            discount: Number(h.discount.toFixed(2)),
            aov: h.ordersCount > 0 ? Number((h.sales / h.ordersCount).toFixed(2)) : 0
        }));

        // E. Table Turnaround & Cabin Charge Report
        let totalCabinCharges = 0;
        let cabinOrdersCount = 0;
        let totalCabinDurationMinutes = 0;
        const tableSummaryMap = {};

        orders.forEach(order => {
            const rawTableNo = order.table?.tableNo ? String(order.table.tableNo).split("_deleted_")[0] : "";
            const cabinCharge = order.accumulatedCabinCharge || 0;
            const duration = (order.accumulatedCabinMinutes || 0) + (order.cabinStartedAt ? Math.round((new Date() - new Date(order.cabinStartedAt)) / (1000 * 60)) : 0);

            let tableNo = "";
            let serviceType = "Dine In";

            if (order.table) {
                tableNo = `Table ${rawTableNo}`;
                if (cabinCharge > 0 || order.cabinStartedAt) {
                    serviceType = "Cabin Stay";
                } else {
                    serviceType = "Dine In";
                }
            } else {
                const typeStr = (order.orderType || "").toLowerCase();
                if (typeStr.includes("takeaway")) {
                    tableNo = "Takeaway";
                    serviceType = "Takeaway";
                } else if (typeStr.includes("delivery")) {
                    tableNo = "Delivery";
                    serviceType = "Delivery";
                } else {
                    tableNo = order.orderType ? order.orderType : "Direct / Counter";
                    serviceType = order.orderType ? order.orderType : "Takeaway";
                }
            }

            if (!tableSummaryMap[tableNo]) {
                tableSummaryMap[tableNo] = {
                    tableName: tableNo,
                    serviceType: serviceType,
                    ordersCount: 0,
                    revenue: 0,
                    cabinDurationMinutes: 0,
                    cabinCharges: 0
                };
            }

            tableSummaryMap[tableNo].ordersCount += 1;
            tableSummaryMap[tableNo].revenue += (order.bills?.totalWithTax || 0);
            tableSummaryMap[tableNo].cabinDurationMinutes += duration;
            tableSummaryMap[tableNo].cabinCharges += cabinCharge;

            if (cabinCharge > 0 || order.cabinStartedAt) {
                totalCabinCharges += cabinCharge;
                cabinOrdersCount += 1;
                totalCabinDurationMinutes += duration;
            }
        });

        const tableTurnaround = Object.values(tableSummaryMap).map(t => ({
            ...t,
            revenue: Number(t.revenue.toFixed(2)),
            cabinCharges: Number(t.cabinCharges.toFixed(2))
        })).sort((a, b) => b.revenue - a.revenue);

        res.status(200).json({
            success: true,
            data: {
                zReportSummary,
                dailySalesSummary,
                itemSalesPerformance,
                categorySalesReport,
                hourlySales,
                tableTurnaround: {
                    list: tableTurnaround,
                    summary: {
                        totalCabinCharges: Number(totalCabinCharges.toFixed(2)),
                        cabinOrdersCount,
                        averageDurationMinutes: cabinOrdersCount > 0 ? Math.round(totalCabinDurationMinutes / cabinOrdersCount) : 0
                    }
                }
            }
        });
    } catch (err) {
        next(err);
    }
};

// 2. Financial & Payment Reports
const getFinancialPaymentsReport = async (req, res, next) => {
    try {
        const { startDate, endDate, period } = req.query;
        const { start, end } = parseDateRange(startDate, endDate, period);

        // Fetch completed orders within range
        const orders = await Order.find({
            orderStatus: "Completed",
            createdAt: { $gte: start, $lte: end }
        });

        // A. Sales & Payment Method Breakdown
        const paymentMap = {};
        orders.forEach(order => {
            let method = order.paymentMethod ? String(order.paymentMethod).trim() : "Unknown";
            const lower = method.toLowerCase();

            if (lower === "cash") method = "Cash";
            else if (lower === "card") method = "Card";
            else if (lower === "fonepay") method = "Fonepay";
            else if (lower === "credit") method = "Credit";
            else if (lower === "cheque" || lower === "check") method = "Cheque";
            else if (method && method !== "Unknown") {
                method = method.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
            }

            const key = method.toLowerCase();
            const rev = order.bills?.totalWithTax || 0;

            if (!paymentMap[key]) {
                paymentMap[key] = {
                    paymentMethod: method,
                    ordersCount: 0,
                    revenue: 0
                };
            }
            paymentMap[key].ordersCount += 1;
            paymentMap[key].revenue += rev;
        });

        const paymentBreakdown = Object.values(paymentMap).map(p => ({
            ...p,
            revenue: Number(p.revenue.toFixed(2))
        })).sort((a, b) => b.revenue - a.revenue);

        // B. Tax & VAT Report
        let taxableSales = 0;
        let nonTaxableSales = 0;
        let vatCollected = 0;

        orders.forEach(order => {
            const bills = order.bills || {};
            const totalBeforeTax = bills.total || 0;
            const tax = bills.tax || 0;

            if (tax > 0) {
                taxableSales += totalBeforeTax;
                vatCollected += tax;
            } else {
                nonTaxableSales += totalBeforeTax;
            }
        });

        const taxVatReport = {
            taxableSales: Number(taxableSales.toFixed(2)),
            nonTaxableSales: Number(nonTaxableSales.toFixed(2)),
            vatCollected: Number(vatCollected.toFixed(2)),
            totalRevenue: Number((taxableSales + nonTaxableSales + vatCollected).toFixed(2))
        };

        // C. Credit Waiver & Outstanding Ledger (Creditor Report)
        const creditors = await Creditor.find({ isDeleted: { $ne: true } });
        const creditorLedger = creditors.map(c => {
            const history = (c.creditHistory || []).filter(h => {
                const ts = new Date(h.timestamp);
                return ts >= start && ts <= end;
            });

            let creditGiven = 0;
            let paymentsReceived = 0;
            let waiversGranted = 0;

            history.forEach(h => {
                if (h.type === "credit") creditGiven += h.amount;
                else if (h.type === "payment") paymentsReceived += h.amount;
                else if (h.type === "waiver") waiversGranted += h.amount;
            });

            return {
                id: c._id,
                name: c.name,
                phone: c.phone,
                creditLimit: c.creditLimit,
                currentBalance: c.currentBalance,
                creditGiven: Number(creditGiven.toFixed(2)),
                paymentsReceived: Number(paymentsReceived.toFixed(2)),
                waiversGranted: Number(waiversGranted.toFixed(2)),
                history
            };
        });

        // D. Void & Cancelled Items Audit
        const cancelledOrders = await Order.find({
            orderStatus: { $in: ["Cancelled", "Rejected"] },
            createdAt: { $gte: start, $lte: end }
        });

        const voidAudit = cancelledOrders.map(order => {
            // Try to find the cancellation info from timeline
            const cancelTimeline = (order.timeline || [])
                .find(t => t.action === "Status Changed" && (t.details.includes("Cancelled") || t.details.includes("Rejected")));
            
            const cancelledBy = cancelTimeline ? cancelTimeline.user : "System/Staff";
            
            return {
                orderId: order._id,
                orderNo: order.orderNo ? String(order.orderNo).padStart(3, '0') : order._id.toString().slice(-6).toUpperCase(),
                date: order.createdAt,
                totalAmount: order.bills?.totalWithTax || 0,
                cancelledBy,
                reason: order.remarks || "No reason specified",
                items: (order.items || []).map(i => `${i.quantity}x ${i.name}`).join(", ")
            };
        }).sort((a, b) => new Date(b.date) - new Date(a.date));

        res.status(200).json({
            success: true,
            data: {
                paymentBreakdown,
                taxVatReport,
                creditorLedger,
                voidAudit
            }
        });
    } catch (err) {
        next(err);
    }
};

// 3. Stock & Inventory Reports
const getStockInventoryReport = async (req, res, next) => {
    try {
        const { startDate, endDate, period } = req.query;
        const { start, end } = parseDateRange(startDate, endDate, period);

        // A. Current Stock & Reorder Report
        const lowStockItems = await Inventory.find({
            isDeleted: { $ne: true },
            $expr: { $lte: ["$currentStock", "$lowStockThreshold"] }
        }).populate("vendor");

        const reorderReport = lowStockItems.map(item => {
            const threshold = item.lowStockThreshold || 0;
            const current = item.currentStock || 0;
            const target = item.targetStock || threshold * 2;
            const needed = Math.max(0, target - current);

            return {
                id: item._id,
                name: item.name,
                unit: item.unit,
                currentStock: current,
                lowStockThreshold: threshold,
                targetStock: target,
                reorderNeeded: needed,
                vendorName: item.vendor ? item.vendor.name : "N/A"
            };
        });

        // B. Inventory Commodity Usage (COGS)
        const orders = await Order.find({
            orderStatus: "Completed",
            createdAt: { $gte: start, $lte: end }
        });

        const menuItems = await MenuItem.find({ isDeleted: { $ne: true } }).populate("recipe.inventoryItem");
        const recipeMap = {};
        menuItems.forEach(item => {
            recipeMap[item.name] = item.recipe || [];
        });

        const depletedMap = {};
        orders.forEach(order => {
            (order.items || []).forEach(item => {
                const recipe = recipeMap[item.name] || [];
                const qty = item.quantity || 0;

                recipe.forEach(rec => {
                    const invItem = rec.inventoryItem;
                    if (invItem) {
                        const id = invItem._id.toString();
                        if (!depletedMap[id]) {
                            depletedMap[id] = {
                                name: invItem.name,
                                unit: invItem.unit,
                                unitCost: invItem.cost || 0,
                                quantityUsed: 0
                            };
                        }
                        depletedMap[id].quantityUsed += (rec.ratio * qty);
                    }
                });
            });
        });

        const commodityUsage = Object.values(depletedMap).map(c => {
            const qty = Number(c.quantityUsed.toFixed(4));
            const totalCost = Number((qty * c.unitCost).toFixed(2));
            return {
                ...c,
                quantityUsed: qty,
                totalCost
            };
        }).sort((a, b) => b.totalCost - a.totalCost);

        const totalCOGSValue = commodityUsage.reduce((sum, item) => sum + item.totalCost, 0);

        // C. Vendor Purchase & Settlement Report
        const purchases = await Purchase.find({
            purchaseDate: { $gte: start, $lte: end }
        }).populate("item").populate("vendor");

        const vendorPurchMap = {};
        purchases.forEach(p => {
            if (!p.vendor) return;
            const vId = p.vendor._id.toString();
            const total = p.totalCost || 0;
            const paid = p.paidAmount || 0;

            if (!vendorPurchMap[vId]) {
                vendorPurchMap[vId] = {
                    vendorName: p.vendor.name,
                    purchasesCount: 0,
                    totalValue: 0,
                    paymentsMade: 0
                };
            }

            vendorPurchMap[vId].purchasesCount += 1;
            vendorPurchMap[vId].totalValue += total;
            vendorPurchMap[vId].paymentsMade += paid;
        });

        const vendorPurchases = Object.values(vendorPurchMap).map(v => ({
            ...v,
            totalValue: Number(v.totalValue.toFixed(2)),
            paymentsMade: Number(v.paymentsMade.toFixed(2)),
            outstandingBalance: Number((v.totalValue - v.paymentsMade).toFixed(2))
        })).sort((a, b) => b.totalValue - a.totalValue);

        res.status(200).json({
            success: true,
            data: {
                reorderReport,
                commodityUsage,
                totalCOGS: Number(totalCOGSValue.toFixed(2)),
                vendorPurchases
            }
        });
    } catch (err) {
        next(err);
    }
};

// 4. Expense & Cost Reports
const getExpensesCostsReport = async (req, res, next) => {
    try {
        const { startDate, endDate, period } = req.query;
        const { start, end } = parseDateRange(startDate, endDate, period);

        // Fetch operational expenses
        const expenses = await Expense.find({
            date: { $gte: start, $lte: end }
        }).populate("vendor").populate("staff");

        // A. Categorized Expense Report
        const expenseCategoryMap = {};
        let totalExpense = 0;

        expenses.forEach(e => {
            const cat = e.category || "Miscellaneous";
            const amt = e.amount || 0;

            if (!expenseCategoryMap[cat]) {
                expenseCategoryMap[cat] = {
                    category: cat,
                    totalAmount: 0
                };
            }
            expenseCategoryMap[cat].totalAmount += amt;
            totalExpense += amt;
        });

        const categorizedExpenses = Object.values(expenseCategoryMap).map(c => ({
            ...c,
            totalAmount: Number(c.totalAmount.toFixed(2))
        })).sort((a, b) => b.totalAmount - a.totalAmount);

        // B. Petty Cash Log (Expenses paid in cash)
        const pettyCash = expenses.filter(e => e.method === "Cash").map(e => ({
            id: e._id,
            date: e.date,
            description: e.description,
            category: e.category || "Miscellaneous",
            amount: e.amount,
            createdBy: e.createdBy || "Staff",
            recipientName: e.vendor ? e.vendor.name : (e.staff ? e.staff.name : "N/A")
        })).sort((a, b) => new Date(b.date) - new Date(a.date));

        res.status(200).json({
            success: true,
            data: {
                categorizedExpenses,
                totalExpense: Number(totalExpense.toFixed(2)),
                pettyCash
            }
        });
    } catch (err) {
        next(err);
    }
};

// 5. Profitability Analysis (Profit & Loss Snapshot)
const getProfitabilityReport = async (req, res, next) => {
    try {
        const { startDate, endDate, period } = req.query;
        const { start, end } = parseDateRange(startDate, endDate, period);

        // A. Gross Sales & Discounts (Completed Orders)
        const orders = await Order.find({
            orderStatus: "Completed",
            createdAt: { $gte: start, $lte: end }
        });

        let grossSales = 0;
        let discounts = 0;
        let taxCollected = 0;

        orders.forEach(order => {
            const bills = order.bills || {};
            grossSales += (bills.total || 0); // Excluding VAT
            discounts += (bills.discount || 0);
            taxCollected += (bills.tax || 0);
        });

        const netSales = grossSales - discounts;

        // B. COGS (Cost of Goods Sold from dynamic inventory usage)
        const menuItems = await MenuItem.find({ isDeleted: { $ne: true } }).populate("recipe.inventoryItem");
        const recipeMap = {};
        menuItems.forEach(item => {
            recipeMap[item.name] = item.recipe || [];
        });

        let cogs = 0;
        orders.forEach(order => {
            (order.items || []).forEach(item => {
                const recipe = recipeMap[item.name] || [];
                const qty = item.quantity || 0;

                recipe.forEach(rec => {
                    const invItem = rec.inventoryItem;
                    if (invItem) {
                        const unitCost = invItem.cost || 0;
                        cogs += (rec.ratio * qty * unitCost);
                    }
                });
            });
        });

        // C. Operating Expenses (Operational outflow)
        const expenses = await Expense.find({
            date: { $gte: start, $lte: end }
        });

        const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

        // D. Calculate margins and net profit
        const grossProfit = netSales - cogs;
        const netProfit = grossProfit - totalExpenses;

        const profitability = {
            grossSales: Number(grossSales.toFixed(2)),
            discounts: Number(discounts.toFixed(2)),
            netSales: Number(netSales.toFixed(2)),
            cogs: Number(cogs.toFixed(2)),
            grossProfit: Number(grossProfit.toFixed(2)),
            grossMarginPercentage: netSales > 0 ? Number(((grossProfit / netSales) * 100).toFixed(2)) : 0,
            operatingExpenses: Number(totalExpenses.toFixed(2)),
            netProfit: Number(netProfit.toFixed(2)),
            netMarginPercentage: netSales > 0 ? Number(((netProfit / netSales) * 100).toFixed(2)) : 0,
            taxCollected: Number(taxCollected.toFixed(2))
        };

        res.status(200).json({
            success: true,
            data: profitability
        });
    } catch (err) {
        next(err);
    }
};

// 6. CRM, Customer & Loyalty Reports
const getCrmLoyaltyReport = async (req, res, next) => {
    try {
        const { startDate, endDate, period } = req.query;
        const { start, end } = parseDateRange(startDate, endDate, period);

        // A. Customer Loyalty & Points Statement
        const customers = await Customer.find({ isDeleted: { $ne: true } });
        const loyaltyStatement = customers.map(cust => {
            const currentPoints = cust.points || 0;
            const pointsRedeemed = cust.pointsRedeemed || 0;
            return {
                id: cust._id,
                name: cust.name,
                phone: cust.phone,
                loyaltyPoints: currentPoints,
                redeemedPoints: pointsRedeemed,
                totalPointsEarned: currentPoints + pointsRedeemed,
                visits: cust.visits || 0,
                spent: cust.spent || 0
            };
        }).sort((a, b) => b.loyaltyPoints - a.loyaltyPoints);

        // B. Top Customers Report (by spend volume)
        const orders = await Order.find({
            orderStatus: "Completed",
            createdAt: { $gte: start, $lte: end }
        }).populate("customer");

        const customerSalesMap = {};
        orders.forEach(order => {
            const customerKey = order.customer ? order.customer._id.toString() : "Walk-in";
            const customerName = order.customer ? order.customer.name : "Walk-in Customers";
            const customerPhone = order.customer ? order.customer.phone : "N/A";
            const rev = order.bills?.totalWithTax || 0;

            if (!customerSalesMap[customerKey]) {
                customerSalesMap[customerKey] = {
                    customerName,
                    phone: customerPhone,
                    visitsCount: 0,
                    totalSpent: 0
                };
            }
            customerSalesMap[customerKey].visitsCount += 1;
            customerSalesMap[customerKey].totalSpent += rev;
        });

        const topCustomers = Object.values(customerSalesMap).map(cust => ({
            ...cust,
            totalSpent: Number(cust.totalSpent.toFixed(2))
        })).sort((a, b) => b.totalSpent - a.totalSpent);

        // C. Staff Performance & Order Attribution
        const staffAttributionMap = {};
        orders.forEach(order => {
            // Attributed to the user in first timeline placement or approval action
            const actorTimeline = (order.timeline || [])
                .find(t => t.action === "Status Changed" || t.action === "Approved" || t.action === "Order Placed" || t.action === "Items Added");
            
            const staffName = actorTimeline ? actorTimeline.user : "Staff/System";
            const totalWithTax = order.bills?.totalWithTax || 0;
            const guests = order.customerDetails?.guests || 0;

            if (!staffAttributionMap[staffName]) {
                staffAttributionMap[staffName] = {
                    staffName,
                    ordersCount: 0,
                    totalSales: 0,
                    guestsServed: 0
                };
            }

            staffAttributionMap[staffName].ordersCount += 1;
            staffAttributionMap[staffName].totalSales += totalWithTax;
            staffAttributionMap[staffName].guestsServed += guests;
        });

        const staffPerformance = Object.values(staffAttributionMap).map(s => ({
            ...s,
            totalSales: Number(s.totalSales.toFixed(2))
        })).sort((a, b) => b.totalSales - a.totalSales);

        res.status(200).json({
            success: true,
            data: {
                loyaltyStatement,
                topCustomers,
                staffPerformance
            }
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getSalesRevenueReport,
    getFinancialPaymentsReport,
    getStockInventoryReport,
    getExpensesCostsReport,
    getProfitabilityReport,
    getCrmLoyaltyReport
};
