// Prevent native autolinking for optional modules that break Android builds
// This keeps the JS require try/catch safe while avoiding native conflicts.
module.exports = {
  dependencies: {
    '@react-native-voice/voice': {
      platforms: {
        ios: null,
        android: null,
      },
    },
  },
};

