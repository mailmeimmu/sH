import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { KeyRound } from 'lucide-react-native';
import { db } from '../services/database';
import remoteApi from '../services/remote';
import * as SecureStore from 'expo-secure-store';

export default function PinLoginScreen() {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!pin.trim()) return;
    setLoading(true);
    try {
      let res: any = { success: false };
      if (remoteApi.enabled) {
        const remoteRes: any = await remoteApi.authByPin(pin.trim());
        res = remoteRes;
        if (!remoteRes.success && remoteRes.networkError) {
          res = await db.authenticateByPin(pin.trim());
        }
      } else {
        res = await db.authenticateByPin(pin.trim());
      }
      if (res.success) {
        if (res.user) db.currentUser = res.user;
        try { await SecureStore.setItemAsync('last_user_id', res.user.id); } catch {}
        router.replace('/(tabs)');
      } else {
        Alert.alert('Sign-In Failed', res.error || 'Please try again');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <KeyRound size={64} color="#3B82F6" />
        <Text style={styles.title}>PIN Login</Text>
        <Text style={styles.subtitle}>Enter your 4-6 digit PIN</Text>
      </View>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
          value={pin}
          onChangeText={setPin}
          placeholder="••••"
          placeholderTextColor="#6B7280"
        />
        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Signing in...' : 'Sign In'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827', padding: 24 },
  header: { alignItems: 'center', paddingTop: 80, marginBottom: 40, gap: 12 },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: 'bold' },
  subtitle: { color: '#9CA3AF' },
  form: { gap: 16 },
  input: { backgroundColor: '#1F2937', borderWidth: 1, borderColor: '#374151', borderRadius: 12, color: '#FFFFFF', paddingVertical: 14, paddingHorizontal: 16, fontSize: 20, letterSpacing: 4, textAlign: 'center' },
  button: { backgroundColor: '#3B82F6', paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#2563EB' },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
  backText: { color: '#9CA3AF', textAlign: 'center', marginTop: 8 },
});
