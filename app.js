const path = require('path');
const envFile = process.env.NODE_ENV === "production" ? ".env.production" : ".env";
require("dotenv").config({ path: path.resolve(__dirname, envFile) });
const express = require('express');
const { connectDB } = require("./config/database");
const config = require("./config/config");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const Superadmin = require("./models/superadmin/superadminModel");
const globalErrorHandler = require("./middlewares/globalErrorHandler");
const setupSwagger = require("./config/swagger");
const seedSuperadmin = require("./config/seedSuperadmin");
const seedDropdownOptions = require("./config/seedDropdownOptions");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const rateLimit = require("express-rate-limit");
const { sanitizeInputPayload } = require("./middleware/securityMiddleware");

const app = express();

// Trust reverse proxy (Nginx/Webuzo/Cloudflare) for express-rate-limit
app.set("trust proxy", 1);

const PORT = config.PORT;
connectDB();
seedSuperadmin();
seedDropdownOptions();

// Optional Auto Migration Hook from Atlas to Webuzo
if (process.env.AUTO_MIGRATE === "true") {
    const runMigration = require("./migrate_to_webuzo");
    runMigration().catch(err => console.error("Auto migration failed:", err.message));
}

// Security Headers (XSS, Clickjacking, MIME sniffing defense)
app.use(helmet({
    contentSecurityPolicy: false, // Keep flexible for inline Swagger UI & custom scripts
    crossOriginEmbedderPolicy: false
}));

// Middlewares
const envAllowedOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map(url => url.trim().replace(/\/$/, ""))
    : [];

const defaultOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'https://chiyatown.com.np',
    'http://chiyatown.com.np',
    'https://pos.genvixtech.com',
    'http://pos.genvixtech.com',
    'https://genvixpos.genvixtech.com',
    'http://genvixpos.genvixtech.com'
];

const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envAllowedOrigins]));

const isOriginAllowed = (origin) => {
    if (!origin) return true;
    const cleanOrigin = origin.trim().replace(/\/$/, "");
    if (process.env.NODE_ENV !== "production") return true;
    if (allowedOrigins.includes(cleanOrigin)) return true;
    if (cleanOrigin.includes("chiyatown.com.np") || cleanOrigin.includes("genvixtech.com") || cleanOrigin.includes("localhost")) return true;
    return false;
};

app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
    }
    if (req.method === 'OPTIONS') {
        if (origin) {
            res.setHeader('Access-Control-Allow-Origin', origin);
        } else {
            res.setHeader('Access-Control-Allow-Origin', '*');
        }
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
        return res.status(204).end();
    }
    next();
});

app.use(cors({
    credentials: true,
    origin: (origin, callback) => callback(null, true)
}));
app.use(express.json({ limit: '10mb' })); // parse incoming request in json format
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());

// NoSQL Injection Defense (Mutates req.body, req.query, req.params in-place to support Express 5)
app.use((req, res, next) => {
    try {
        if (req.body) mongoSanitize.sanitize(req.body, { replaceWith: '_' });
        if (req.params) mongoSanitize.sanitize(req.params, { replaceWith: '_' });
        if (req.query && typeof req.query === 'object') {
            mongoSanitize.sanitize(req.query, { replaceWith: '_' });
        }
    } catch (e) { }
    next();
});

// XSS Input Payload Sanitizer (Cleans dangerous HTML & script tags)
app.use(sanitizeInputPayload);

// Global Cache Control Middleware: Prevent HTTPS Disk & Proxy Caching on all API GET requests
app.use('/api', (req, res, next) => {
    if (req.method === 'GET') {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});

// Auth Rate Limiter (Brute force & Denial of Service defense)
const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 25, // Limit each IP to 25 auth requests per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many authentication requests from this IP. Please try again after 15 minutes."
    }
});

app.use("/api/user/login", authRateLimiter);
app.use("/api/user/register", authRateLimiter);

// Serve static favicon files
app.use('/favicon', express.static(path.join(__dirname, 'favicon')));
app.use('/favicon.ico', express.static(path.join(__dirname, 'favicon', 'favicon.ico')));

// Setup protected Swagger docs after body & cookie parser
setupSwagger(app);

// Helper middleware for protecting HTML admin routes
const requireSuperadminHTML = async (req, res, next) => {
    try {
        const token = req.cookies?.accessToken || (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.split(" ")[1] : null);
        if (!token) return res.redirect("/?error=unauthorized");
        const decoded = jwt.verify(token, config.accessTokenSecret);
        if (!decoded || decoded.role !== "Superadmin") return res.redirect("/?error=forbidden");
        const user = await Superadmin.findById(decoded._id);
        if (!user) return res.redirect("/?error=forbidden");
        req.user = user;
        next();
    } catch (e) {
        return res.redirect("/?error=session_expired");
    }
};

// Helper function to fetch tenant restaurants across cluster DBs with computed License details
const fetchTenantList = async () => {
    const tenantList = [];
    try {
        const RestaurantConfig = require("./models/restaurant/restaurantModel");
        const LicenseConfig = require("./models/superadmin/licenseModel");
        const mongoose = require("mongoose");
        const seenNames = new Set();
        let globalLicense = await LicenseConfig.findOne();
        const today = new Date();

        const computeLicenseStatus = (lic, rCfg) => {
            const l = lic || globalLicense || {};
            const isTrial = l.isTrialActive !== undefined ? l.isTrialActive : true;
            const isActivated = l.isSystemActivated !== undefined ? l.isSystemActivated : false;

            const trialStart = l.trialStartDate || new Date().toISOString().split('T')[0];
            const trialEnd = l.trialEndDate || new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0];

            const actStart = l.activationStartDate || trialStart;
            const actEnd = l.activationEndDate || new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0];

            let status = "INACTIVE / EXPIRED";
            let validFrom = trialStart;
            let validTo = trialEnd;
            let type = "EVALUATION TRIAL";
            let statusColor = "bg-red-500/10 text-red-500 border-red-500/20";

            if (isActivated) {
                status = "SYSTEM ACTIVATED";
                validFrom = actStart;
                validTo = actEnd;
                type = "ANNUAL SUBSCRIPTION";
                statusColor = "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
            } else if (isTrial) {
                status = "TRIAL ACTIVE";
                validFrom = trialStart;
                validTo = trialEnd;
                type = "EVALUATION TRIAL";
                statusColor = "bg-amber-500/10 text-amber-500 border-amber-500/20";
            }

            const yearlyFee = (rCfg && rCfg.yearlyFee !== undefined) ? rCfg.yearlyFee : (l.yearlyFee !== undefined ? l.yearlyFee : 25000);

            const validToDate = new Date(validTo);
            const daysLeft = Math.ceil((validToDate - today) / (1000 * 60 * 60 * 24));
            const isExpiringSoon = (status.includes('ACTIVE') || status.includes('ACTIVATED')) && (daysLeft <= 30);

            return {
                status,
                type,
                validFrom,
                validTo,
                statusColor,
                yearlyFee,
                daysLeft,
                isExpiringSoon
            };
        };

        const primaryConfigs = await RestaurantConfig.find({});
        primaryConfigs.forEach(cfg => {
            const item = cfg.toObject();
            if (item.name) seenNames.add(item.name);
            const licInfo = computeLicenseStatus(globalLicense, item);

            tenantList.push({
                _id: String(item._id),
                dbSource: mongoose.connection.name || "Primary DB",
                name: item.name || "Unnamed Restaurant",
                contactNumbers: item.contactNumbers || [],
                address: item.address || "N/A",
                panNumber: item.panNumber || "N/A",
                defaultCurrency: item.defaultCurrency || "रु",
                slogan: item.slogan || "",
                licenseStatus: licInfo.status,
                licenseType: licInfo.type,
                validFrom: licInfo.validFrom,
                validTo: licInfo.validTo,
                statusColor: licInfo.statusColor,
                yearlyFee: licInfo.yearlyFee,
                daysLeft: licInfo.daysLeft,
                isExpiringSoon: licInfo.isExpiringSoon,
                createdAt: item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "N/A"
            });
        });

        try {
            const scanClusterDatabases = async () => {
                if (mongoose.connection && mongoose.connection.db) {
                    const adminDb = mongoose.connection.db.admin();
                    const dbs = await adminDb.listDatabases();
                    for (const dbInfo of (dbs.databases || [])) {
                        if (["admin", "config", "local"].includes(dbInfo.name)) continue;
                        if (dbInfo.name === mongoose.connection.name) continue;
                        try {
                            const targetDb = mongoose.connection.client.db(dbInfo.name);
                            const collections = await targetDb.listCollections({ name: "restaurantconfigs" }).toArray();
                            if (collections.length > 0) {
                                const configs = await targetDb.collection("restaurantconfigs").find({}).toArray();
                                let clusterLic = null;
                                const licCollections = await targetDb.listCollections({ name: "licenseconfigs" }).toArray();
                                if (licCollections.length > 0) {
                                    clusterLic = await targetDb.collection("licenseconfigs").findOne({});
                                }
                                configs.forEach(cfg => {
                                    if (cfg.name && !seenNames.has(cfg.name)) {
                                        seenNames.add(cfg.name);
                                        const licInfo = computeLicenseStatus(clusterLic || globalLicense, cfg);
                                        tenantList.push({
                                            _id: String(cfg._id),
                                            dbSource: dbInfo.name,
                                            name: cfg.name,
                                            contactNumbers: cfg.contactNumbers || [],
                                            address: cfg.address || "N/A",
                                            panNumber: cfg.panNumber || "N/A",
                                            defaultCurrency: cfg.defaultCurrency || "रु",
                                            slogan: cfg.slogan || "",
                                            licenseStatus: licInfo.status,
                                            licenseType: licInfo.type,
                                            validFrom: licInfo.validFrom,
                                            validTo: licInfo.validTo,
                                            statusColor: licInfo.statusColor,
                                            yearlyFee: licInfo.yearlyFee,
                                            daysLeft: licInfo.daysLeft,
                                            isExpiringSoon: licInfo.isExpiringSoon,
                                            createdAt: cfg.createdAt ? new Date(cfg.createdAt).toLocaleDateString() : "N/A"
                                        });
                                    }
                                });
                            }
                        } catch (e) { }
                    }
                }
            };

            await Promise.race([
                scanClusterDatabases(),
                new Promise(resolve => setTimeout(resolve, 1500))
            ]);
        } catch (e) { }
    } catch (e) { }
    return tenantList;
};

// HTML Renderer helper for Admin Dashboard view (Styled 100% identical to Inventory.jsx)
const escapeHTML = (str) => {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

const renderAdminDashboardHTML = ({ currentUser, tenantList, currentPath }) => {
    let activeCount = 0;
    let inactiveCount = 0;
    let expiringCount = 0;
    let totalRevenue = 0;

    tenantList.forEach(t => {
        if (t.licenseStatus.includes('ACTIVE') || t.licenseStatus.includes('ACTIVATED')) {
            activeCount++;
            totalRevenue += (Number(t.yearlyFee) || 0);
            if (t.isExpiringSoon) expiringCount++;
        } else {
            inactiveCount++;
        }
    });

    const sunSvg = '<svg class="w-4 h-4 text-amber-400 fill-current" viewBox="0 0 24 24"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41s-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41s-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/></svg>';
    const moonSvg = '<svg class="w-4 h-4 text-blue-400 fill-current" viewBox="0 0 24 24"><path d="M12.3 2c.43 0 .74.37.66.79a9.006 9.006 0 008.25 10.25c.42.08.79.39.79.82 0 4.97-4.03 9-9 9-4.97 0-9-4.03-9-9 0-4.88 3.89-8.86 8.73-8.99.19 0 .38.04.57.13z"/></svg>';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tenants Directory & Superadmin Overview - Genvix POS</title>
    <link rel="icon" type="image/x-icon" href="/favicon/favicon.ico">
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon/favicon-16x16.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/favicon/apple-touch-icon.png">
    <link rel="manifest" href="/favicon/site.webmanifest">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        primary: '#be3e3f',
                        'primary-hover': '#d94446',
                        secondary: '#2e4a40',
                        darkPage: '#1f1f1f',
                        darkCard: '#1a1a1a',
                        darkBorder: '#2a2a2a',
                        darkInput: '#242424',
                        darkText: '#f5f5f5',
                        mutedText: '#ababab'
                    },
                    fontFamily: { sans: ['Inter', 'sans-serif'] },
                }
            }
        }

        const sunSvg = '${sunSvg}';
        const moonSvg = '${moonSvg}';

        function updateThemeUI(isDark) {
            const iconContainer = document.getElementById('themeIcon');
            if (iconContainer) iconContainer.innerHTML = isDark ? sunSvg : moonSvg;
        }

        function applyTheme() {
            const savedTheme = localStorage.getItem('chiya-theme') || localStorage.getItem('theme') || 'dark';
            const isDark = savedTheme === 'dark';
            document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
            if (isDark) {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => updateThemeUI(isDark));
            } else {
                updateThemeUI(isDark);
            }
        }
        applyTheme();

        function toggleTheme() {
            const currentlyDark = document.documentElement.classList.contains('dark');
            const isDark = !currentlyDark;
            const newTheme = isDark ? 'dark' : 'light';
            localStorage.setItem('theme', newTheme);
            localStorage.setItem('chiya-theme', newTheme);
            document.documentElement.setAttribute('data-theme', newTheme);
            if (isDark) {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
            updateThemeUI(isDark);
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeEditModal();
                closeTenantDetailsModal();
            }
        });

        function openTenantDetailsModal(trElement) {
            const d = trElement ? trElement.dataset : {};
            if (!d) return;

            document.getElementById('detailsTenantName').innerText = d.name || 'Tenant System';
            document.getElementById('detailsTenantSlogan').innerText = d.slogan || 'POS System Tenant';
            document.getElementById('detailsDbSource').innerText = d.dbsource || 'Primary DB';
            document.getElementById('detailsContact').innerText = d.contact || 'N/A';
            document.getElementById('detailsPan').innerText = d.pan || 'N/A';
            document.getElementById('detailsAddress').innerText = d.address || 'N/A';
            document.getElementById('detailsStatus').innerText = d.status || 'N/A';
            document.getElementById('detailsValidity').innerText = d.validity || 'N/A';
            document.getElementById('detailsFee').innerText = 'रु ' + Number(d.fee || 0).toLocaleString();

            const editBtn = document.getElementById('detailsEditFeeBtn');
            if (editBtn) {
                editBtn.onclick = function() {
                    closeTenantDetailsModal();
                    openEditModal(d.id, d.name, Number(d.fee));
                };
            }

            document.getElementById('tenantDetailsModal').classList.remove('hidden');
        }

        function closeTenantDetailsModal() {
            const modal = document.getElementById('tenantDetailsModal');
            if (modal) modal.classList.add('hidden');
        }

        function openEditModal(restaurantId, restaurantName, currentFee) {
            document.getElementById('modalRestaurantId').value = restaurantId;
            document.getElementById('modalRestaurantName').value = restaurantName;
            document.getElementById('modalTitle').innerText = 'Edit Fee - ' + restaurantName;
            document.getElementById('modalYearlyFee').value = currentFee;
            document.getElementById('editPriceModal').classList.remove('hidden');
        }

        function closeEditModal() {
            const modal = document.getElementById('editPriceModal');
            if (modal) modal.classList.add('hidden');
        }
    </script>
</head>
<body class="bg-[#f0f0f0] dark:bg-[#1f1f1f] text-slate-900 dark:text-[#f5f5f5] min-h-screen flex flex-col font-sans antialiased transition-colors duration-300">
    
    <!-- Top Header Navigation Bar (Identical to Inventory & Vendors) -->
    <div class="flex flex-col xl:flex-row items-start xl:items-center justify-between px-4 sm:px-10 py-4 gap-4 flex-shrink-0 border-b w-full bg-white dark:bg-[#1a1a1a] border-slate-200 dark:border-[#2a2a2a] shadow-xs transition-colors duration-300">
        <div class="flex items-center gap-3.5">
            <div class="w-10 h-10 rounded-xl bg-[#be3e3f]/10 border border-[#be3e3f]/20 flex items-center justify-center shrink-0">
                <img src="/favicon/apple-touch-icon.png" alt="Genvix Logo" class="w-7 h-7 rounded-lg object-contain" />
            </div>
            <h1 class="text-xl sm:text-2xl font-bold tracking-wider text-slate-800 dark:text-[#f5f5f5]">
                Tenants & System Overview
            </h1>
        </div>

        <!-- Search Bar & Controls -->
        <div class="flex flex-wrap items-center gap-2.5 w-full xl:w-auto">
            <!-- Search Input -->
            <div class="relative w-full sm:w-60 flex-1 sm:flex-initial">
                <input 
                    type="text" 
                    id="searchInput" 
                    oninput="filterTenants()" 
                    placeholder="Search tenants, PAN, phone..." 
                    class="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#2a2a2a] bg-slate-50 dark:bg-[#1f1f1f] text-xs font-semibold outline-none focus:border-primary transition-all text-slate-900 dark:text-[#f5f5f5]"
                />
                <svg class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </div>

            <!-- API Docs Button -->
            <a href="/api-docs" class="px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-[#242424] hover:bg-slate-200 dark:hover:bg-[#2c2c2c] text-slate-700 dark:text-[#f5f5f5] font-bold text-xs transition-all border border-slate-200 dark:border-[#2a2a2a] whitespace-nowrap flex items-center gap-1.5">
                🚀 API Docs
            </a>

            <!-- Theme Toggle -->
            <button type="button" onclick="toggleTheme()" aria-label="Toggle Theme" class="p-2.5 rounded-xl bg-slate-100 dark:bg-[#242424] border border-slate-200 dark:border-[#2a2a2a] hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center justify-center shrink-0">
                <span id="themeIcon" class="flex items-center justify-center pointer-events-none"></span>
            </button>

            <!-- Logout Button -->
            <button onclick="handleLogout()" class="px-3.5 py-2.5 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 font-bold text-xs transition-all border border-red-500/20 cursor-pointer whitespace-nowrap">
                Logout
            </button>
        </div>
    </div>

    <!-- Directory Body (Identical to Inventory & Vendors Directory Layout) -->
    <div class="flex-1 flex flex-col overflow-y-auto px-4 sm:px-10 py-4 sm:py-6 space-y-4">
        
        <!-- Toast Feedback Banner -->
        <div id="toastBox" class="hidden p-4 rounded-xl text-xs font-bold text-center transition-all"></div>

        <!-- 4-Metrics Cards Grid (2-cols on mobile, 4-cols on desktop) -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 flex-shrink-0 w-full">
            <!-- 1. Total Tenants -->
            <div class="border p-3.5 sm:p-4 rounded-xl flex items-center justify-between transition-colors duration-300 bg-white dark:bg-[#1a1a1a] border-slate-200 dark:border-[#2a2a2a] shadow-xs">
                <div>
                    <p class="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-[#ababab]">Total Tenants</p>
                    <h2 class="text-xl sm:text-2xl font-bold mt-1 text-slate-900 dark:text-[#f5f5f5]">${tenantList.length}</h2>
                </div>
                <div class="p-2.5 sm:p-3 bg-blue-500/10 text-blue-500 rounded-xl shrink-0 font-bold text-base">
                    🏢
                </div>
            </div>

            <!-- 2. System Activated -->
            <div class="border p-3.5 sm:p-4 rounded-xl flex items-center justify-between transition-colors duration-300 bg-white dark:bg-[#1a1a1a] border-slate-200 dark:border-[#2a2a2a] shadow-xs">
                <div>
                    <p class="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-[#ababab]">System Activated</p>
                    <h2 class="text-xl sm:text-2xl font-bold mt-1 text-slate-900 dark:text-[#f5f5f5]">${activeCount}</h2>
                </div>
                <div class="p-2.5 sm:p-3 bg-emerald-500/10 text-emerald-500 rounded-xl shrink-0 font-bold text-base">
                    ✓
                </div>
            </div>

            <!-- 3. Trial / Expiring -->
            <div class="border p-3.5 sm:p-4 rounded-xl flex items-center justify-between transition-colors duration-300 bg-white dark:bg-[#1a1a1a] border-slate-200 dark:border-[#2a2a2a] shadow-xs">
                <div>
                    <p class="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-[#ababab]">Trial / Expiring</p>
                    <h2 class="text-xl sm:text-2xl font-bold mt-1 text-slate-900 dark:text-[#f5f5f5]">${expiringCount}</h2>
                </div>
                <div class="p-2.5 sm:p-3 bg-amber-500/10 text-amber-500 rounded-xl shrink-0 font-bold text-base">
                    ⏳
                </div>
            </div>

            <!-- 4. Revenue Generated -->
            <div class="border p-3.5 sm:p-4 rounded-xl flex items-center justify-between transition-colors duration-300 bg-white dark:bg-[#1a1a1a] border-slate-200 dark:border-[#2a2a2a] shadow-xs">
                <div>
                    <p class="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-[#ababab]">Annual Revenue</p>
                    <h2 class="text-xl sm:text-2xl font-bold mt-1 text-slate-900 dark:text-[#f5f5f5]">रु ${totalRevenue.toLocaleString()}</h2>
                </div>
                <div class="p-2.5 sm:p-3 bg-purple-500/10 text-purple-500 rounded-xl shrink-0 font-bold text-base">
                    💰
                </div>
            </div>
        </div>

        <!-- Action Bar (Showing count & Filter sub-tabs, identical to Inventory.jsx) -->
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl border transition-colors duration-300 bg-white dark:bg-[#1a1a1a] border-slate-200 dark:border-[#2a2a2a] shadow-xs">
            <span id="showingCount" class="text-xs font-semibold whitespace-nowrap text-slate-500 dark:text-[#ababab]">
                Showing ${tenantList.length} tenants
            </span>

            <!-- Interactive Sub-Tab Bar -->
            <div class="flex items-center gap-1.5 p-1 rounded-xl border overflow-x-auto scrollbar-hide w-full sm:w-auto bg-slate-100 dark:bg-[#1f1f1f] border-slate-200 dark:border-[#2a2a2a]">
                <button id="tab-btn-all" onclick="filterTab('all')" class="tab-btn flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all whitespace-nowrap bg-[#be3e3f] text-white">
                    <span>All Tenants (${tenantList.length})</span>
                </button>
                <button id="tab-btn-active" onclick="filterTab('active')" class="tab-btn flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all whitespace-nowrap text-slate-600 dark:text-[#ababab] hover:text-black dark:hover:text-[#f5f5f5]">
                    <span>Activated (${activeCount})</span>
                </button>
                <button id="tab-btn-expiring" onclick="filterTab('expiring')" class="tab-btn flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all whitespace-nowrap text-slate-600 dark:text-[#ababab] hover:text-black dark:hover:text-[#f5f5f5]">
                    <span>Expiring Soon (${expiringCount})</span>
                </button>
                <button id="tab-btn-inactive" onclick="filterTab('inactive')" class="tab-btn flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all whitespace-nowrap text-slate-600 dark:text-[#ababab] hover:text-black dark:hover:text-[#f5f5f5]">
                    <span>Inactive (${inactiveCount})</span>
                </button>
            </div>
        </div>

        <!-- Table View Container (Identical to Inventory.jsx & Vendors.jsx Table Design) -->
        <div class="border rounded-xl flex flex-col overflow-hidden w-full transition-colors duration-300 bg-white dark:bg-[#1a1a1a] border-slate-200 dark:border-[#2a2a2a] shadow-xs">
            <div class="overflow-x-auto">
                <table className="w-full text-left border-collapse" style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr class="border-b text-xs font-bold uppercase tracking-wider bg-slate-100 dark:bg-[#242424] border-slate-200 dark:border-[#2a2a2a] text-slate-700 dark:text-[#ababab]">
                            <th class="py-4 pl-6 pr-2 text-center w-12">S.N.</th>
                            <th class="p-4">Tenant / System Name</th>
                            <th class="p-4">Database Source</th>
                            <th class="p-4">Contact & PAN</th>
                            <th class="p-4">Address</th>
                            <th class="p-4">License Status</th>
                            <th class="p-4">Validity Range</th>
                            <th class="p-4">Yearly Fee (रु)</th>
                            <th class="p-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="tenantsTbody" class="divide-y divide-gray-200 dark:divide-[#262626] text-xs font-medium">
                        ${tenantList.map((t, idx) => {
        const isAct = t.licenseStatus.includes('ACTIVE') || t.licenseStatus.includes('ACTIVATED');
        const cat = isAct ? 'active' : 'inactive';
        const safeName = escapeHTML(t.name);
        const safeSlogan = escapeHTML(t.slogan || 'POS Tenant');
        const safeDbSource = escapeHTML(t.dbSource);
        const safeContacts = escapeHTML(t.contactNumbers.join(', ') || 'N/A');
        const safePan = escapeHTML(t.panNumber);
        const safeAddress = escapeHTML(t.address);
        const safeCurrency = escapeHTML(t.defaultCurrency);
        const safeStatus = escapeHTML(t.licenseStatus);
        const safeType = escapeHTML(t.licenseType);
        const safeFrom = escapeHTML(t.validFrom);
        const safeTo = escapeHTML(t.validTo);
        const jsEscapedName = (t.name || '').replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "&quot;");
        return `
                             <tr 
                                onclick="openTenantDetailsModal(this)"
                                class="tenant-row transition-colors cursor-pointer hover:bg-slate-500/10 text-slate-900 dark:text-[#f5f5f5]"
                                data-id="${t._id}"
                                data-name="${safeName.toLowerCase()}"
                                data-slogan="${safeSlogan}"
                                data-dbsource="${safeDbSource}"
                                data-contact="${safeContacts.toLowerCase()}"
                                data-pan="${safePan.toLowerCase()}"
                                data-address="${safeAddress}"
                                data-currency="${safeCurrency}"
                                data-status="${safeStatus}"
                                data-validity="${safeFrom} &rarr; ${safeTo}"
                                data-fee="${t.yearlyFee}"
                                data-category="${cat}"
                                data-expiring="${t.isExpiringSoon ? 'true' : 'false'}"
                                title="Click to view tenant details"
                            >
                                <td class="py-4 pl-6 pr-2 text-center font-bold text-xs">${idx + 1}</td>
                                <td class="p-4">
                                    <div class="font-bold text-sm line-clamp-1">${safeName}</div>
                                    <div class="text-[11px] text-slate-400 italic line-clamp-1 mt-0.5">${safeSlogan}</div>
                                </td>
                                <td class="p-4 font-semibold">
                                    <span class="px-2.5 py-1 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-[#242424] border border-slate-200 dark:border-[#2a2a2a]">
                                        ${safeDbSource}
                                    </span>
                                </td>
                                <td class="p-4">
                                    <div class="font-bold text-primary dark:text-[#eb6975]">📞 ${safeContacts}</div>
                                    <div class="text-[10px] text-slate-400">PAN: ${safePan}</div>
                                </td>
                                <td class="p-4">
                                    <div>📍 ${safeAddress}</div>
                                    <div class="text-[10px] text-slate-400">Symbol: ${safeCurrency}</div>
                                </td>
                                <td class="p-4">
                                    <span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${t.statusColor}">
                                        ${safeStatus}
                                    </span>
                                    ${t.isExpiringSoon ? `
                                        <div class="text-[10px] font-extrabold text-amber-500 mt-1">⚠️ Ends in ${t.daysLeft} Days</div>
                                    ` : ''}
                                </td>
                                <td class="p-4">
                                    <div class="text-[11px] font-semibold">${safeFrom} &rarr; ${safeTo}</div>
                                    <div class="text-[10px] text-blue-500 font-bold uppercase">${safeType}</div>
                                </td>
                                <td class="p-4">
                                    <span id="fee-display-${t._id}" class="font-black text-emerald-600 dark:text-emerald-400 text-sm">
                                        रु ${Number(t.yearlyFee).toLocaleString()}
                                    </span>
                                </td>
                                <td class="p-4 text-right" onclick="event.stopPropagation()">
                                    <button 
                                        onclick="openEditModal('${t._id}', '${jsEscapedName}', ${t.yearlyFee})"
                                        class="px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 border bg-slate-100 dark:bg-[#242424] border-slate-300 dark:border-[#2a2a2a] text-slate-800 dark:text-[#f5f5f5] hover:border-primary"
                                    >
                                        <span>✏️ Edit Fee</span>
                                    </button>
                                </td>
                            </tr>
                            `;
    }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- Tenant Details Read-Only Modal -->
    <div id="tenantDetailsModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fadeIn select-none">
        <div class="p-6 sm:p-8 rounded-2xl border shadow-2xl w-full max-w-lg space-y-5 max-h-[90vh] overflow-y-auto bg-white dark:bg-[#1a1a1a] border-slate-200 dark:border-[#2a2a2a] text-slate-900 dark:text-[#f5f5f5]">
            <div class="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-[#262626]">
                <div>
                    <span class="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">Tenant System Profile</span>
                    <h3 id="detailsTenantName" class="text-xl font-black text-slate-900 dark:text-[#f5f5f5] mt-1">--</h3>
                    <p id="detailsTenantSlogan" class="text-xs text-slate-500 dark:text-[#ababab] italic">--</p>
                </div>
                <button onclick="closeTenantDetailsModal()" class="p-1.5 rounded-lg text-slate-400 hover:text-black dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#262626] transition-colors text-lg cursor-pointer">&times;</button>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div class="p-3.5 rounded-xl border bg-slate-50 dark:bg-[#1f1f1f] border-slate-200 dark:border-[#2a2a2a]">
                    <span class="text-slate-400 font-bold block text-[10px] uppercase">Database Source</span>
                    <span id="detailsDbSource" class="font-bold text-sm text-slate-800 dark:text-white">--</span>
                </div>
                <div class="p-3.5 rounded-xl border bg-slate-50 dark:bg-[#1f1f1f] border-slate-200 dark:border-[#2a2a2a]">
                    <span class="text-slate-400 font-bold block text-[10px] uppercase">Contact Number</span>
                    <span id="detailsContact" class="font-bold text-sm text-primary dark:text-[#eb6975]">--</span>
                </div>
                <div class="p-3.5 rounded-xl border bg-slate-50 dark:bg-[#1f1f1f] border-slate-200 dark:border-[#2a2a2a]">
                    <span class="text-slate-400 font-bold block text-[10px] uppercase">PAN Number</span>
                    <span id="detailsPan" class="font-bold text-sm text-slate-800 dark:text-white">--</span>
                </div>
                <div class="p-3.5 rounded-xl border bg-slate-50 dark:bg-[#1f1f1f] border-slate-200 dark:border-[#2a2a2a]">
                    <span class="text-slate-400 font-bold block text-[10px] uppercase">Address</span>
                    <span id="detailsAddress" class="font-bold text-sm text-slate-800 dark:text-white">--</span>
                </div>
                <div class="p-3.5 rounded-xl border bg-slate-50 dark:bg-[#1f1f1f] border-slate-200 dark:border-[#2a2a2a]">
                    <span class="text-slate-400 font-bold block text-[10px] uppercase">License Status</span>
                    <span id="detailsStatus" class="font-bold text-xs">--</span>
                </div>
                <div class="p-3.5 rounded-xl border bg-slate-50 dark:bg-[#1f1f1f] border-slate-200 dark:border-[#2a2a2a]">
                    <span class="text-slate-400 font-bold block text-[10px] uppercase">License Validity</span>
                    <span id="detailsValidity" class="font-bold text-xs text-blue-500">--</span>
                </div>
                <div class="p-3.5 rounded-xl border bg-slate-50 dark:bg-[#1f1f1f] border-slate-200 dark:border-[#2a2a2a] sm:col-span-2 flex justify-between items-center">
                    <span class="text-slate-400 font-bold text-[10px] uppercase">Annual Subscription Fee</span>
                    <span id="detailsFee" class="font-black text-emerald-600 dark:text-emerald-400 text-base">--</span>
                </div>
            </div>

            <div class="pt-3 border-t border-slate-200 dark:border-[#262626] flex justify-end gap-2">
                <button onclick="closeTenantDetailsModal()" class="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors bg-slate-100 dark:bg-[#242424] text-slate-800 dark:text-[#f5f5f5] hover:bg-slate-200 dark:hover:bg-[#2c2c2c]">
                    Close
                </button>
                <button id="detailsEditFeeBtn" class="px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-xs shadow-md cursor-pointer flex items-center gap-2 active:scale-95 transition-all">
                    <span>✏️ Edit Fee</span>
                </button>
            </div>
        </div>
    </div>

    <!-- Standard Edit Yearly Fee Modal (Identical to Inventory & Vendors Modal Design) -->
    <div id="editPriceModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fadeIn">
        <div class="p-6 sm:p-8 rounded-2xl border shadow-2xl w-full max-w-xl space-y-4 max-h-[90vh] overflow-y-auto bg-white dark:bg-[#1a1a1a] border-slate-200 dark:border-[#2a2a2a] text-slate-900 dark:text-[#f5f5f5]">
            
            <div class="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-[#262626]">
                <div>
                    <h3 id="modalTitle" class="text-xl font-bold text-slate-900 dark:text-[#f5f5f5]">Edit Yearly Subscription Fee</h3>
                    <p class="text-xs text-[#ababab] mt-0.5">Update annual rate for restaurant tenant</p>
                </div>
                <button onclick="closeEditModal()" class="p-1.5 rounded-lg text-slate-400 hover:text-black dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#262626] transition-colors text-lg cursor-pointer">&times;</button>
            </div>

            <input type="hidden" id="modalRestaurantId" value="" />
            <input type="hidden" id="modalRestaurantName" value="" />

            <div class="space-y-4">
                <div>
                    <label class="block text-xs font-semibold uppercase mb-1.5 text-slate-500 dark:text-[#ababab]">
                        Yearly Fee Amount (रु) <span class="text-[#be3e3f]">*</span>
                    </label>
                    <input 
                        type="number" 
                        id="modalYearlyFee" 
                        placeholder="e.g. 25000" 
                        class="w-full border rounded-xl px-4 py-2.5 outline-none focus:border-primary transition-all text-xs bg-slate-50 dark:bg-[#1f1f1f] text-slate-900 dark:text-[#f5f5f5] border-slate-300 dark:border-[#2a2a2a]"
                    />
                </div>
            </div>

            <div class="pt-4 border-t border-slate-200 dark:border-[#262626] flex justify-end gap-2">
                <button onclick="closeEditModal()" class="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors bg-slate-100 dark:bg-[#242424] text-slate-800 dark:text-[#f5f5f5] hover:bg-slate-200 dark:hover:bg-[#2c2c2c]">
                    Cancel
                </button>
                <button onclick="submitModalPriceUpdate()" class="px-5 py-2 rounded-xl bg-[#be3e3f] hover:bg-[#d94446] text-white font-bold text-xs shadow-md cursor-pointer flex items-center gap-2 active:scale-95 transition-all">
                    <span>Save Amount</span>
                </button>
            </div>
        </div>
    </div>

    <script>
        let currentTabCategory = 'all';

        function filterTenants() {
            const query = (document.getElementById('searchInput').value || '').toLowerCase().trim();
            const rows = document.querySelectorAll('.tenant-row');
            let count = 0;

            rows.forEach(row => {
                const name = (row.getAttribute('data-name') || '').toLowerCase();
                const contact = (row.getAttribute('data-contact') || '').toLowerCase();
                const pan = (row.getAttribute('data-pan') || '').toLowerCase();
                const cat = row.getAttribute('data-category');
                const isExpiring = row.getAttribute('data-expiring') === 'true';

                const matchesSearch = !query || name.includes(query) || contact.includes(query) || pan.includes(query);
                
                let matchesCategory = false;
                if (currentTabCategory === 'all') matchesCategory = true;
                else if (currentTabCategory === 'active') matchesCategory = (cat === 'active');
                else if (currentTabCategory === 'expiring') matchesCategory = isExpiring;
                else if (currentTabCategory === 'inactive') matchesCategory = (cat === 'inactive');

                if (matchesSearch && matchesCategory) {
                    row.classList.remove('hidden');
                    count++;
                } else {
                    row.classList.add('hidden');
                }
            });

            const countEl = document.getElementById('showingCount');
            if (countEl) countEl.innerText = 'Showing ' + count + ' tenants';
        }

        function filterTab(category) {
            currentTabCategory = category;

            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.className = 'tab-btn flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all whitespace-nowrap text-slate-600 dark:text-[#ababab] hover:text-black dark:hover:text-[#f5f5f5]';
            });
            const activeBtn = document.getElementById('tab-btn-' + category);
            if (activeBtn) {
                activeBtn.className = 'tab-btn flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all whitespace-nowrap bg-[#be3e3f] text-white';
            }

            filterTenants();
        }

        function openEditModal(restaurantId, restaurantName, currentFee) {
            document.getElementById('modalRestaurantId').value = restaurantId;
            document.getElementById('modalRestaurantName').value = restaurantName;
            document.getElementById('modalTitle').innerText = 'Edit Fee - ' + restaurantName;
            document.getElementById('modalYearlyFee').value = currentFee;
            document.getElementById('editPriceModal').classList.remove('hidden');
        }

        function closeEditModal() {
            document.getElementById('editPriceModal').classList.add('hidden');
        }

        async function submitModalPriceUpdate() {
            const restaurantId = document.getElementById('modalRestaurantId').value;
            const restaurantName = document.getElementById('modalRestaurantName').value;
            const yearlyFee = Number(document.getElementById('modalYearlyFee').value);
            const toast = document.getElementById('toastBox');

            try {
                const res = await fetch('/api/superuser/license', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ restaurantId, yearlyFee })
                });

                const data = await res.json();
                if (res.ok && data.success) {
                    closeEditModal();
                    const feeDisplay = document.getElementById('fee-display-' + restaurantId);
                    if (feeDisplay) feeDisplay.innerText = 'रु ' + yearlyFee.toLocaleString();
                    if (toast) {
                        toast.className = 'p-4 rounded-xl text-xs font-bold text-center bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 mb-4';
                        toast.innerText = '✓ Yearly subscription fee for "' + restaurantName + '" was updated successfully to रु ' + yearlyFee.toLocaleString() + '!';
                        toast.classList.remove('hidden');
                        setTimeout(() => toast.classList.add('hidden'), 4500);
                    }
                } else {
                    alert('Error updating fee: ' + (data.message || 'Server error'));
                }
            } catch (err) {
                alert('Connection error while updating fee.');
            }
        }

        async function handleLogout() {
            try {
                await fetch('/api/user/logout', { method: 'POST' });
            } catch (e) {}
            document.cookie = 'accessToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
            window.location.href = '/';
        }
    </script>
</body>
</html>`;
};

// Root endpoint: Serves Superadmin login & API docs access portal
app.get("/", async (req, res) => {
    let currentUser = null;
    try {
        const token = req.cookies?.accessToken || (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.split(" ")[1] : null);
        if (token) {
            const decoded = jwt.verify(token, config.accessTokenSecret);
            if (decoded && decoded.role === "Superadmin") {
                currentUser = await Superadmin.findById(decoded._id).select("-password -__v");
            }
        }
    } catch (e) {
        currentUser = null;
    }

    if (currentUser) {
        return res.redirect("/tenants-details");
    }

    const sunSvg = '<svg class="w-4 h-4 text-amber-500 fill-current" viewBox="0 0 24 24"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41s-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41s-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/></svg>';
    const moonSvg = '<svg class="w-4 h-4 text-blue-400 fill-current" viewBox="0 0 24 24"><path d="M12.3 2c.43 0 .74.37.66.79a9.006 9.006 0 008.25 10.25c.42.08.79.39.79.82 0 4.97-4.03 9-9 9-4.97 0-9-4.03-9-9 0-4.88 3.89-8.86 8.73-8.99.19 0 .38.04.57.13z"/></svg>';

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Genvix POS Superadmin Login</title>
    <link rel="icon" type="image/x-icon" href="/favicon/favicon.ico">
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon/favicon-16x16.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/favicon/apple-touch-icon.png">
    <link rel="manifest" href="/favicon/site.webmanifest">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        primary: '#be3e3f',
                        'primary-hover': '#d94446',
                        darkPage: '#1f1f1f',
                        darkCard: '#1a1a1a',
                        darkBorder: '#2a2a2a',
                        darkInput: '#242424',
                        darkText: '#f5f5f5',
                        mutedText: '#ababab'
                    },
                    fontFamily: { sans: ['Inter', 'sans-serif'] },
                }
            }
        }

        const sunSvg = '${sunSvg}';
        const moonSvg = '${moonSvg}';

        function updateThemeUI(isDark) {
            const iconContainer = document.getElementById('themeIcon');
            if (iconContainer) iconContainer.innerHTML = isDark ? sunSvg : moonSvg;
        }

        function applyTheme() {
            const savedTheme = localStorage.getItem('chiya-theme') || localStorage.getItem('theme') || 'dark';
            const isDark = savedTheme === 'dark';
            document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
            if (isDark) {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => updateThemeUI(isDark));
            } else {
                updateThemeUI(isDark);
            }
        }
        applyTheme();

        function toggleTheme() {
            const currentlyDark = document.documentElement.classList.contains('dark');
            const isDark = !currentlyDark;
            const newTheme = isDark ? 'dark' : 'light';
            localStorage.setItem('theme', newTheme);
            localStorage.setItem('chiya-theme', newTheme);
            document.documentElement.setAttribute('data-theme', newTheme);
            if (isDark) {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
            updateThemeUI(isDark);
        }

        let showPassword = false;
        function toggleLoginPassword() {
            showPassword = !showPassword;
            const input = document.getElementById('password');
            const eyeIcon = document.getElementById('loginEyeIcon');
            if (input) input.type = showPassword ? 'text' : 'password';
            if (eyeIcon) {
                eyeIcon.innerHTML = showPassword 
                    ? '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/></svg>'
                    : '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>';
            }
        }
    </script>
    <style>
        input:-webkit-autofill,
        input:-webkit-autofill:hover, 
        input:-webkit-autofill:focus, 
        input:-webkit-autofill:active {
            transition: background-color 50000s ease-in-out 0s !important;
            -webkit-text-fill-color: #f5f5f5 !important;
            caret-color: #f5f5f5 !important;
            -webkit-box-shadow: 0 0 0px 1000px #242424 inset !important;
            box-shadow: 0 0 0px 1000px #242424 inset !important;
        }

        [data-theme="light"] input:-webkit-autofill,
        [data-theme="light"] input:-webkit-autofill:hover, 
        [data-theme="light"] input:-webkit-autofill:focus, 
        [data-theme="light"] input:-webkit-autofill:active {
            -webkit-text-fill-color: #1a1a1a !important;
            caret-color: #1a1a1a !important;
            -webkit-box-shadow: 0 0 0px 1000px #ffffff inset !important;
            box-shadow: 0 0 0px 1000px #ffffff inset !important;
        }
    </style>
</head>
<body class="bg-[#f0f0f0] dark:bg-[#1f1f1f] text-slate-900 dark:text-[#f5f5f5] min-h-screen flex items-center justify-center p-4 font-sans antialiased transition-colors duration-200">
    <div class="w-full max-w-md bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#2a2a2a] rounded-3xl p-7 sm:p-8 shadow-2xl relative overflow-hidden transition-all duration-300">
        
        <!-- Theme Toggle Button -->
        <button type="button" onclick="toggleTheme()" aria-label="Toggle Theme" class="absolute top-6 right-6 z-30 p-2.5 rounded-xl bg-slate-100 dark:bg-[#262626] border border-slate-200 dark:border-[#333333] hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center justify-center shadow-sm">
            <span id="themeIcon" class="flex items-center justify-center pointer-events-none"></span>
        </button>

        <!-- Header Branding (Matches pos-frontend design) -->
        <div class="text-center mb-6 relative z-10">
            <div class="w-14 h-14 mx-auto mb-3 rounded-2xl bg-[#be3e3f]/10 border border-[#be3e3f]/20 flex items-center justify-center shadow-lg shadow-[#be3e3f]/10">
                <img src="/favicon/apple-touch-icon.png" alt="Genvix POS Logo" class="w-9 h-9 rounded-lg object-contain" />
            </div>
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#be3e3f]/10 border border-[#be3e3f]/20 text-[#be3e3f] dark:text-[#eb6975] text-[10px] font-extrabold uppercase tracking-wider mb-2">
                <span class="w-2 h-2 rounded-full bg-[#be3e3f] animate-pulse"></span>
                Genvix POS Server
            </div>
        </div>

        <div id="alertBox" class="hidden mb-5 p-3.5 rounded-xl text-xs font-semibold text-center transition-all"></div>

        <form id="loginForm" onsubmit="handleSuperadminLogin(event)" class="space-y-4 relative z-10">
            <div>
                <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#ababab] mb-1.5">Email or Phone Number</label>
                <div class="relative">
                    <input 
                        type="text" 
                        id="email" 
                        required 
                        placeholder="Email or Phone Number"
                        class="w-full px-4 py-3 text-sm rounded-xl bg-slate-50 dark:bg-[#242424] border border-slate-200 dark:border-[#2a2a2a] text-slate-900 dark:text-[#f5f5f5] focus:outline-none focus:ring-2 focus:ring-[#be3e3f]/50 focus:border-[#be3e3f] transition-all placeholder-slate-400 dark:placeholder-gray-600 font-medium"
                    />
                </div>
            </div>

            <div>
                <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#ababab] mb-1.5">Password or PIN</label>
                <div class="relative">
                    <input 
                        type="password" 
                        id="password" 
                        required 
                        placeholder="Password or PIN"
                        class="w-full pl-4 pr-10 py-3 text-sm rounded-xl bg-slate-50 dark:bg-[#242424] border border-slate-200 dark:border-[#2a2a2a] text-slate-900 dark:text-[#f5f5f5] focus:outline-none focus:ring-2 focus:ring-[#be3e3f]/50 focus:border-[#be3e3f] transition-all placeholder-slate-400 dark:placeholder-gray-600 font-medium"
                    />
                    <button 
                        type="button" 
                        onclick="toggleLoginPassword()" 
                        class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-[#ababab] hover:text-slate-600 dark:hover:text-[#f5f5f5] p-1 cursor-pointer transition-colors"
                        aria-label="Toggle password view"
                    >
                        <span id="loginEyeIcon" class="flex items-center justify-center pointer-events-none">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                        </span>
                    </button>
                </div>
            </div>

            <button 
                type="submit" 
                id="submitBtn"
                class="w-full py-3.5 px-4 rounded-xl bg-[#be3e3f] hover:bg-[#d94446] text-white font-black text-sm transition-all shadow-lg shadow-[#be3e3f]/25 flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
                <span>Log In</span>
            </button>
        </form>

        <div class="mt-6 pt-4 border-t border-slate-200 dark:border-[#262626] text-center text-[11px] text-slate-400 dark:text-[#ababab]">
            <p>Protected System Portal &bull; Genvix Tech POS</p>
        </div>
    </div>

    <script>
        const urlParams = new URLSearchParams(window.location.search);
        const errorParam = urlParams.get('error');
        const alertBox = document.getElementById('alertBox');
        if (alertBox && errorParam) {
            alertBox.classList.remove('hidden');
            if (errorParam === 'unauthorized') {
                alertBox.className = 'mb-5 p-3.5 rounded-xl text-xs font-semibold text-center bg-amber-500/10 border border-amber-500/20 text-amber-500 dark:text-amber-400';
                alertBox.innerText = '⚠️ Please log in to access system details.';
            } else if (errorParam === 'forbidden') {
                alertBox.className = 'mb-5 p-3.5 rounded-xl text-xs font-semibold text-center bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400';
                alertBox.innerText = '⛔ Access Denied.';
            } else if (errorParam === 'session_expired') {
                alertBox.className = 'mb-5 p-3.5 rounded-xl text-xs font-semibold text-center bg-blue-500/10 border border-blue-500/20 text-blue-500 dark:text-blue-400';
                alertBox.innerText = 'ℹ️ Your session expired. Please log in again to continue.';
            }
        }

        async function handleSuperadminLogin(e) {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const btn = document.getElementById('submitBtn');

            btn.disabled = true;
            btn.innerHTML = '<span>Authenticating...</span>';

            try {
                const res = await fetch('/api/superuser/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const data = await res.json();
                if (res.ok && data.success) {
                    alertBox.className = 'mb-5 p-3.5 rounded-xl text-xs font-semibold text-center bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400';
                    alertBox.innerText = '✓ Login Successful! Redirecting...';
                    alertBox.classList.remove('hidden');
                    setTimeout(() => {
                        window.location.href = '/tenants-details';
                    }, 800);
                } else {
                    alertBox.className = 'mb-5 p-3.5 rounded-xl text-xs font-semibold text-center bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400';
                    alertBox.innerText = (data.message || 'Invalid Superadmin credentials.');
                    alertBox.classList.remove('hidden');
                    btn.disabled = false;
                    btn.innerHTML = '<span>Log In</span>';
                }
            } catch (err) {
                alertBox.className = 'mb-5 p-3.5 rounded-xl text-xs font-semibold text-center bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400';
                alertBox.innerText = 'Server connection failed. Please check network.';
                alertBox.classList.remove('hidden');
                btn.disabled = false;
                btn.innerHTML = '<span>Log In</span>';
            }
        }
    </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(htmlContent);
});

// Dedicated Protected Endpoint: Restaurant Tenants & System License Overview (/tenants-details)
app.get("/tenants-details", requireSuperadminHTML, async (req, res) => {
    const tenantList = await fetchTenantList();
    const htmlContent = renderAdminDashboardHTML({ currentUser: req.user, tenantList, currentPath: "/tenants-details" });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(htmlContent);
});

// Other Endpoints
app.use("/api/company", require("./routes/company/companyRoute"));
app.use("/api/companies", require("./routes/company/companyRoute"));
app.use("/api/order", require("./routes/order/orderRoute"));
app.use("/api/orders", require("./routes/order/orderRoute"));
app.use("/api/user", require("./routes/user/userRoute"));
app.use("/api/superuser", require("./routes/superadmin/superadminRoute"));
app.use("/api/superuser/role-permissions", require("./routes/superadmin/rolePermissionRoute"));
app.use("/api/restaurant", require("./routes/restaurant/restaurantRoute"));
app.use("/api/menu-category", require("./routes/menuCategory/menuCategoryRoute"));
app.use("/api/menu-item", require("./routes/menuItem/menuItemRoute"));
app.use("/api/notification", require("./routes/notification/notificationRoute"));
app.use("/api/vendor", require("./routes/vendor/vendorRoute"));
app.use("/api/creditor", require("./routes/creditor/creditorRoute"));
app.use("/api/inventory", require("./routes/inventory/inventoryRoute"));
app.use("/api/expense", require("./routes/expense/expenseRoute"));
app.use("/api/dropdown-options", require("./routes/dropdownOption/dropdownOptionRoute"));
app.use("/api/staff", require("./routes/staff/staffRoute"));
app.use("/api/report", require("./routes/report/reportRoute"));
app.use("/api/issue", require("./routes/issue/issueRoute"));
app.use("/api/print", require("./routes/print/printRoute"));

// Global Error Handler
app.use(globalErrorHandler);

// Server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
