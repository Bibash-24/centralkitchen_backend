const net = require("net");
const createHttpError = require("http-errors");

/**
 * Direct ESC/POS WiFi & Network Thermal Printing Relay
 * Connects directly to printer IP:Port via raw TCP Socket
 */
const printWiFiThermal = async (req, res, next) => {
    try {
        const { printerIp, port = 9100, printData } = req.body;

        if (!printerIp) {
            return next(createHttpError(400, "Printer IP address is required."));
        }

        if (!printData) {
            return next(createHttpError(400, "Print payload data is required."));
        }

        // Decode base64 binary buffer
        const rawBuffer = Buffer.from(printData, 'base64');

        const client = new net.Socket();
        client.setTimeout(4000); // 4-second network timeout

        client.connect(Number(port) || 9100, printerIp.trim(), () => {
            client.write(rawBuffer, () => {
                client.end();
                return res.status(200).json({
                    success: true,
                    message: "Thermal ticket sent to WiFi printer successfully!"
                });
            });
        });

        client.on('error', (err) => {
            client.destroy();
            return res.status(500).json({
                success: false,
                message: `Failed connecting to WiFi printer at ${printerIp}:${port}. Error: ${err.message}`
            });
        });

        client.on('timeout', () => {
            client.destroy();
            return res.status(504).json({
                success: false,
                message: `Connection to WiFi printer at ${printerIp}:${port} timed out.`
            });
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    printWiFiThermal
};
