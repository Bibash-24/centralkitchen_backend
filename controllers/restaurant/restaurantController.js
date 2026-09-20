const RestaurantConfig = require("../../models/restaurant/restaurantModel");
const Company = require("../../models/company/companyModel");
const createHttpError = require("http-errors");

const getRestaurantConfig = async (req, res, next) => {
    try {
        const userSlug = req.user?.companySlug || req.headers["x-company-slug"];
        let company = null;
        if (userSlug) {
            company = await Company.findOne({ companySlug: String(userSlug).toLowerCase() });
        }

        let config = null;
        if (userSlug) {
            config = await RestaurantConfig.findOne({ slug: String(userSlug).toLowerCase() });
        }
        if (!config) {
            config = await RestaurantConfig.findOne();
        }

        const reportSubmenus = ["sales-revenue", "financial-payments", "stock-inventory", "expenses-costs", "profitability", "crm-loyalty"];
        const defaultModules = ["home", "orders", "tables", "sales", "expenses", "accounts", "inventory", "customers", "creditors", "vendors", "menuSetup", "tableSetup", "settings", "reports"];
        const defaultSubMenus = [
            "home-foh", "home-boh", "home-date-filter", "home-popular-dishes", "home-revenue-breakdown", "home-payment-mix", "home-expense-trend", "home-expense-breakdown", "home-order-distribution", "home-creditors-ledger", "home-loyalty-lifecycle",
            "items", "categories", "combos", "qr", "timings",
            "areas", "tables", "duplicateTable",
            "details", "ratios", "users", "superuser", "permissions",
            ...reportSubmenus
        ];

        let responseData = config ? config.toObject() : {
            name: "Central Kitchen",
            enabledModules: defaultModules,
            enabledSubMenus: defaultSubMenus
        };

        if (company) {
            responseData.name = company.name || responseData.name;
            responseData.address = company.address || responseData.address;
            responseData.panNumber = company.panNumber || responseData.panNumber;
            responseData.defaultCurrency = company.defaultCurrency || responseData.defaultCurrency;
            responseData.openingTime = company.openingTime || responseData.openingTime;
            responseData.closingTime = company.closingTime || responseData.closingTime;
            responseData.isVatApplicable = company.isVatApplicable !== undefined ? company.isVatApplicable : responseData.isVatApplicable;
            responseData.logo = company.logo || responseData.logo;
            responseData.paymentQrCode = company.paymentQrCode || responseData.paymentQrCode;
            responseData.contactNumbers = company.contactPhone ? [company.contactPhone] : responseData.contactNumbers;
            responseData.orderNoPrefix = company.orderNoPrefix || responseData.orderNoPrefix;
            responseData.orderCounter = company.orderCounter || responseData.orderCounter;
        }

        res.status(200).json({
            success: true,
            message: "Restaurant configuration retrieved successfully!",
            data: responseData
        });
    } catch (error) {
        next(error);
    }
};

const updateRestaurantConfig = async (req, res, next) => {
    try {
        const userSlug = req.user?.companySlug || req.headers["x-company-slug"];
        const {
            name,
            contactNumbers,
            address,
            panNumber,
            defaultCurrency,
            enabledModules,
            enabledSubMenus,
            logo,
            paymentQrCode,
            slogan,
            openingTime,
            closingTime,
            primaryColor,
            secondaryColor,
            crmEnabled,
            crmPointsEarnRate,
            crmPointsRedeemRate,
            creditEnabled,
            creditMaxLimit,
            creditGracePeriod,
            creditAlertThreshold,
            creditOverdueNotificationEnabled,
            creditOverdueDays,
            creditOverdueNotifyRoles,
            lowStockAlertEnabled,
            lowStockNotificationEnabled,
            lowStockNotifyRoles,
            lowStockReminderPercentage,
            lowStockAlertPercentage,
            chequeNotificationEnabled,
            chequeNotifyRoles,
            chequeDueDaysNotify,
            isVatApplicable,
            vatPercentage,
            wifiPrinterIp,
            wifiPrinterPort,
            thermalPaperWidth,
            orderNoPrefix,
            orderCounter
        } = req.body;

        const actorName = req.user ? (req.user.name || req.user.username) : "System";

        let config = null;
        if (userSlug) {
            config = await RestaurantConfig.findOne({ slug: String(userSlug).toLowerCase() });
        }
        if (!config) {
            config = await RestaurantConfig.findOne();
        }

        // If no RestaurantConfig document exists, instantiate and save only upon explicit update
        if (!config) {
            config = new RestaurantConfig({ createdBy: actorName });
        }

        if (name) config.name = name;
        if (contactNumbers && Array.isArray(contactNumbers)) config.contactNumbers = contactNumbers;
        if (address !== undefined) config.address = address;
        if (panNumber !== undefined) config.panNumber = panNumber;
        if (defaultCurrency !== undefined) config.defaultCurrency = defaultCurrency;
        if (enabledModules !== undefined && Array.isArray(enabledModules)) {
            config.enabledModules = enabledModules;
        }
        if (enabledSubMenus !== undefined && Array.isArray(enabledSubMenus)) {
            config.enabledSubMenus = enabledSubMenus;
        }
        if (logo !== undefined) config.logo = logo;
        if (paymentQrCode !== undefined) config.paymentQrCode = paymentQrCode;
        if (slogan !== undefined) config.slogan = slogan;
        if (openingTime !== undefined) config.openingTime = openingTime;
        if (closingTime !== undefined) config.closingTime = closingTime;
        if (primaryColor !== undefined) config.primaryColor = primaryColor;
        if (secondaryColor !== undefined) config.secondaryColor = secondaryColor;

        if (crmEnabled !== undefined) config.crmEnabled = crmEnabled;
        if (crmPointsEarnRate !== undefined) config.crmPointsEarnRate = crmPointsEarnRate;
        if (crmPointsRedeemRate !== undefined) config.crmPointsRedeemRate = crmPointsRedeemRate;

        if (creditEnabled !== undefined) config.creditEnabled = creditEnabled;
        if (creditMaxLimit !== undefined) config.creditMaxLimit = creditMaxLimit;
        if (creditGracePeriod !== undefined) config.creditGracePeriod = creditGracePeriod;
        if (creditAlertThreshold !== undefined) config.creditAlertThreshold = creditAlertThreshold;
        if (creditOverdueNotificationEnabled !== undefined) config.creditOverdueNotificationEnabled = creditOverdueNotificationEnabled;
        if (creditOverdueDays !== undefined) config.creditOverdueDays = creditOverdueDays;
        if (creditOverdueNotifyRoles !== undefined) config.creditOverdueNotifyRoles = creditOverdueNotifyRoles;

        if (lowStockAlertEnabled !== undefined) config.lowStockAlertEnabled = lowStockAlertEnabled;
        if (lowStockNotificationEnabled !== undefined) config.lowStockNotificationEnabled = lowStockNotificationEnabled;
        if (lowStockNotifyRoles !== undefined) config.lowStockNotifyRoles = lowStockNotifyRoles;
        if (lowStockReminderPercentage !== undefined) config.lowStockReminderPercentage = lowStockReminderPercentage;
        if (lowStockAlertPercentage !== undefined) config.lowStockAlertPercentage = lowStockAlertPercentage;

        if (chequeNotificationEnabled !== undefined) config.chequeNotificationEnabled = chequeNotificationEnabled;
        if (chequeNotifyRoles !== undefined) config.chequeNotifyRoles = chequeNotifyRoles;
        if (chequeDueDaysNotify !== undefined) config.chequeDueDaysNotify = chequeDueDaysNotify;

        if (isVatApplicable !== undefined) config.isVatApplicable = isVatApplicable;
        if (vatPercentage !== undefined) config.vatPercentage = vatPercentage;

        if (wifiPrinterIp !== undefined) config.wifiPrinterIp = String(wifiPrinterIp).trim();
        if (wifiPrinterPort !== undefined) config.wifiPrinterPort = Number(wifiPrinterPort) || 9100;
        if (thermalPaperWidth !== undefined) config.thermalPaperWidth = Number(thermalPaperWidth) || 48;

        if (orderNoPrefix !== undefined) config.orderNoPrefix = orderNoPrefix;
        if (orderCounter !== undefined) config.orderCounter = orderCounter;

        config.updatedBy = actorName;
        config.updatedOn = new Date();

        await config.save();

        // Also sync fields directly into Company model record if userSlug is available
        if (userSlug) {
            const compUpdates = {};
            if (address !== undefined) compUpdates.address = address;
            if (panNumber !== undefined) compUpdates.panNumber = panNumber;
            if (defaultCurrency !== undefined) compUpdates.defaultCurrency = defaultCurrency;
            if (openingTime !== undefined) compUpdates.openingTime = openingTime;
            if (closingTime !== undefined) compUpdates.closingTime = closingTime;
            if (isVatApplicable !== undefined) compUpdates.isVatApplicable = isVatApplicable;
            if (logo !== undefined) compUpdates.logo = logo;
            if (paymentQrCode !== undefined) compUpdates.paymentQrCode = paymentQrCode;
            if (orderNoPrefix !== undefined) compUpdates.orderNoPrefix = orderNoPrefix;
            if (orderCounter !== undefined) compUpdates.orderCounter = orderCounter;

            if (Object.keys(compUpdates).length > 0) {
                await Company.findOneAndUpdate(
                    { companySlug: String(userSlug).toLowerCase() },
                    compUpdates
                );
            }
        }

        res.status(200).json({
            success: true,
            message: "Company details updated successfully!",
            data: config
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { getRestaurantConfig, updateRestaurantConfig };
