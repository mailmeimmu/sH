import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, TextInput, ActivityIndicator } from 'react-native';
import { Screen, Container } from '../components/Layout';
import { router } from 'expo-router';
import { ArrowLeft, User, LogOut, Fingerprint } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import { biometricService } from '../services/biometric';
import { db } from '../services/database';
import ConfirmDialog from '../components/ConfirmDialog';
import theme from '../theme';

export default function ProfileScreen() {
  const [displayName, setDisplayName] = useState('');
  const [savingName, setSavingName] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [biometricRegistered, setBiometricRegistered] = useState<boolean | null>(null);
  const [checkingBiometric, setCheckingBiometric] = useState(false);
  const [showSignOut, setShowSignOut] = useState(false);

  const user = db.getCurrentUser() || db.getAllUsers()[0];

  useEffect(() => {
    if (user) setDisplayName(user.name || '');
    loadBiometricPreference();
  }, []);

  const loadBiometricPreference = async () => {
    try {
      setCheckingBiometric(true);
      const pref = await biometricService.getBiometricPreference(user?.id || 'default');
      setBiometricRegistered(!!pref);
    } catch (e) {
      setBiometricRegistered(false);
    } finally {
      setCheckingBiometric(false);
    }
  };

  const handleSaveDisplayName = async () => {
    console.log('[NafisaSmartHome] Save display name', displayName);
    try {
      if (!displayName.trim()) {
        Alert.alert('Validation', 'Display name cannot be empty');
        return;
      }
      setSavingName(true);
      // Update in demo DB
      if (user) {
        const updated = { ...user, name: displayName.trim() };
        db.users.set(user.id, updated);
        db.currentUser = updated;
      }
      await SecureStore.setItemAsync(`display_name_${user?.id || 'default'}`, displayName.trim());
      Alert.alert('Saved', 'Display name updated');
    } catch (e) {
      Alert.alert('Error', 'Could not save name');
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async () => {
    console.log('[NafisaSmartHome] Change password clicked');
    if (!newPassword || newPassword.length < 6) {
      Alert.alert('Validation', 'Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Validation', 'Passwords do not match');
      return;
    }
    try {
      setChangingPassword(true);
      await SecureStore.setItemAsync(`password_${user?.id || 'default'}`, newPassword);
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Success', 'Password changed');
    } catch (e) {
      Alert.alert('Error', 'Could not change password');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleRegisterBiometric = async () => {
    console.log('[NafisaSmartHome] Register biometrics');
    try {
      setCheckingBiometric(true);
      const availability = await biometricService.isAvailable();
      if (!availability.available) {
        Alert.alert(
          'Not Available',
          'Biometrics are not set up on this device. Set them up in system settings and try again.'
        );
        return;
      }
      const result = await biometricService.authenticate('Register your biometrics');
      if (result.success) {
        await biometricService.storeBiometricPreference(user?.id || 'default', true);
        if (user?.id) {
          db.setPreferredLogin(user.id, 'biometric');
          try { await SecureStore.setItemAsync('last_user_id', user.id); } catch {}
        }
        setBiometricRegistered(true);
        Alert.alert('Registered', 'Biometric login enabled');
        console.log('[NafisaSmartHome] Biometrics registered');
      } else {
        Alert.alert('Failed', result.error || 'Authentication failed');
        console.log('[NafisaSmartHome] Biometrics failed', result.error);
      }
    } catch (e) {
      Alert.alert('Error', 'Could not register biometrics');
    } finally {
      setCheckingBiometric(false);
    }
  };

  const handleRemoveBiometric = async () => {
    console.log('[NafisaSmartHome] Remove biometrics');
    try {
      setCheckingBiometric(true);
      await SecureStore.setItemAsync(`biometric_${user?.id || 'default'}`, 'false');
      if (user?.id) db.setPreferredLogin(user.id, 'pin');
      setBiometricRegistered(false);
      Alert.alert('Removed', 'Biometric login disabled');
    } catch (e) {
      Alert.alert('Error', 'Could not remove biometrics');
    } finally {
      setCheckingBiometric(false);
    }
  };

  const performSignOut = async () => {
    try { db.logout(); } catch {}
    console.log('[NafisaSmartHome] Signing out -> /login');
    router.replace('/login');
  };

  const handleSignOut = () => {
    setShowSignOut(true);
  };

  return (
    <Screen>
      <Container>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={22} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.header}>
            <Text style={styles.title}>Profile</Text>
            <Text style={styles.subtitle}>Manage your account</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
      </Container>

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <Container>
          <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <User size={64} color="#3B82F6" />
          </View>
          <Text style={styles.userName}>{displayName || user?.name || 'User'}</Text>
          <Text style={styles.userEmail}>{user?.email || 'user@example.com'}</Text>
          {user && (
            <Text style={styles.userMeta}>{(user.role || 'member')}{user.relation ? ` • ${user.relation}` : ''}</Text>
          )}
        </View>

        {/* Edit display name */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Display Name</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Enter display name"
              placeholderTextColor="#6B7280"
            />
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={handleSaveDisplayName} disabled={savingName}>
            {savingName ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Save Name</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Change password */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Change Password</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="New password"
              placeholderTextColor="#6B7280"
              secureTextEntry
            />
          </View>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm password"
              placeholderTextColor="#6B7280"
              secureTextEntry
            />
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={handleChangePassword} disabled={changingPassword}>
            {changingPassword ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Update Password</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Device Biometrics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Biometric Login</Text>
          <Text style={styles.sectionHint}>
            Use your device biometrics to quickly sign in.
          </Text>
          <View style={styles.biometricRow}>
            <Fingerprint size={20} color={biometricRegistered ? '#10B981' : '#9CA3AF'} />
            <Text style={[styles.biometricStatus, biometricRegistered ? styles.statusOn : styles.statusOff]}>
              {checkingBiometric ? 'Checking...' : biometricRegistered ? 'Enabled' : 'Disabled'}
            </Text>
          </View>
          <View style={styles.rowButtons}>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleRegisterBiometric} disabled={checkingBiometric}>
              <Text style={styles.secondaryButtonText}>Register Biometrics</Text>
            </TouchableOpacity>
            {biometricRegistered && (
              <TouchableOpacity style={styles.dangerGhostButton} onPress={handleRemoveBiometric} disabled={checkingBiometric}>
                <Text style={styles.dangerGhostButtonText}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* App Face Recognition (in-app model) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Face Recognition</Text>
          <Text style={styles.sectionHint}>
            Update your face template used by the app's face login.
          </Text>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/change-face')}>
            <Text style={styles.secondaryButtonText}>Change Face</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <LogOut size={24} color="#EF4444" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={styles.appInfo}>
          <Text style={styles.appInfoText}>Smart Home By Nafisa Tabasum</Text>
          <Text style={styles.appInfoSubtext}>Simple and safe home control</Text>
        </View>
        </Container>
      </ScrollView>

      <ConfirmDialog
        visible={showSignOut}
        title="Sign out of Smart Home?"
        subtitle="You’ll need to log in again to access your smart home."
        cancelLabel="Cancel"
        confirmLabel="Sign Out"
        danger
        onCancel={() => setShowSignOut(false)}
        onConfirm={() => {
          setShowSignOut(false);
          performSignOut();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 8 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border },
  header: {
    alignItems: 'center',
    padding: 12,
  },
  title: { fontSize: 24, fontWeight: 'bold', color: theme.colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 14, color: theme.colors.textSecondary },
  content: { flex: 1, padding: 20 },
  profileCard: { backgroundColor: theme.colors.surface, padding: 24, borderRadius: 16, alignItems: 'center', marginBottom: 32, borderWidth: 1, borderColor: theme.colors.border },
  avatarContainer: { width: 80, height: 80, backgroundColor: theme.colors.surfaceAlt, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  userName: { color: theme.colors.textPrimary, fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  userEmail: { color: theme.colors.textSecondary, fontSize: 16 },
  userMeta: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 4 },
  section: {
    marginBottom: 32,
  },
  sectionTitle: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: 'bold', marginBottom: 16, paddingLeft: 4 },
  sectionHint: { color: theme.colors.textSecondary, fontSize: 13, marginBottom: 8 },
  inputRow: {
    marginBottom: 12,
  },
  input: { backgroundColor: theme.colors.surface, color: theme.colors.textPrimary, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10 },
  primaryButton: { backgroundColor: theme.colors.brandPrimary, paddingVertical: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#2563EB' },
  primaryButtonText: { color: theme.colors.textPrimary, fontWeight: '600', fontSize: 16 },
  rowButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: { flex: 1, backgroundColor: theme.colors.surface, paddingVertical: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border },
  secondaryButtonText: { color: theme.colors.textPrimary, fontWeight: '600', fontSize: 16 },
  dangerGhostButton: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.danger },
  dangerGhostButtonText: { color: theme.colors.danger, fontWeight: '600' },
  biometricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  biometricStatus: {
    fontSize: 14,
  },
  statusOn: { color: theme.colors.brandAccent },
  statusOff: { color: theme.colors.textSecondary },
  signOutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface, padding: 16, borderRadius: 12, marginBottom: 32, borderWidth: 1, borderColor: theme.colors.danger, gap: 12 },
  signOutText: { color: theme.colors.danger, fontSize: 18, fontWeight: '600' },
  appInfo: {
    alignItems: 'center',
    paddingVertical: 20,
    marginTop: 20,
  },
  appInfoText: { color: theme.colors.textMuted, fontSize: 14, fontWeight: '500' },
  appInfoSubtext: { color: theme.colors.borderMuted, fontSize: 12, marginTop: 4 },
});
