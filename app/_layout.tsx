import { useEffect, useMemo } from 'react';
import { useState } from 'react';
import { Stack, router, useRootNavigationState, useSegments, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { db } from '../services/database';
import { Platform } from 'react-native';

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useFrameworkReady();
  const rootNavigation = useRootNavigationState();
  const segments = useSegments();
  const [isReady, setIsReady] = useState(false);

  const publicRoutes = useMemo(() => new Set([
    '/login',
    '/pin-login',
    '/biometric-login',
    '/registration',
    '/face-recognition',
    '/admin-login',
    '/splash',
    '/+not-found',
  ]), []);

  useEffect(() => {
    console.log('[NafisaSmartHome] RootLayout mounted, platform:', Platform.OS);
    
    // Initialize database and wait for it to be ready
    const initApp = async () => {
      try {
        if (db.readyPromise) {
          await db.readyPromise;
        }
        // Initialize admin session after database is ready
        if (db.initializeAdminSession) {
          await db.initializeAdminSession();
        }
        setIsReady(true);
        await SplashScreen.hideAsync();
      } catch (error) {
        console.log('[NafisaSmartHome] Init error:', error);
        setIsReady(true);
        await SplashScreen.hideAsync();
      }
    };
    
    initApp();
  }, []);

  useEffect(() => {
    if (!isReady) return;
    if (!rootNavigation?.key) return;
    const routes = rootNavigation?.routes || [];
    if (routes.length === 0) return;

    const authed = !!db.getCurrentUser?.();
    if (!segments?.length) return;

    const top = segments[0];
    const normalized = top === '(tabs)' ? '/(tabs)' : `/${top || ''}`;

    if (!authed) {
      if (!publicRoutes.has(normalized) && normalized !== '/login') {
        console.log('[NafisaSmartHome] Redirecting to login from:', normalized);
        setTimeout(() => {
          try {
            router.replace('/login');
          } catch (e) {
            console.log('[NafisaSmartHome] Navigation error:', e);
          }
        }, 100);
      }
    }
  }, [segments, publicRoutes, rootNavigation?.key, rootNavigation?.routes, isReady]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} initialRouteName="splash">
        <Stack.Screen name="splash" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="pin-login" />
        <Stack.Screen name="change-face" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="family" />
        <Stack.Screen name="face-recognition" />
        <Stack.Screen name="registration" />
        <Stack.Screen name="admin-login" />
        <Stack.Screen name="admin-users" />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}
