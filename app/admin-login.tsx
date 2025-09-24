import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ShieldCheck, Mail, KeyRound, LogIn, ArrowLeft } from 'lucide-react-native';
import remoteApi from '../services/remote';
import { db } from '../services/database';
import theme from '../theme';

export default function AdminLoginScreen() {
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    const session = db.getAdminSession();
    if (session?.token) {
      remoteApi.setAdminToken(session.token);
      router.replace('/admin-users');
    }
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !pin.trim()) {
      Alert.alert('Validation', 'Please enter email and PIN.');
      return;
    }
    setLoading(true);
    try {
      const { user, token } = await remoteApi.adminLogin(email.trim(), pin.trim());
      if (user && token) {
        db.setAdminSession({ ...user, token });
        remoteApi.setAdminToken(token);
        Alert.alert('Welcome', `Logged in as ${user.name}`, [
          { text: 'Continue', onPress: () => router.replace('/admin-users') }
        ]);
      } else {
        Alert.alert('Login Failed', 'Invalid credentials.');
      }
    } catch (e: any) {
      Alert.alert('Login Failed', e?.message || 'Unable to login.');
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
