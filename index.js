// Simple startup logging to help diagnose release startup
import { Platform } from 'react-native';

// Prefix all logs with app tag so they're easy to grep in logcat
const log = (...args) => console.log('[NafisaSmartHome]', ...args);
log('JS entry loaded', { platform: Platform.OS, dev: __DEV__ });

// Load Expo Router entry (must be last)
require('expo-router/entry');
