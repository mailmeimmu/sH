import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Alert, Animated, Easing, Platform, useWindowDimensions, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { UserPlus, User, Fingerprint, KeyRound, ScanFace, ShieldCheck } from 'lucide-react-native';
import { db } from '../services/database';
import theme from '../theme';
import InfoBanner from '../components/InfoBanner';
import * as SecureStore from 'expo-secure-store';
import { biometricService } from '../services/biometric';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

// Create an animated version of LinearGradient
const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

type BiometricAvailability = {
  available: boolean;
  biometryType?: string;
  isSimulated?: boolean;
  error?: string;
};

export default function LoginScreen() {
  const { width, height } = useWindowDimensions();
  const isSmall = width < 380 || height < 700;
  const [availableBiometric, setAvailableBiometric] = React.useState<BiometricAvailability | null>(null);
  const brandAnim = React.useRef(new Animated.Value(0)).current;
  const glowAnim = React.useRef(new Animated.Value(0)).current;
  const tileAnims = React.useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  const gradientAnim = React.useRef(new Animated.Value(0)).current;


  React.useEffect(() => {
    console.log('[NafisaSmartHome] Login mounted');
    // Initialize database first
    const initDb = async () => {
      try {
        if (db.readyPromise) {
          await db.readyPromise;
        }
      } catch (e) {
        console.warn('[Login] Database init warning:', e);
      }
    };
    initDb();
    
    checkBiometricAvailability();

    // Intro animations
    Animated.spring(brandAnim, {
      toValue: 1,
      useNativeDriver: true,
      bounciness: 8,
      speed: 12,
    }).start(() => {
      Animated.stagger(100, tileAnims.map(v => Animated.spring(v, { toValue: 1, useNativeDriver: true, bounciness: 10 }))).start();
    });

    // Subtle background gradient animation
    Animated.loop(Animated.sequence([
      Animated.timing(gradientAnim, { toValue: 1, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      Animated.timing(gradientAnim, { toValue: 0, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
    ])).start();

    Animated.loop(Animated.sequence([
      Animated.timing(glowAnim, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(glowAnim, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ])).start();

    // Optional: quick biometric auto-login (disabled by default)
    const AUTO = (process.env.EXPO_PUBLIC_AUTO_BIOMETRIC_LOGIN as any) === '1';
    if (AUTO) {
      (async () => {
        try {
          const lastId = await SecureStore.getItemAsync('last_user_id');
          if (!lastId) return;
          const m = db.getMemberById(lastId);
          if (!m || m.preferredLogin !== 'biometric') return;
          const avail = await biometricService.isAvailable();
          if (avail.available) {
            setTimeout(() => handleBiometricLogin(true, lastId), 300);
          }
        } catch {}
      })();
    }
  }, []);

  const checkBiometricAvailability = async () => {
    const biometric = await biometricService.isAvailable();
    setAvailableBiometric(biometric);
  };

  const handleBiometricLogin = async (silent?: boolean, forcedUserId?: string) => {
    console.log('[NafisaSmartHome] Biometric login pressed');
    try {
      const result = await biometricService.authenticate('Unlock Smart Home');
      if (result.success) {
        let target = undefined;
        if (forcedUserId) target = db.getMemberById(forcedUserId);
        if (!target) {
          const lastId = await SecureStore.getItemAsync('last_user_id');
          if (lastId) target = db.getMemberById(lastId);
        }
        if (!target) target = db.getAllUsers()[0];
        if (target) {
          db.currentUser = target;
          if (silent) {
            router.replace('/(tabs)');
          } else {
            Alert.alert('Success', `Welcome back, ${target.name}!`, [
              { text: 'Continue', onPress: () => router.replace('/(tabs)') }
            ]);
          }
        }
      } else {
        Alert.alert('Authentication Failed', result.error || 'Please try again');
      }
    } catch (error) {
      Alert.alert('Error', 'Biometric authentication failed');
    }
  };

  const handleRegister = () => {
    router.push('/registration');
  };

  const brandTranslateY = brandAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] });
  const brandScale = brandAnim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] });
  const brandOpacity = brandAnim;
  const glowScale = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.1] });
  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.55] });

  // Static gradient colors (Animated arrays are not supported for colors prop)
  const gradientColors = [theme.colors.background, '#0D1730'] as const;


  const avatarGlowSize = isSmall ? 96 : 120;
  const avatarSize = isSmall ? 80 : 100;

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={gradientColors as any} style={StyleSheet.absoluteFillObject} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={[styles.scrollContent, isSmall && styles.scrollContentSmall]} bounces={false} showsVerticalScrollIndicator={false}>
        <View style={styles.centerWrap}>
          <Animated.View style={[styles.header, { opacity: brandOpacity, transform: [{ translateY: brandTranslateY }, { scale: brandScale }] }]}>
            <View style={[styles.avatarGlow, { width: avatarGlowSize, height: avatarGlowSize }]}>
              <Animated.View style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: avatarGlowSize / 2, opacity: glowOpacity, transform: [{ scale: glowScale }] }}>
                <LinearGradient colors={[theme.colors.brandPrimary, theme.colors.brandAccent]} style={{ flex: 1, borderRadius: 60 }} />
              </Animated.View>
              <View style={[styles.avatarContainer, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]}>
                <User size={isSmall ? 50 : 60} color={theme.colors.brandPrimary} />
              </View>
            </View>
            <Text style={[styles.brandMain, isSmall && { fontSize: 32 } ]}>Smart Home</Text>
            <View style={styles.brandBarWrap}>
              <LinearGradient colors={[theme.colors.brandPrimary, theme.colors.brandAccent]} style={styles.brandBar} start={{x: 0, y: 0}} end={{x: 1, y: 0}} />
            </View>
            <Text style={styles.brandByline}>By Nafisa Tabasum</Text>
            <Text style={[styles.subtitle, isSmall && { fontSize: 15, lineHeight: 22 }]}>Welcome! Choose how you want to sign in.</Text>
            <View style={styles.bannerWrap}>
              <InfoBanner>
                Tap a box below. Biometric uses your device face/fingerprint. PIN is 4–6 digits.
              </InfoBanner>
            </View>
          </Animated.View>

          <View style={styles.gridContainer}>
            <View style={[styles.authGrid, isSmall && styles.authGridSmall]}>
            {availableBiometric?.available && (
              <AnimatedAuthTile
                appear={tileAnims[0]}
                onPress={() => router.push('/biometric-login')}
                icon={<Fingerprint size={32} color={theme.colors.textPrimary} />}
                title="Device Biometric"
                subtitle={availableBiometric.isSimulated ? '(Simulated)' : 'Choose profile + confirm'}
                style={isSmall ? styles.tileFull : undefined}
              />
            )}

              <AnimatedAuthTile
                appear={tileAnims[1]}
                onPress={() => router.push('/pin-login')}
                icon={<KeyRound size={32} color={theme.colors.textPrimary} />}
                title="PIN Login"
                subtitle="4–6 digit PIN"
                style={isSmall ? styles.tileFull : undefined}
              />

              <AnimatedAuthTile
                appear={tileAnims[2]}
                onPress={() => router.push('/face-recognition')}
                icon={<ScanFace size={32} color={theme.colors.textPrimary} />}
                title="Face Login"
                subtitle="Look at the camera"
                style={isSmall ? styles.tileFull : undefined}
              />
              <AnimatedAuthTile
                appear={tileAnims[3]}
                onPress={handleRegister}
                icon={<UserPlus size={32} color={theme.colors.textPrimary} />}
                title="New Registration"
                subtitle="Create account"
                style={isSmall ? styles.tileFull : undefined}
              />
              <AnimatedAuthTile
                appear={tileAnims[4]}
                onPress={() => router.push('/admin-login')}
                icon={<ShieldCheck size={32} color={theme.colors.textPrimary} />}
                title="Super Admin"
                subtitle="Manage users & roles"
                style={isSmall ? styles.tileFull : undefined}
              />
            </View>
          </View>
        </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

function AnimatedAuthTile({ icon, title, subtitle, onPress, appear, style: extraStyle }: any) {
  const press = React.useRef(new Animated.Value(0)).current;
  const scale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] });
  const translateY = appear?.interpolate ? appear.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) : 0;
  const scaleIn = appear?.interpolate ? appear.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) : 1;
  const opacity = appear || 1;

  return (
    <AnimatedTouchable
      activeOpacity={0.95}
      onPressIn={() => Animated.spring(press, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 10 }).start()}
      onPressOut={() => Animated.spring(press, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 10 }).start()}
      onPress={onPress}
      style={[styles.tile, extraStyle, { transform: [{ scale }, { translateY }, { scale: scaleIn }], opacity }]}
    >
      {Platform.OS === 'ios' ? (
        <BlurView tint="dark" intensity={20} style={StyleSheet.absoluteFillObject} />
      ) : null}
      <View style={styles.tileIcon}>{icon}</View>
      <Text style={styles.tileTitle}>{title}</Text>
      {subtitle ? <Text style={styles.tileSubtitle}>{subtitle}</Text> : null}
    </AnimatedTouchable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  header: { width: '100%', maxWidth: 520, alignItems: 'center', marginBottom: 32 },
  avatarGlow: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  avatarContainer: { width: 100, height: 100, backgroundColor: theme.colors.surface, borderRadius: 50, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: theme.colors.brandPrimary },
  brandMain: { fontSize: 40, fontWeight: '900', color: theme.colors.textPrimary, letterSpacing: 1 },
  brandBarWrap: { marginTop: 8, marginBottom: 6, width: 120, height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: theme.colors.surface },
  brandBar: { flex: 1 },
  brandByline: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 12, opacity: 0.8 },
  subtitle: { fontSize: 17, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 24, paddingHorizontal: 16 },
  bannerWrap: { width: '100%', marginTop: 20 },
  gridContainer: { width: '100%', alignItems: 'center' },
  authGrid: { width: '100%', maxWidth: 520, flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center' },
  authGridSmall: { flexDirection: 'column', gap: 12 },
  tile: {
    width: '46%',
    minWidth: 160,
    aspectRatio: 1,
    maxHeight: 172,
    backgroundColor: 'rgba(17, 28, 46, 0.5)',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  tileIcon: { marginBottom: 12 },
  tileTitle: { color: theme.colors.textPrimary, fontWeight: '700', fontSize: 18, textAlign: 'center' },
  tileSubtitle: { color: theme.colors.textSecondary, fontSize: 13, marginTop: 5, textAlign: 'center', opacity: 0.9 },
  tileFull: { width: '100%', minWidth: undefined, aspectRatio: undefined, height: 112 },
  scrollContent: { flexGrow: 1, justifyContent: 'center' },
  scrollContentSmall: { justifyContent: 'flex-start', paddingTop: 24, paddingBottom: 24 },
});
