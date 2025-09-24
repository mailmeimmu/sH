module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Keep this at the end per Reanimated docs
      'react-native-worklets/plugin',
    ],
  };
};

