const Order = require("../../models/order/orderModel");
const Inventory = require("../../models/inventory/inventoryModel");
const Expense = require("../../models/expense/expenseModel");
const Purchase = require("../../models/vendor/purchaseModel");
const Creditor = require("../../models/creditor/creditorModel");
const Customer = require("../../models/customer/customerModel");
const MenuItem = require("../../models/menuItem/menuItemModel");
const RestaurantConfig = require("../../models/restaurant/restaurantModel");

// Helper to parse date ranges
const parseDateRange = (startDate, endDate, period) => {
    let start = new Date("2000-01-01");
    let end = new Date();

    if (period) {
        const today = new Date();
        if (period === "all") {
            start = new Date("2000-01-01");
            end = new Date("2099-12-31");
        } else if (period === "today") {
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
        const { startDate, endDate, period, companySlug } = req.query;
        const targetCompany = companySlug || req.user?.companySlug;
        const companyFilter = targetCompany ? { companySlug: targetCompany } : {};
        const { start, end } = parseDateRange(startDate, endDate, period);

        // Fetch completed orders within range
        const orders = await Order.find({
            ...companyFilter,
            isDeleted: { $ne: true }, deliveryStatus: { $nin: ["Cancelled", "CANCELLED", "Returned", "RETURN_INITIATED"] }, orderStatus: { $nin: ["Cancelled", "CANCELLED", "Returned", "RETURN_INITIATED"] },
            createdAt: { $gte: start, $lte: end }
        });

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
            const salesVal = Number(order.totalAmount || order.total || order.grandTotal || order.amount || order.finalAmount || bills.totalWithTax || bills.total || (order.items || []).reduce((s, i) => s + (i.totalPrice || ((i.price || 0) * (i.quantity || 1))), 0) || 0);
            const taxVal = Number(order.tax || order.taxAmount || order.vat || bills.tax || 0);
            const discountVal = Number(order.discount || order.discountAmount || bills.discount || 0);
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
                const name = item.name || item.itemName || item.title || item.productName || (typeof item.menuItem === "object" ? item.menuItem?.name : item.menuItem) || "Unnamed Item";
                const qty = Number(item.quantity || item.qty || item.count || 1);
                const price = item.totalPrice || ((item.price || 0) * (item.quantity || 1));

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
        const menuItems = await MenuItem.find({ ...companyFilter, isDeleted: { $ne: true } }).populate("category");
        const categoryMap = {};
        menuItems.forEach(item => {
            categoryMap[item.name] = item.category?.name || "Uncategorized";
        });

        const categorySalesMap = {};
        orders.forEach(order => {
            (order.items || []).forEach(item => {
                const catName = categoryMap[item.name] || (item.categoryName ? item.categoryName : "Uncategorized");
                const qty = item.quantity || 0;
                const price = item.totalPrice || ((item.price || 0) * (item.quantity || 1));

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
            const rev = Number(order.totalAmount || order.total || order.grandTotal || order.amount || order.finalAmount || bills.totalWithTax || bills.total || (order.items || []).reduce((s, i) => s + (i.totalPrice || ((i.price || 0) * (i.quantity || 1))), 0) || 0);
            const taxVal = Number(order.tax || order.taxAmount || order.vat || bills.tax || 0);
            const discountVal = Number(order.discount || order.discountAmount || bills.discount || 0);
            const guestsVal = order.customerDetails?.guests || order.guests || 0;

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
        const { startDate, endDate, period, companySlug } = req.query;
        const targetCompany = companySlug || req.user?.companySlug;
        const companyFilter = (targetCompany && targetCompany !== "all") ? { companySlug: targetCompany } : {};
        const { start, end } = parseDateRange(startDate, endDate, period);

        // Fetch completed/active non-cancelled orders within range
        const orders = await Order.find({
            ...companyFilter,
            isDeleted: { $ne: true },
            deliveryStatus: { $nin: ["Cancelled", "CANCELLED", "Returned", "RETURN_INITIATED"] },
            orderStatus: { $nin: ["Cancelled", "CANCELLED", "Returned", "RETURN_INITIATED"] },
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
            else if (lower === "online") method = "Online";
            else if (method && method !== "Unknown") {
                method = method.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
            }

            const key = method.toLowerCase();
            const bills = order.bills || {};
            const rev = Number(order.totalAmount || order.total || order.grandTotal || bills.totalWithTax || bills.total || (order.items || []).reduce((s, i) => s + (i.totalPrice || ((i.price || 0) * (i.quantity || 1))), 0) || 0);

            if (!paymentMap[key]) {
                paymentMap[key] = {
                    paymentMethod: method,
                    ordersCount: 0,
                    revenue: 0,
                    totalAmount: 0,
                    transactionCount: 0,
                    count: 0
                };
            }
            paymentMap[key].ordersCount += 1;
            paymentMap[key].transactionCount += 1;
            paymentMap[key].count += 1;
            paymentMap[key].revenue += rev;
            paymentMap[key].totalAmount += rev;
        });

        const paymentBreakdown = Object.values(paymentMap).map(p => ({
            ...p,
            revenue: Number(p.revenue.toFixed(2)),
            totalAmount: Number(p.totalAmount.toFixed(2))
        })).sort((a, b) => b.revenue - a.revenue);

        // B. Tax & VAT Report
        let taxableSales = 0;
        let nonTaxableSales = 0;
        let vatCollected = 0;

        orders.forEach(order => {
            const bills = order.bills || {};
            const total = Number(order.totalAmount || order.total || order.grandTotal || bills.totalWithTax || bills.total || 0);
            const tax = Number(order.tax || order.taxAmount || order.vat || bills.tax || 0);

            if (tax > 0) {
                taxableSales += (bills.total || (total - tax));
                vatCollected += tax;
            } else {
                nonTaxableSales += total;
            }
        });

        const taxVatReport = {
            taxableSales: Number(taxableSales.toFixed(2)),
            nonTaxableSales: Number(nonTaxableSales.toFixed(2)),
            vatCollected: Number(vatCollected.toFixed(2)),
            totalRevenue: Number((taxableSales + nonTaxableSales + vatCollected).toFixed(2))
        };

        // C. Credit Waiver & Outstanding Ledger (Creditor Report)
        const creditors = await Creditor.find({ ...companyFilter, isDeleted: { $ne: true } });
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
            ...companyFilter,
            $or: [
                { orderStatus: { $in: ["Cancelled", "CANCELLED", "Rejected"] } },
                { deliveryStatus: { $in: ["Cancelled", "CANCELLED", "Rejected"] } }
            ],
            createdAt: { $gte: start, $lte: end }
        });

        const voidAudit = cancelledOrders.map(order => {
            // Try to find the cancellation info from timeline
            const cancelTimeline = (order.timeline || [])
                .find(t => t.action === "Status Changed" && (String(t.details).includes("Cancelled") || String(t.details).includes("Rejected")));
            
            const cancelledBy = cancelTimeline ? cancelTimeline.user : (order.cancelledBy || order.createdBy || "System/Staff");
            const orderTotal = Number(order.totalAmount || order.total || order.grandTotal || order.bills?.totalWithTax || order.bills?.total || 0);
            
            return {
                orderId: order._id,
                orderNo: order.orderNo ? String(order.orderNo) : order._id.toString().slice(-6).toUpperCase(),
                date: order.createdAt,
                totalAmount: orderTotal,
                cancelledBy,
                reason: order.remarks || order.reason || order.cancellationReason || "No reason specified",
                items: (order.items || []).map(i => `${i.quantity}x ${i.name}`).join(", ")
            };
        }).sort((a, b) => new Date(b.date) - new Date(a.date));

        // E. Return & Refund Audit
        const returnedOrders = await Order.find({
            ...companyFilter,
            isDeleted: { $ne: true },
            $or: [
                { deliveryStatus: { $in: ["Returned", "RETURN_INITIATED"] } },
                { orderStatus: { $in: ["Returned", "RETURN_INITIATED"] } },
                { paymentStatus: "Refunded" },
                { returnReason: { $exists: true, $ne: "" } }
            ],
            $and: [
                {
                    $or: [
                        { returnedAt: { $gte: start, $lte: end } },
                        { refundProcessedAt: { $gte: start, $lte: end } },
                        { createdAt: { $gte: start, $lte: end } }
                    ]
                }
            ]
        });

        const returnRefundAudit = returnedOrders.map(order => {
            const isCompleted = order.deliveryStatus === "Returned" || order.paymentStatus === "Refunded";
            const orderTotal = Number(order.totalAmount || order.total || order.grandTotal || order.bills?.totalWithTax || order.bills?.total || (order.items || []).reduce((s, i) => s + (i.totalPrice || ((i.price || 0) * (i.quantity || 1))), 0) || 0);
            const returnTimeline = (order.timeline || [])
                .find(t => String(t.action || "").includes("Return") || String(t.details || "").includes("Return") || String(t.action || "").includes("Refund"));
            const processedBy = order.returnedBy || order.refundProcessedBy || (returnTimeline ? returnTimeline.user : order.createdBy) || "Staff";
            const eventDate = order.returnedAt || order.refundProcessedAt || (returnTimeline ? returnTimeline.timestamp || returnTimeline.time : order.updatedAt) || order.createdAt;

            return {
                orderId: order._id,
                orderNo: order.orderNo ? String(order.orderNo) : order._id.toString().slice(-6).toUpperCase(),
                date: eventDate,
                totalAmount: orderTotal,
                status: isCompleted ? "Returned & Refunded" : "Return Initiated",
                isCompleted,
                returnType: order.returnType || order.refundMethod || (isCompleted ? "Standard Refund" : "Pending Method"),
                reason: order.returnReason || order.reason || "Not specified",
                notes: order.returnNotes || order.refundNotes || order.remarks || "",
                processedBy,
                recipientName: order.recipientName || order.customerName || order.customerDetails?.name || "Customer",
                recipientPhone: order.recipientPhone || order.customerPhone || order.customerDetails?.phone || "",
                items: (order.items || []).map(i => `${i.quantity}x ${i.name}`).join(", ")
            };
        }).sort((a, b) => new Date(b.date) - new Date(a.date));

        res.status(200).json({
            success: true,
            data: {
                paymentBreakdown,
                taxVatReport,
                creditorLedger,
                voidAudit,
                returnRefundAudit
            }
        });
    } catch (err) {
        next(err);
    }
};

// 3. Stock & Inventory Reports
const getStockInventoryReport = async (req, res, next) => {
    try {
        const { startDate, endDate, period, companySlug } = req.query;
        const targetCompany = companySlug || req.user?.companySlug;
        const companyFilter = (targetCompany && targetCompany !== "all") ? { companySlug: targetCompany } : {};
        const { start, end } = parseDateRange(startDate, endDate, period);

        // A. Current Stock & Reorder Report
        const inventoryItems = await Inventory.find({
            ...companyFilter,
            isDeleted: { $ne: true }
        }).populate("vendor");

        const reorderReport = inventoryItems.map(item => {
            const threshold = item.lowStockThreshold || 0;
            const current = item.currentStock || 0;
            const target = item.targetStock || (threshold > 0 ? threshold * 2 : 10);
            const needed = Math.max(0, target - current);

            return {
                id: item._id,
                name: item.name,
                unit: item.unit || "unit",
                currentStock: current,
                lowStockThreshold: threshold,
                targetStock: target,
                reorderNeeded: needed,
                vendorName: item.vendor ? (item.vendor.name || "Vendor") : "N/A"
            };
        }).sort((a, b) => b.reorderNeeded - a.reorderNeeded);

        // B. Inventory / Product COGS & Commodity Usage
        const orders = await Order.find({
            ...companyFilter,
            isDeleted: { $ne: true },
            deliveryStatus: { $nin: ["Cancelled", "CANCELLED", "Returned", "RETURN_INITIATED"] },
            orderStatus: { $nin: ["Cancelled", "CANCELLED", "Returned", "RETURN_INITIATED"] },
            createdAt: { $gte: start, $lte: end }
        });

        const config = await RestaurantConfig.findOne({ ...companyFilter });
        const menuItems = await MenuItem.find({ ...companyFilter, isDeleted: { $ne: true } }).populate("recipe.inventoryItem");
        const purchases = await Purchase.find({
            ...companyFilter,
            $or: [
                { purchaseDate: { $gte: start, $lte: end } },
                { createdAt: { $gte: start, $lte: end } }
            ]
        }).populate("item").populate("vendor");

        const hasRecipes = menuItems.some(i => i.recipe && i.recipe.length > 0);
        const isCommodityRatioEnabled = config?.enableCommodityRatio !== false && hasRecipes;

        const depletedMap = {};
        const menuItemById = {};
        const recipeMap = {};
        menuItems.forEach(item => {
            menuItemById[item._id.toString()] = item;
            recipeMap[item.name.toLowerCase().trim()] = item.recipe || [];
        });

        const invMap = {};
        inventoryItems.forEach(inv => {
            invMap[inv.name.toLowerCase().trim()] = inv;
            invMap[inv._id.toString()] = inv;
        });

        const purchasePriceMap = {};
        purchases.forEach(p => {
            if (p.item) {
                const itemId = p.item._id ? p.item._id.toString() : p.item.toString();
                const uCost = p.unitCost || (p.quantity > 0 ? p.totalCost / p.quantity : 0);
                if (uCost > 0) purchasePriceMap[itemId] = uCost;
            }
        });

        orders.forEach(order => {
            (order.items || []).forEach(item => {
                const rawName = item.name || item.itemName || "Item";
                const baseName = rawName.replace(/\s*\([^)]*\)\s*$/, "").trim();
                const menuItem = (item.menuItemId && menuItemById[item.menuItemId.toString()]) || null;
                const effectiveName = menuItem?.name || baseName;
                const cleanEffectiveName = effectiveName.toLowerCase().trim();
                const qty = item.quantity || 1;
                const recipe = (menuItem?.recipe && menuItem.recipe.length > 0)
                    ? menuItem.recipe
                    : (recipeMap[cleanEffectiveName] || recipeMap[rawName.toLowerCase().trim()] || []);

                if (isCommodityRatioEnabled && recipe.length > 0) {
                    recipe.forEach(rec => {
                        const invItem = rec.inventoryItem;
                        if (invItem) {
                            const id = invItem._id ? invItem._id.toString() : String(invItem);
                            const resolvedInv = invMap[id] || (typeof invItem === 'object' ? invItem : null);
                            const unitCost = Number(resolvedInv?.cost) || Number(purchasePriceMap[id]) || 0;
                            const commName = resolvedInv?.name || effectiveName;
                            const commUnit = resolvedInv?.unit || "unit";

                            if (!depletedMap[id]) {
                                depletedMap[id] = {
                                    name: commName,
                                    unit: commUnit,
                                    unitCost,
                                    quantityUsed: 0
                                };
                            }
                            depletedMap[id].quantityUsed += ((Number(rec.ratio) || 0) * qty);
                        }
                    });
                } else {
                    const invItem = invMap[cleanEffectiveName] 
                        || invMap[rawName.toLowerCase().trim()] 
                        || (menuItem ? invMap[menuItem._id.toString()] : null);
                    const id = invItem ? invItem._id.toString() : (menuItem ? menuItem._id.toString() : cleanEffectiveName);
                    const unitCost = Number(invItem?.cost) 
                        || (invItem ? Number(purchasePriceMap[invItem._id.toString()]) : 0) 
                        || (menuItem && purchasePriceMap[menuItem._id.toString()] ? Number(purchasePriceMap[menuItem._id.toString()]) : 0)
                        || Number(item.costPrice || item.price || 0);

                    if (!depletedMap[id]) {
                        depletedMap[id] = {
                            name: invItem?.name || effectiveName,
                            unit: invItem?.unit || "unit",
                            unitCost,
                            quantityUsed: 0
                        };
                    }
                    depletedMap[id].quantityUsed += qty;
                }
            });
        });

        const commodityUsage = Object.values(depletedMap).map(c => {
            const qty = Number(c.quantityUsed.toFixed(4));
            const totalCost = Number((qty * c.unitCost).toFixed(2));
            return {
                ...c,
                quantityUsed: qty,
                usedQty: qty,
                totalCost,
                totalCogsCost: totalCost
            };
        }).sort((a, b) => b.totalCost - a.totalCost);

        const totalCOGSValue = commodityUsage.reduce((sum, item) => sum + item.totalCost, 0);

        // C. Vendor Purchase & Settlement Report
        const vendorPurchMap = {};
        purchases.forEach(p => {
            const vId = p.vendor ? (p.vendor._id ? p.vendor._id.toString() : String(p.vendor)) : "direct-purchase";
            const vendorName = p.vendor ? (p.vendor.name || "Vendor") : "Direct / Unassigned Vendor";
            const total = Number(p.totalCost) || 0;
            const paid = Number(p.paidAmount) || 0;

            if (!vendorPurchMap[vId]) {
                vendorPurchMap[vId] = {
                    vendorName,
                    purchasesCount: 0,
                    totalValue: 0,
                    totalAmount: 0,
                    paymentsMade: 0,
                    outstandingBalance: 0
                };
            }

            vendorPurchMap[vId].purchasesCount += 1;
            vendorPurchMap[vId].totalValue += total;
            vendorPurchMap[vId].totalAmount += total;
            vendorPurchMap[vId].paymentsMade += paid;
        });

        const vendorPurchases = Object.values(vendorPurchMap).map(v => ({
            ...v,
            totalValue: Number(v.totalValue.toFixed(2)),
            totalAmount: Number(v.totalValue.toFixed(2)),
            paymentsMade: Number(v.paymentsMade.toFixed(2)),
            outstandingBalance: Number(Math.max(0, v.totalValue - v.paymentsMade).toFixed(2))
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
        const { startDate, endDate, period, companySlug } = req.query;
        const targetCompany = companySlug || req.user?.companySlug;
        const companyFilter = targetCompany ? { companySlug: targetCompany } : {};
        const { start, end } = parseDateRange(startDate, endDate, period);

        // Fetch operational expenses
        const expenses = await Expense.find({
            ...companyFilter,
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
        const { startDate, endDate, period, companySlug } = req.query;
        const targetCompany = companySlug || req.user?.companySlug;
        const companyFilter = (targetCompany && targetCompany !== "all") ? { companySlug: targetCompany } : {};
        const { start, end } = parseDateRange(startDate, endDate, period);

        // A. Gross Sales & Discounts (Completed Orders)
        const orders = await Order.find({
            ...companyFilter,
            isDeleted: { $ne: true },
            deliveryStatus: { $nin: ["Cancelled", "CANCELLED", "Returned", "RETURN_INITIATED"] },
            orderStatus: { $nin: ["Cancelled", "CANCELLED", "Returned", "RETURN_INITIATED"] },
            createdAt: { $gte: start, $lte: end }
        });

        let grossSales = 0;
        let discounts = 0;
        let taxCollected = 0;

        orders.forEach(order => {
            const bills = order.bills || {};
            const orderAmt = Number(order.totalAmount || order.total || order.grandTotal || bills.totalWithTax || bills.total || (order.items || []).reduce((s, i) => s + (i.totalPrice || ((i.price || 0) * (i.quantity || 1))), 0) || 0);
            const discountAmt = Number(order.discount || order.discountAmount || bills.discount || 0);
            const taxAmt = Number(order.tax || order.taxAmount || order.vat || bills.tax || 0);

            grossSales += orderAmt;
            discounts += discountAmt;
            taxCollected += taxAmt;
        });

        const netSales = Math.max(0, grossSales - discounts);

        // B. COGS (Cost of Goods Sold from Commodity Ratios OR Product Purchases)
        const config = await RestaurantConfig.findOne({ ...companyFilter });
        const menuItems = await MenuItem.find({ ...companyFilter, isDeleted: { $ne: true } }).populate("recipe.inventoryItem");
        const inventoryItems = await Inventory.find({ ...companyFilter, isDeleted: { $ne: true } });
        const purchases = await Purchase.find({
            ...companyFilter,
            $or: [
                { purchaseDate: { $gte: start, $lte: end } },
                { createdAt: { $gte: start, $lte: end } }
            ]
        }).populate("item");

        const hasRecipes = menuItems.some(i => i.recipe && i.recipe.length > 0);
        const isCommodityRatioEnabled = config?.enableCommodityRatio !== false && hasRecipes;

        const menuItemById = {};
        const recipeMap = {};
        menuItems.forEach(item => {
            menuItemById[item._id.toString()] = item;
            recipeMap[item.name.toLowerCase().trim()] = item.recipe || [];
        });

        const invMap = {};
        inventoryItems.forEach(inv => {
            invMap[inv.name.toLowerCase().trim()] = inv;
            invMap[inv._id.toString()] = inv;
        });

        const purchasePriceMap = {};
        purchases.forEach(p => {
            if (p.item) {
                const itemId = p.item._id ? p.item._id.toString() : p.item.toString();
                const uCost = p.unitCost || (p.quantity > 0 ? p.totalCost / p.quantity : 0);
                if (uCost > 0) purchasePriceMap[itemId] = uCost;
            }
        });

        let cogs = 0;
        orders.forEach(order => {
            (order.items || []).forEach(item => {
                const rawName = item.name || item.itemName || "Item";
                const baseName = rawName.replace(/\s*\([^)]*\)\s*$/, "").trim();
                const menuItem = (item.menuItemId && menuItemById[item.menuItemId.toString()]) || null;
                const effectiveName = menuItem?.name || baseName;
                const cleanEffectiveName = effectiveName.toLowerCase().trim();
                const qty = item.quantity || 1;
                const recipe = (menuItem?.recipe && menuItem.recipe.length > 0)
                    ? menuItem.recipe
                    : (recipeMap[cleanEffectiveName] || recipeMap[rawName.toLowerCase().trim()] || []);

                if (isCommodityRatioEnabled && recipe.length > 0) {
                    recipe.forEach(rec => {
                        const invItem = rec.inventoryItem;
                        if (invItem) {
                            const id = invItem._id ? invItem._id.toString() : String(invItem);
                            const resolvedInv = invMap[id] || (typeof invItem === 'object' ? invItem : null);
                            const unitCost = Number(resolvedInv?.cost) || Number(purchasePriceMap[id]) || 0;
                            cogs += ((Number(rec.ratio) || 0) * qty * unitCost);
                        }
                    });
                } else {
                    const invItem = invMap[cleanEffectiveName] 
                        || invMap[rawName.toLowerCase().trim()] 
                        || (menuItem ? invMap[menuItem._id.toString()] : null);
                    const unitCost = Number(invItem?.cost) 
                        || (invItem ? Number(purchasePriceMap[invItem._id.toString()]) : 0) 
                        || (menuItem && purchasePriceMap[menuItem._id.toString()] ? Number(purchasePriceMap[menuItem._id.toString()]) : 0)
                        || Number(item.costPrice || item.price || 0);
                    cogs += (qty * unitCost);
                }
            });
        });

        // C. Operating Expenses (Operational outflow)
        const expenses = await Expense.find({
            ...companyFilter,
            $or: [
                { date: { $gte: start, $lte: end } },
                { createdAt: { $gte: start, $lte: end } }
            ]
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
        const { startDate, endDate, period, companySlug } = req.query;
        const targetCompany = companySlug || req.user?.companySlug;
        const companyFilter = (targetCompany && targetCompany !== "all") ? { companySlug: targetCompany } : {};
        const { start, end } = parseDateRange(startDate, endDate, period);

        // A. Orders within range
        const orders = await Order.find({
            ...companyFilter,
            isDeleted: { $ne: true },
            deliveryStatus: { $nin: ["Cancelled", "CANCELLED", "Returned", "RETURN_INITIATED"] },
            orderStatus: { $nin: ["Cancelled", "CANCELLED", "Returned", "RETURN_INITIATED"] },
            createdAt: { $gte: start, $lte: end }
        });

        // B. Registered Customers lookup
        const registeredCustomers = await Customer.find({
            ...companyFilter,
            isDeleted: { $ne: true }
        });

        const customerByPhone = {};
        const customerByName = {};
        registeredCustomers.forEach(c => {
            if (c.phone) customerByPhone[c.phone.trim()] = c;
            if (c.name) customerByName[c.name.toLowerCase().trim()] = c;
        });

        // C. Group orders by client/customer
        const customerSalesMap = {};
        orders.forEach(order => {
            const phone = (order.recipientPhone || "").trim();
            const name = (order.recipientName || order.franchise || "Client").trim();
            const key = phone || name.toLowerCase();

            const rev = Number(order.totalAmount || order.total || order.grandTotal || order.bills?.totalWithTax || order.bills?.total || (order.items || []).reduce((s, i) => s + (i.totalPrice || ((i.price || 0) * (i.quantity || 1))), 0) || 0);

            const matchedCustomer = customerByPhone[phone] || customerByName[name.toLowerCase()] || null;

            if (!customerSalesMap[key]) {
                customerSalesMap[key] = {
                    id: matchedCustomer?._id ? matchedCustomer._id.toString() : order._id.toString(),
                    customerName: matchedCustomer?.name || name,
                    phone: phone || matchedCustomer?.phone || "N/A",
                    address: order.deliveryAddress || matchedCustomer?.address || "",
                    ordersCount: 0,
                    totalSpent: 0,
                    creditLimit: matchedCustomer?.creditLimit ?? null,
                    currentBalance: matchedCustomer?.currentBalance ?? null,
                    isRegistered: Boolean(matchedCustomer),
                    lastOrderDate: order.createdAt
                };
            }

            customerSalesMap[key].ordersCount += 1;
            customerSalesMap[key].totalSpent += rev;
            if (new Date(order.createdAt) > new Date(customerSalesMap[key].lastOrderDate)) {
                customerSalesMap[key].lastOrderDate = order.createdAt;
            }
        });

        const topCustomers = Object.values(customerSalesMap).map(cust => {
            const spent = Number(cust.totalSpent.toFixed(2));
            const count = cust.ordersCount;
            return {
                ...cust,
                totalSpent: spent,
                averageOrderValue: count > 0 ? Number((spent / count).toFixed(2)) : 0
            };
        }).sort((a, b) => b.totalSpent - a.totalSpent);

        // D. Staff & Rider Delivery Performance
        const staffAttributionMap = {};
        orders.forEach(order => {
            const staffName = order.rider?.name || order.createdBy || "Unassigned Rider";
            const totalWithTax = Number(order.totalAmount || order.total || order.grandTotal || order.bills?.totalWithTax || order.bills?.total || 0);

            if (!staffAttributionMap[staffName]) {
                staffAttributionMap[staffName] = {
                    staffName,
                    ordersCount: 0,
                    totalSales: 0
                };
            }

            staffAttributionMap[staffName].ordersCount += 1;
            staffAttributionMap[staffName].totalSales += totalWithTax;
        });

        const staffPerformance = Object.values(staffAttributionMap).map(s => ({
            ...s,
            totalSales: Number(s.totalSales.toFixed(2)),
            deliveriesCompleted: s.ordersCount,
            totalDeliveryVolume: Number(s.totalSales.toFixed(2)),
            averageDeliveryValue: s.ordersCount > 0 ? Number((s.totalSales / s.ordersCount).toFixed(2)) : 0
        })).sort((a, b) => b.totalSales - a.totalSales);

        res.status(200).json({
            success: true,
            data: {
                topCustomers,
                clientSummary: topCustomers,
                loyaltyStatement: topCustomers,
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
