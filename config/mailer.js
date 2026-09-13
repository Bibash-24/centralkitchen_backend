const nodemailer = require("nodemailer");

// Cached Singleton Transporter Pool for Instant Dispatch
let cachedTransporter = null;

const getTransporter = () => {
    if (cachedTransporter) return cachedTransporter;

    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        const rawPort = Number(process.env.SMTP_PORT) || 465;
        const cleanPass = process.env.SMTP_PASS.trim().replace(/^["']|["']$/g, "");
        cachedTransporter = nodemailer.createTransport({
            pool: true,
            maxConnections: 5,
            maxMessages: 100,
            host: process.env.SMTP_HOST.trim(),
            port: rawPort,
            secure: rawPort === 465,
            auth: {
                user: process.env.SMTP_USER.trim(),
                pass: cleanPass
            },
            tls: {
                rejectUnauthorized: false
            }
        });
        return cachedTransporter;
    }
    return null;
};

const sendIssueEmail = async ({ issue, reporter }) => {
    // Non-blocking asynchronous background execution for sub-millisecond API response time
    setImmediate(async () => {
        const supportEmail = "support@genvixtech.com";
        const subject = `[Genvix POS Issue] [${(issue.priority || "normal").toUpperCase()}] ${issue.title}`;

        let attachments = [];
        let imageHtml = "";

        if (issue.image && issue.image.startsWith("data:image")) {
            imageHtml = `
                <div style="margin-top: 15px; background-color: #1a1a1a; border: 1px solid #2a2a2a; padding: 15px; border-radius: 8px;">
                    <h4 style="margin-top: 0; color: #be3e3f;">Attached Screenshot / Image:</h4>
                    <img src="${issue.image}" alt="Issue Screenshot" style="max-width: 100%; border-radius: 8px; border: 1px solid #333;" />
                </div>
            `;

            const matches = issue.image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                attachments.push({
                    filename: "issue-screenshot.png",
                    content: Buffer.from(matches[2], "base64"),
                    contentType: matches[1]
                });
            }
        }

        const htmlContent = `
            <div style="font-family: Arial, sans-serif; background-color: #1f1f1f; color: #f5f5f5; padding: 25px; border-radius: 12px;">
                <h2 style="color: #be3e3f; border-bottom: 2px solid #2a2a2a; padding-bottom: 10px;">🚨 New System Issue Reported</h2>
                
                <table style="width: 100%; border-collapse: collapse; margin-top: 15px; color: #e0e0e0; font-size: 14px;">
                    <tr><td style="padding: 8px; font-weight: bold; width: 140px; color: #ababab;">Issue Title:</td><td style="padding: 8px; color: #ffffff; font-weight: bold;">${issue.title}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold; color: #ababab;">Category:</td><td style="padding: 8px;">${issue.category}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold; color: #ababab;">Priority:</td><td style="padding: 8px; color: #be3e3f; font-weight: bold;">${issue.priority}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold; color: #ababab;">Status:</td><td style="padding: 8px; color: #eab308; font-weight: bold;">${issue.status}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold; color: #ababab;">Reported By:</td><td style="padding: 8px;">${reporter?.name || "System User"} (${reporter?.email || reporter?.phone || "N/A"}) - Role: ${reporter?.role || "Staff"}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold; color: #ababab;">Restaurant / Tenant:</td><td style="padding: 8px;">${issue.restaurantName || "Chiya Town POS"}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold; color: #ababab;">Reported At:</td><td style="padding: 8px;">${new Date(issue.createdAt || Date.now()).toLocaleString()}</td></tr>
                </table>

                <div style="margin-top: 20px; background-color: #1a1a1a; border: 1px solid #2a2a2a; padding: 15px; border-radius: 8px;">
                    <h4 style="margin-top: 0; color: #be3e3f;">Issue Description:</h4>
                    <p style="white-space: pre-wrap; color: #d1d5db; line-height: 1.5;">${issue.description}</p>
                </div>

                ${imageHtml}

                <p style="margin-top: 20px; font-size: 11px; color: #71717a; text-align: center;">
                    Genvix POS Automated Issue Reporting &bull; Sent to ${supportEmail}
                </p>
            </div>
        `;

        try {
            const transporter = getTransporter();
            if (transporter) {
                const mailOptions = {
                    from: `"Genvix POS System" <${process.env.SMTP_USER || "support@genvixtech.com"}>`,
                    to: supportEmail,
                    subject: subject,
                    html: htmlContent,
                    attachments: attachments
                };

                const info = await transporter.sendMail(mailOptions);
                console.log(`✓ Email dispatched asynchronously to ${supportEmail} for Issue ID: ${issue._id}`);
                const previewUrl = nodemailer.getTestMessageUrl(info);
                if (previewUrl) {
                    console.log(`✉️ Live Email Preview URL: ${previewUrl}`);
                }
            }
        } catch (err) {
            console.error("Error dispatching issue email in background:", err.message);
        }
    });
};

module.exports = { sendIssueEmail };
