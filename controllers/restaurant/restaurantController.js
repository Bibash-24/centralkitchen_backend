const RestaurantConfig = require("../../models/restaurant/restaurantModel");
const Company = require("../../models/company/companyModel");

const getRestaurantConfig = async (req, res, next) => {
    try {
        const userSlug = req.query.companySlug || req.headers["x-company-slug"] || req.user?.companySlug;
        const cleanSlug = userSlug ? String(userSlug).toLowerCase().trim() : "";

        let company = null;
        if (cleanSlug) {
            company = await Company.findOne({ companySlug: cleanSlug, isDeleted: { $ne: true } });
        }

        let config = null;
        if (cleanSlug) {
            config = await RestaurantConfig.findOne({ companySlug: cleanSlug });
        }
        
        // Auto-create RestaurantConfig document for cleanSlug if not present
        if (!config && cleanSlug) {
            config = new RestaurantConfig({
                companySlug: cleanSlug,
                name: company?.name || "Company Profile",
                contactNumbers: company?.contactPhone ? [company.contactPhone] : []
            });
            await config.save();
        }

        if (!config) {
            config = await RestaurantConfig.findOne();
        }

        const reportSubmenus = ["sales-revenue", "financial-payments", "stock-inventory", "expenses-costs", "profitability", "crm-loyalty"];
        const defaultModules = ["home", "orders", "sales", "expenses", "accounts", "inventory", "customers", "creditors", "vendors", "menuSetup", "settings", "reports"];
        const defaultSubMenus = [
            "home-foh", "home-boh", "home-date-filter", "home-popular-dishes", "home-revenue-breakdown", "home-payment-mix", "home-expense-trend", "home-expense-breakdown", "home-order-distribution", "home-creditors-ledger", "home-loyalty-lifecycle",
            "items", "categories", "combos", "qr", "timings",
            "details", "ratios", "users", "superuser", "permissions",
            ...reportSubmenus
        ];

        let responseData = config ? config.toObject() : {
            name: "Central Kitchen"
        };

        // Source enabledModules and enabledSubMenus exclusively from Company DB
        responseData.enabledModules = company?.enabledModules !== undefined ? company.enabledModules : defaultModules;
        responseData.enabledSubMenus = company?.enabledSubMenus !== undefined ? company.enabledSubMenus : defaultSubMenus;

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
        const targetSlug = String(req.query.companySlug || req.body.companySlug || req.headers["x-company-slug"] || req.user?.companySlug || "").toLowerCase().trim();
        
        if (!targetSlug) {
            return res.status(400).json({ success: false, message: "Company identifier (companySlug) is required." });
        }

        const {
            name,
            contactNumbers,
            address,
            panNumber,
            defaultCurrency,
            logo,
            paymentQrCode,
            slogan,
            hasOperatingHours,
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

        // Find or create RestaurantConfig document strictly scoped to targetSlug
        let config = await RestaurantConfig.findOne({ companySlug: targetSlug });
        if (!config) {
            config = new RestaurantConfig({ companySlug: targetSlug, createdBy: actorName });
        }

        config.companySlug = targetSlug;
        if (name !== undefined) config.name = name;
        if (contactNumbers && Array.isArray(contactNumbers)) config.contactNumbers = contactNumbers;
        if (address !== undefined) config.address = address;
        if (panNumber !== undefined) config.panNumber = panNumber;
        if (defaultCurrency !== undefined) config.defaultCurrency = defaultCurrency;
        if (logo !== undefined) config.logo = logo;
        if (paymentQrCode !== undefined) config.paymentQrCode = paymentQrCode;
        if (slogan !== undefined) config.slogan = slogan;
        if (hasOperatingHours !== undefined) config.hasOperatingHours = Boolean(hasOperatingHours);
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

        res.status(200).json({
            success: true,
            message: "Restaurant configuration updated successfully for " + targetSlug,
            data: config
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { getRestaurantConfig, updateRestaurantConfig };
