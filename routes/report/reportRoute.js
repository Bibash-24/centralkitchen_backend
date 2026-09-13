const express = require("express");
const router = express.Router();
const { isVerifiedUser } = require("../../middlewares/tokenVerification");
const {
    getSalesRevenueReport,
    getFinancialPaymentsReport,
    getStockInventoryReport,
    getExpensesCostsReport,
    getProfitabilityReport,
    getCrmLoyaltyReport
} = require("../../controllers/report/reportController");

/**
 * @swagger
 * tags:
 *   name: Reports
 *   description: Analytical reports and business intelligence metrics
 */

/**
 * @swagger
 * /api/report/sales-revenue:
 *   get:
 *     summary: Retrieve sales and revenue analysis reports
 *     tags: [Reports]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date filter (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date filter (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Sales and revenue reports compiled successfully
 *       401:
 *         description: Unauthorized
 */
router.get("/sales-revenue", isVerifiedUser, getSalesRevenueReport);

/**
 * @swagger
 * /api/report/financial-payments:
 *   get:
 *     summary: Retrieve payment settlement, tax, outstanding credit, and void audit reports
 *     tags: [Reports]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date filter (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date filter (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Financial and payment reports compiled successfully
 *       401:
 *         description: Unauthorized
 */
router.get("/financial-payments", isVerifiedUser, getFinancialPaymentsReport);

/**
 * @swagger
 * /api/report/stock-inventory:
 *   get:
 *     summary: Retrieve low stock, dynamic COGS, and vendor purchase reports
 *     tags: [Reports]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date filter (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date filter (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Stock and inventory reports compiled successfully
 *       401:
 *         description: Unauthorized
 */
router.get("/stock-inventory", isVerifiedUser, getStockInventoryReport);

/**
 * @swagger
 * /api/report/expenses-costs:
 *   get:
 *     summary: Retrieve categorized expenses and petty cash ledger reports
 *     tags: [Reports]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date filter (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date filter (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Expenses and costs reports compiled successfully
 *       401:
 *         description: Unauthorized
 */
router.get("/expenses-costs", isVerifiedUser, getExpensesCostsReport);

/**
 * @swagger
 * /api/report/profitability:
 *   get:
 *     summary: Retrieve Profit and Loss (P&L) snapshot profitability analysis
 *     tags: [Reports]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date filter (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date filter (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Profitability report compiled successfully
 *       401:
 *         description: Unauthorized
 */
router.get("/profitability", isVerifiedUser, getProfitabilityReport);

/**
 * @swagger
 * /api/report/crm-loyalty:
 *   get:
 *     summary: Retrieve loyalty points statement, top customers, and staff performance reports
 *     tags: [Reports]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date filter (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date filter (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: CRM and loyalty reports compiled successfully
 *       401:
 *         description: Unauthorized
 */
router.get("/crm-loyalty", isVerifiedUser, getCrmLoyaltyReport);

module.exports = router;
