const { getDefaultConfig } = require('@expo/metro-config');
const path = require('path');

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = getDefaultConfig(__dirname, {
  web: false,
});

// 1. Path alias
config.resolver.assetExts.push('bundle');
config.resolver.alias = {
  '@': './src',
};

// 2. Block server-side files from being bundled with the React Native app
config.resolver.blockList = [
  /.*[\\\/]backend[\\\/]server\.js$/,
  /.*studentshare-backend.*/,
  /.*[\\\/]src[\\\/]routes[\\\/].*/,
  /.*[\\\/]src[\\\/]controllers[\\\/].*/,
  /.*[\\\/]src[\\\/]middleware[\\\/].*/,
];

// 3. Fix Metro resolver for react-native src directory
config.watchFolders = [
  path.resolve(__dirname, 'node_modules/react-native/src'),
];

module.exports = config;
