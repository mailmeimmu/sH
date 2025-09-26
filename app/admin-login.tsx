import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ShieldCheck, Mail, KeyRound, LogIn, ArrowLeft } from 'lucide-react-native';
import remoteApi from '../services/remote';
import { db } from '../services/database';
import theme from '../theme';

type AdminLoginSuccess = {
  success: true;
  user: any;
  token?: string | null;
};

type AdminLoginFailure = {
  success: false;
  error: string;
};

type AdminLoginResult = AdminLoginSuccess | AdminLoginFailure;

export default function AdminLoginScreen() {
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    console.log('[AdminLogin] Component mounted');
    // Check for existing session
    const session = db.getAdminSession();
    console.log('[AdminLogin] Existing session:', session?.name || 'none');
    if (session?.token) {
      console.log('[AdminLogin] Valid session found, redirecting to admin panel');
      remoteApi.setAdminToken(session.token);
      router.replace('/admin-users');
    }
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !pin.trim()) {
      Alert.alert('Validation', 'Please enter email and PIN.');
      return;
    }
    
    console.log('[AdminLogin] Attempting login with:', email.trim(), pin.trim());
    setLoading(true);
    
    try {
      console.log('[AdminLogin] Starting authentication process');
      
      // Try local authentication first
      const localResult = await db.authenticateAdmin(email.trim(), pin.trim()) as AdminLoginResult;
      console.log('[AdminLogin] Local auth result:', localResult);
      
      let loginResult: AdminLoginResult | null = null;
      if (remoteApi.enabled) {
        try {
          console.log('[AdminLogin] Trying remote admin login');
          loginResult = await remoteApi.adminLogin(email.trim(), pin.trim()) as AdminLoginResult;
          console.log('[AdminLogin] Remote login result:', loginResult);
        } catch (error) {
          console.log('[AdminLogin] Remote login failed, trying local fallback:', (error as any)?.message || error);
          loginResult = localResult;
        }
      } else {
        console.log('[AdminLogin] Remote API disabled, using local result');
        loginResult = localResult;
      }
      
      if (loginResult && loginResult.success && loginResult.user) {
        const token = 'token' in loginResult ? loginResult.token ?? null : null;
        console.log('[AdminLogin] Login successful, setting session');
        const sessionData = { ...loginResult.user, token };
        db.setAdminSession(sessionData);
        remoteApi.setAdminToken(token);
        console.log('[AdminLogin] Navigating to admin users');
        router.replace('/admin-users');
      } else {
        console.log('[AdminLogin] Login failed - no valid result');
        Alert.alert('Login Failed', 'Invalid credentials.');
      }
    } catch (e) {
      console.log('[AdminLogin] Login error:', e);
      Alert.alert('Login Failed', (e as any)?.message || 'Unable to login. For local testing, try: admin@example.com / 123456');
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => router.back();

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.container}>
          <TouchableOpacity onPress={goBack} style={styles.backButton}>
            <ArrowLeft size={24} color={theme.colors.brandAccent} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={styles.iconWrap}>
              <ShieldCheck size={48} color={theme.colors.brandAccent} />
            </View>
            <Text style={styles.title}>Super Admin</Text>
            <Text style={styles.subtitle}>Sign in to manage household accounts.</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <Mail size={20} color="#9CA3AF" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#6B7280"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
            </View>
            <View style={styles.field}>
              <KeyRound size={20} color="#9CA3AF" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.input}
                placeholder="PIN"
                placeholderTextColor="#6B7280"
                secureTextEntry
                keyboardType="number-pad"
                maxLength={6}
                value={pin}
                onChangeText={setPin}
              />
            </View>
            <TouchableOpacity
              style={[styles.loginButton, loading && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              <LogIn size={20} color="#FFFFFF" />
              <Text style={styles.loginText}>{loading ? 'Signing in…' : 'Sign in'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  container: {
    flex: 1,
    padding: 24,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backText: {
    color: theme.colors.brandAccent,
    fontSize: 16,
  },
  header: {
    marginTop: 48,
    alignItems: 'center',
  },
  iconWrap: {
    backgroundColor: 'rgba(59,130,246,0.12)',
    padding: 16,
    borderRadius: 24,
    marginBottom: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: '#9CA3AF',
    marginTop: 8,
    textAlign: 'center',
  },
  form: {
    marginTop: 40,
    gap: 16,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
  },
  loginButton: {
    marginTop: 12,
    backgroundColor: theme.colors.brandAccent,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
