import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, FlatList, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Users, ShieldCheck, RefreshCcw, LogOut, Trash2, Edit3 } from 'lucide-react-native';
import remoteApi from '../services/remote';
import { db } from '../services/database';
import theme from '../theme';

const ROLE_OPTIONS: Array<'admin' | 'parent' | 'member'> = ['admin', 'parent', 'member'];

export default function AdminUsersScreen() {
  const [session, setSession] = useState<any>(() => db.getAdminSession());
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'parent' | 'member'>('parent');

  useEffect(() => {
    if (!session || !session.token) {
      router.replace('/admin-login');
      return;
    }
    remoteApi.setAdminToken(session.token);
    loadUsers();
  }, [session]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      let userList = [];
      
      if (remoteApi.enabled) {
        try {
          userList = await remoteApi.adminListUsers();
        } catch (error) {
          console.log('[AdminUsers] Remote users failed, using local fallback');
          userList = db.getAllUsers();
        }
      } else {
        userList = db.getAllUsers();
      }
      
      setUsers(userList);
    } catch (e: any) {
      console.log('[AdminUsers] Load users error:', e);
      // Fallback to local users
      setUsers(db.getAllUsers());
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = (user: any) => {
    Alert.alert(
      'Change Role',
      `Choose a new role for ${user.name}`,
      [
        ...ROLE_OPTIONS.map((role) => ({
          text: role === 'admin' ? 'Super Admin' : role.charAt(0).toUpperCase() + role.slice(1),
          onPress: () => applyRoleChange(user, role),
        })),
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true }
    );
  };

  const applyRoleChange = async (user: any, role: 'admin' | 'parent' | 'member') => {
    if (user.role === role) return;
    try {
      let success = false;
      
      if (remoteApi.enabled) {
        try {
          await remoteApi.adminUpdateUser(user.id, { role });
          success = true;
        } catch (error) {
          console.log('[AdminUsers] Remote update failed, trying local');
        }
      }
      
      if (!success) {
        const result = await db.adminUpdateUser(user.id, { role });
        if (!result.success) {
          Alert.alert('Update Failed', result.error || 'Could not update role.');
          return;
        }
      }
      
      Alert.alert('Updated', `${user.name} is now ${role}.`);
      loadUsers();
    } catch (e: any) {
      Alert.alert('Update Failed', e?.message || 'Could not update role.');
    }
  };

  const handleDelete = (user: any) => {
    if (session && session.id === user.id) {
      Alert.alert('Action not allowed', 'You cannot delete the signed-in admin.');
      return;
    }
    Alert.alert(
      'Remove User',
      `Are you sure you want to remove ${user.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              let success = false;
              
              if (remoteApi.enabled) {
                try {
                  await remoteApi.adminDeleteUser(user.id);
                  success = true;
                } catch (error) {
                  console.log('[AdminUsers] Remote delete failed, trying local');
                }
              }
              
              if (!success) {
                const result = await db.adminDeleteUser(user.id);
                if (!result.success) {
                  Alert.alert('Delete Failed', result.error || 'Could not remove user.');
                  return;
                }
              }
              
              loadUsers();
            } catch (e: any) {
              Alert.alert('Delete Failed', e?.message || 'Could not remove user.');
            }
          },
        },
      ]
    );
  };

  const handleCreate = async () => {
    if (!newName.trim()) { Alert.alert('Validation', 'Name is required.'); return; }
    if (!newPin.trim()) { Alert.alert('Validation', 'PIN is required.'); return; }
    try {
      setLoading(true);
      
      const userData = {
        name: newName.trim(),
        email: newEmail.trim() || undefined,
        pin: newPin.trim(),
        role: newRole,
        relation: newRole === 'parent' ? 'owner' : '',
      };
      
      let success = false;
      
      if (remoteApi.enabled) {
        try {
          await remoteApi.adminCreateUser(userData);
          success = true;
        } catch (error) {
          console.log('[AdminUsers] Remote create failed, trying local');
        }
      }
      
      if (!success) {
        const result = await db.adminCreateUser(userData);
        if (!result.success) {
          Alert.alert('Create Failed', result.error || 'Could not create user.');
          return;
        }
      }
      
      setNewName('');
      setNewEmail('');
      setNewPin('');
      setNewRole('parent');
      loadUsers();
    } catch (e: any) {
      Alert.alert('Create Failed', e?.message || 'Could not create user.');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    remoteApi.adminLogout();
    db.clearAdminSession();
    setSession(null);
    router.replace('/login');
  };

  if (!session) {
    return null;
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <ShieldCheck size={36} color={theme.colors.brandAccent} />
          <View>
            <Text style={styles.title}>User Management</Text>
            <Text style={styles.subtitle}>Signed in as {session.name}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <LogOut size={18} color="#FFFFFF" />
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.refreshButton} onPress={loadUsers} disabled={loading}>
          <RefreshCcw size={18} color={theme.colors.brandAccent} />
          <Text style={styles.refreshText}>{loading ? 'Refreshing…' : 'Refresh'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.form}>
        <Text style={styles.sectionTitle}>Register Owner / User</Text>
        <Text style={styles.sectionHint}>Create an owner account here. Owners can invite family members from the mobile app.</Text>
        <View style={styles.formGrid}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput style={styles.input} placeholder="Owner name" placeholderTextColor="#6B7280" value={newName} onChangeText={setNewName} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Email</Text>
            <TextInput style={styles.input} placeholder="owner@example.com" placeholderTextColor="#6B7280" value={newEmail} onChangeText={setNewEmail} autoCapitalize="none" keyboardType="email-address" />
          </View>
        </View>
        <View style={styles.formGrid}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>PIN</Text>
            <TextInput style={styles.input} placeholder="temporary PIN" placeholderTextColor="#6B7280" value={newPin} onChangeText={setNewPin} secureTextEntry keyboardType="number-pad" maxLength={6} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Role</Text>
            <View style={styles.roleRow}>
              {ROLE_OPTIONS.map((role) => (
                <TouchableOpacity key={role} style={[styles.roleChip, newRole === role && styles.roleChipOn]} onPress={() => setNewRole(role)}>
                  <Text style={[styles.roleChipText, newRole === role && styles.roleChipTextOn]}>{role === 'parent' ? 'Owner' : role === 'admin' ? 'Super Admin' : 'Member'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
        <TouchableOpacity style={styles.createButton} onPress={() => handleCreate()} disabled={loading}>
          <Text style={styles.createButtonText}>{loading ? 'Working…' : 'Create User'}</Text>
        </TouchableOpacity>
      </View>

      {loading && users.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={theme.colors.brandAccent} />
          <Text style={styles.loadingText}>Loading users…</Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={styles.userCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Users size={22} color={theme.colors.brandPrimary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName}>{item.name}</Text>
                  <Text style={styles.userEmail}>{item.email || 'No email'}</Text>
                  <Text style={styles.userRole}>Role: {item.role}</Text>
                </View>
              </View>
              <View style={styles.actionsRow}>
                <TouchableOpacity style={styles.actionButton} onPress={() => handleRoleChange(item)}>
                  <Edit3 size={16} color={theme.colors.brandAccent} />
                  <Text style={styles.actionText}>Change Role</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={() => handleDelete(item)}>
                  <Trash2 size={16} color="#F87171" />
                  <Text style={[styles.actionText, { color: '#F87171' }]}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    color: '#9CA3AF',
    marginTop: 4,
  },
  logoutButton: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    backgroundColor: '#EF4444',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  logoutText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 12,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.brandAccent,
  },
  refreshText: {
    color: theme.colors.brandAccent,
    fontWeight: '600',
  },
  form: {
    marginTop: 8,
    marginBottom: 24,
    backgroundColor: 'rgba(17, 24, 39, 0.6)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.25)',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sectionHint: {
    color: '#94A3B8',
  },
  formGrid: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  label: {
    color: '#E2E8F0',
    marginBottom: 6,
    fontWeight: '600',
  },
  input: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
  },
  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
  },
  roleChipOn: {
    borderColor: theme.colors.brandAccent,
    backgroundColor: 'rgba(59,130,246,0.15)',
  },
  roleChipText: {
    color: '#E2E8F0',
    fontWeight: '600',
  },
  roleChipTextOn: {
    color: theme.colors.brandAccent,
  },
  createButton: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.brandAccent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.brandAccent,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#9CA3AF',
  },
  userCard: {
    backgroundColor: 'rgba(17, 24, 39, 0.85)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.25)',
    gap: 12,
  },
  userName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  userEmail: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  userRole: {
    color: '#D1D5DB',
    fontSize: 14,
    marginTop: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.35)',
  },
  deleteButton: {
    borderColor: 'rgba(239,68,68,0.35)',
  },
  actionText: {
    color: theme.colors.brandAccent,
    fontWeight: '600',
  },
});
