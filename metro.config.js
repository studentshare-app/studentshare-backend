const { getDefaultConfig } = require('@expo/metro-config');

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = getDefaultConfig(__dirname, {
  // [Web-only]: Enables autodiscovery and syntax plugins for modern web targets
  web: false,
});

// 1. Path alias – already handled by tsconfig.json + Expo Router v2+
config.resolver.alias = {
  '@': './src',
};

module.exports = config;

