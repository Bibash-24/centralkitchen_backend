const swaggerJSDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const jwt = require("jsonwebtoken");
const config = require("./config");
const Superadmin = require("../models/superadmin/superadminModel");

const options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "DeliGati API Documentation",
            version: "1.0.0",
            description: "API documentation for the DeliGati. Requires Superadmin authentication.",
        },
        servers: [
            {
                url: process.env.BACKEND_URL || `http://localhost:${config.PORT || 8000}`,
                description: process.env.NODE_ENV === "production" ? "Production API Server" : "Development API Server",
            },
        ],
        components: {
            securitySchemes: {
                cookieAuth: {
                    type: "apiKey",
                    in: "cookie",
                    name: "accessToken"
                }
            },
        },
        security: [
            {
                cookieAuth: [],
            },
        ],
    },
    apis: ["./routes/**/*.js"], // Path to the API docs JSDoc comments
};

const swaggerSpec = swaggerJSDoc(options);

// Middleware to protect /api-docs (Only authenticated Superadmin allowed)
const docsAuthMiddleware = async (req, res, next) => {
    try {
        let token = null;
        if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
            token = req.headers.authorization.split(" ")[1];
        } else if (req.cookies && req.cookies.accessToken) {
            token = req.cookies.accessToken;
        }

        if (!token) {
            if (req.accepts('html')) {
                return res.redirect("/?error=unauthorized");
            }
            return res.status(401).json({ success: false, message: "Unauthorized. Please login to access API documentation." });
        }

        const decoded = jwt.verify(token, config.accessTokenSecret);
        if (!decoded || decoded.role !== "Superadmin") {
            if (req.accepts('html')) {
                return res.redirect("/?error=forbidden");
            }
            return res.status(403).json({ success: false, message: "Forbidden. Superadmin access required." });
        }

        const user = await Superadmin.findById(decoded._id);
        if (!user) {
            if (req.accepts('html')) {
                return res.redirect("/?error=forbidden");
            }
            return res.status(403).json({ success: false, message: "Forbidden. Invalid Superadmin token." });
        }

        req.user = user;
        next();
    } catch (err) {
        if (req.accepts('html')) {
            return res.redirect("/?error=session_expired");
        }
        return res.status(401).json({ success: false, message: "Session expired or invalid token. Please log in again." });
    }
};

const swaggerOptions = {
    customCss: `
        .swagger-ui .topbar { background-color: #1a1a1a !important; border-bottom: 1px solid #2a2a2a !important; padding: 12px 20px !important; }
        .swagger-ui .topbar-wrapper { max-width: 1200px !important; margin: 0 auto !important; display: flex !important; align-items: center !important; justify-content: space-between !important; width: 100% !important; }
        .swagger-ui .topbar-wrapper img { content: url('/logo.png') !important; height: 44px !important; width: auto !important; max-width: 180px !important; object-fit: contain !important; border-radius: 0 !important; background: transparent !important; }
        .swagger-nav-actions { display: flex !important; align-items: center !important; gap: 10px !important; margin-left: auto !important; }
        .swagger-nav-btn { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important; font-size: 12px !important; font-weight: 700 !important; padding: 8px 14px !important; border-radius: 10px !important; text-decoration: none !important; transition: all 0.2s !important; cursor: pointer !important; border: none !important; }
        .swagger-btn-portal { background: #be3e3f !important; color: #ffffff !important; box-shadow: 0 4px 12px rgba(190, 62, 63, 0.25) !important; }
        .swagger-btn-portal:hover { background: #d94446 !important; }
        .swagger-btn-logout { background: rgba(239, 68, 68, 0.15) !important; color: #ef4444 !important; border: 1px solid rgba(239, 68, 68, 0.3) !important; }
        .swagger-btn-logout:hover { background: rgba(239, 68, 68, 0.3) !important; }
    `,
    customJs: '/swagger-custom.js',
    customSiteTitle: "API Documentation - DeliGati",
    customfavIcon: "/favicon/favicon.ico"
};

const setupSwagger = (app) => {
    app.get('/swagger-custom.js', (req, res) => {
        res.setHeader('Content-Type', 'application/javascript');
        res.send(`
            function injectSwaggerNav() {
                const topbarWrapper = document.querySelector('.topbar-wrapper') || document.querySelector('.swagger-ui .topbar');
                if (topbarWrapper && !document.querySelector('.swagger-nav-actions')) {
                    const navDiv = document.createElement('div');
                    navDiv.className = 'swagger-nav-actions';
                    navDiv.style.cssText = 'display: flex; align-items: center; gap: 10px; margin-left: auto;';
                    navDiv.innerHTML = '<a href="/tenants-details" class="swagger-nav-btn swagger-btn-portal">🏠 Superadmin Portal</a>' +
                                       '<button type="button" onclick="handleSwaggerLogout()" class="swagger-nav-btn swagger-btn-logout">Logout</button>';
                    topbarWrapper.appendChild(navDiv);
                }
            }
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', injectSwaggerNav);
            } else {
                injectSwaggerNav();
            }
            setTimeout(injectSwaggerNav, 300);
            setTimeout(injectSwaggerNav, 1000);

            async function handleSwaggerLogout() {
                try {
                    await fetch('/api/user/logout', { method: 'POST' });
                } catch(e) {}
                document.cookie = 'accessToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
                window.location.href = '/';
            }
        `);
    });

    app.use("/api-docs", docsAuthMiddleware, swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerOptions));
    console.log(`Protected Swagger docs configured at http://localhost:${config.PORT || 8000}/api-docs`);
};

module.exports = setupSwagger;
