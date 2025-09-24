import { useEffect } from 'react';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';

export default function RootLayout() {
  useFrameworkReady();
  const pathname = usePathname();

  useEffect(() => {
    console.log('[NafisaSmartHome] RootLayout mounted');
  }, []);

  useEffect(() => {
    if (pathname) {
      console.log('[NafisaSmartHome] route change ->', pathname);
    }
  }, [pathname]);

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
