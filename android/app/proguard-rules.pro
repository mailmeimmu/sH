# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Add any project specific keep options here:

# Recommended ProGuard rules for React Native:
-keep public class com.facebook.react.ReactApplication
-keep public class com.facebook.react.ReactActivity
-keep public class com.facebook.react.ReactNativeHost
-keep public class com.facebook.react.ReactPackage
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.react.uimanager.** { *; }
-keep class com.facebook.react.modules.** { *; }
-keep class com.facebook.react.views.** { *; }
-keep class com.facebook.soloader.** { *; }
-keep class com.facebook.systrace.** { *; }

# Keep Hermes specific classes
-keep class com.facebook.hermes.reactexecutor.** { *; }

# Keep OkHttp classes
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }
-keep class okio.** { *; }
-keep interface okio.** { *; }

# Keep Flipper classes
-keep class com.facebook.flipper.** { *; }

# Keep Yoga classes
-keep class com.facebook.yoga.** { *; }

# Keep Fresco classes
-keep class com.facebook.drawee.backends.pipeline.** { *; }
-keep class com.facebook.imagepipeline.** { *; }
-keep interface com.facebook.imagepipeline.** { *; }
