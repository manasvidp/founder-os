// craco.config.js — build config (Emergent preview overlays removed)
const path = require("path");

module.exports = {
  eslint: {
    configure: {
      extends: ["plugin:react-hooks/recommended"],
      rules: {
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "warn",
      },
    },
  },
  webpack: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  devServer: (devServerConfig) => {
    // Local development: forward /api calls to the backend on port 8001.
    devServerConfig.proxy = { "/api": { target: process.env.BACKEND_DEV_URL || "http://localhost:8001", changeOrigin: true } };
    return devServerConfig;
  },
};
