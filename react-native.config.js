// Prevent native autolinking for optional modules that break Android builds
// This keeps the JS require try/catch safe while avoiding native conflicts.
module.exports = {
  dependencies: {
    'vision-camera-face-detector': {
      platforms: {
        ios: null,
        android: null,
      },
    },
    'react-native-vision-camera': {
      platforms: {
        ios: {
          sourceDir: '../node_modules/react-native-vision-camera/ios',
          project: 'VisionCamera.xcodeproj',
        },
        android: {
          sourceDir: '../node_modules/react-native-vision-camera/android',
          packageImportPath: 'com.mrousavy.camera',
        },
      },
    },
  },
};