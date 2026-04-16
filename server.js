const path = require("node:path");
const { DeviceTrafficStore } = require("./src/deviceTrafficStore");
const { createServer } = require("./src/httpServer");

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 8787);
const publicDir = path.join(__dirname, "public");
const deviceTrafficStore = new DeviceTrafficStore({
  dbPath: process.env.SURGE_DASHBOARD_DB || path.join(__dirname, "data", "surge-dashboard.sqlite"),
});

const server = createServer({ publicDir, deviceTrafficStore });

server.listen(port, host, () => {
  console.log(`Surge dashboard is running at http://${host}:${port}`);
});

process.on("SIGINT", () => {
  deviceTrafficStore.close();
  server.close(() => process.exit(0));
});
