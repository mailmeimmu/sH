import { useEffect, useMemo } from 'react';
import { Stack, router, useRootNavigationState, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { db } from '../services/database';

export default function RootLayout() {
  useFrameworkReady();
  const rootNavigation = useRootNavigationState();
  const segments = useSegments();

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
    if (!rootNavigation?.key) return;
    const routes = rootNavigation?.routes || [];
    if (routes.length === 0) return;

    const authed = !!db.getCurrentUser?.();
    if (!segments?.length) return;

    const top = segments[0];
    const normalized = top === '(tabs)' ? '/(tabs)' : `/${top || ''}`;

    if (!authed) {
      if (!publicRoutes.has(normalized) && normalized !== '/login') {
        setTimeout(() => router.replace('/login'), 0);
      }
    }
  }, [segments, publicRoutes, rootNavigation?.key, rootNavigation?.routes]);

  useEffect(() => {
    console.log('[NafisaSmartHome] RootLayout mounted');
  }, []);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} initialRouteName="login">
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
