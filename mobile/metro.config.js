const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// inlineRem 16 makes Tailwind spacing match space() in src/ui/theme.ts (p-4 = 16px).
module.exports = withNativeWind(config, { input: './global.css', inlineRem: 16 });
