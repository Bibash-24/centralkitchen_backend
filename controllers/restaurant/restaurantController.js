const RestaurantConfig = require("../../models/restaurant/restaurantModel");
const createHttpError = require("http-errors");

const getRestaurantConfig = async (req, res, next) => {
    try {
        let config = await RestaurantConfig.findOne();
        if (!config) {
            // Seed a default config if it doesn't exist yet
            config = new RestaurantConfig({ createdBy: "System" });
            await config.save();
        }

        let changed = false;
        if (!config.enabledModules || config.enabledModules.length === 0) {
            config.enabledModules = ["home", "orders", "tables", "sales", "expenses", "accounts", "inventory", "customers", "creditors", "vendors", "menuSetup", "tableSetup", "settings", "reports"];
            changed = true;
        }

        const reportSubmenus = ["sales-revenue", "financial-payments", "stock-inventory", "expenses-costs", "profitability", "crm-loyalty"];
        if (!config.enabledSubMenus || config.enabledSubMenus.length === 0) {
            config.enabledSubMenus = [
                "home-foh", "home-boh", "home-date-filter", "home-popular-dishes", "home-revenue-breakdown", "home-payment-mix", "home-expense-trend", "home-expense-breakdown", "home-order-distribution", "home-creditors-ledger", "home-loyalty-lifecycle",
                "items", "categories", "combos", "qr", "timings",
                "areas", "tables", "duplicateTable",
                "details", "ratios", "users", "superuser", "permissions",
                ...reportSubmenus
            ];
            changed = true;
        }

        if (changed) {
            await config.save();
        }
        res.status(200).json({
            success: true,
            message: "Restaurant configuration retrieved successfully!",
            data: config
        });
    } catch (error) {
        next(error);
    }
};

const updateRestaurantConfig = async (req, res, next) => {
    try {
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
            thermalPaperWidth
        } = req.body || {};

        const actorName = req.user 
            ? (req.user.email || String(req.user.phone || req.user.role)) 
            : "System";
        let config = await RestaurantConfig.findOne();
        if (!config) {
            config = new RestaurantConfig({ createdBy: actorName });
        }

        if (name !== undefined) config.name = name;
        if (contactNumbers !== undefined) {
            // Allow comma-separated strings or arrays
            if (Array.isArray(contactNumbers)) {
                config.contactNumbers = contactNumbers;
            } else if (typeof contactNumbers === "string") {
                config.contactNumbers = contactNumbers.split(",").map(num => num.trim()).filter(Boolean);
            }
        }
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

        config.updatedBy = actorName;
        config.updatedOn = new Date();

        await config.save();

        res.status(200).json({
            success: true,
            message: "Restaurant configuration updated successfully!",
            data: config
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { getRestaurantConfig, updateRestaurantConfig };
