import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Alert } from 'react-native';
import { router } from 'expo-router';
import { User, ArrowLeft, Fingerprint } from 'lucide-react-native';
import theme from '../theme';
import { db } from '../services/database';
import * as SecureStore from 'expo-secure-store';
import { biometricService } from '../services/biometric';

export default function BiometricLoginScreen() {
  const members = React.useMemo(() => db.getMembers(), [db.getMembers().length]);

  const handleSelect = async (member: any) => {
    try {
      const result = await biometricService.authenticate(`Confirm to login as ${member.name}`);
      if (!result.success) { Alert.alert('Authentication', result.error || 'Failed'); return; }
      db.currentUser = member;
      try { await SecureStore.setItemAsync('last_user_id', member.id); } catch {}
      router.replace('/(tabs)');
    } catch (e) {
      Alert.alert('Authentication', 'Biometric authentication failed');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Device Biometric Login</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.subtitle}>Choose your profile, then confirm with device biometrics.</Text>

      <FlatList
        data={members}
        keyExtractor={(item:any) => item.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => handleSelect(item)}>
            <View style={styles.avatar}><User size={24} color={theme.colors.brandPrimary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.email}>{item.email || 'No email'}</Text>
            </View>
            <Fingerprint size={22} color={theme.colors.brandAccent} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No members yet. Please register first.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 48, paddingHorizontal: 12, marginBottom: 4 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border },
  title: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: '700' },
  subtitle: { color: theme.colors.textSecondary, fontSize: 14, textAlign: 'center', paddingHorizontal: 16, marginTop: 8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, padding: 14, borderRadius: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  name: { color: theme.colors.textPrimary, fontSize: 16, fontWeight: '600' },
  email: { color: theme.colors.textSecondary, fontSize: 12 },
  empty: { color: theme.colors.textSecondary, textAlign: 'center', marginTop: 24 },
});

