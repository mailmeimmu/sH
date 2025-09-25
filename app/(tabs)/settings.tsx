import React, { useState } from 'react';
import type { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { Screen, Container } from '../../components/Layout';
import { router } from 'expo-router';
import { User, Bell, Palette, Wifi, CircleHelp as HelpCircle, LogOut, ShieldCheck, Mic } from 'lucide-react-native';
import { db } from '../../services/database';
import remoteApi from '../../services/remote';
import ConfirmDialog from '../../components/ConfirmDialog';
import theme from '../../theme';

export default function SettingsScreen() {
  const [notifications, setNotifications] = useState(true);
  const [autoLights, setAutoLights] = useState(false);
  const [energySaver, setEnergySaver] = useState(true);
  const [showSignOut, setShowSignOut] = useState(false);
  // Guest mode removed

  const performSignOut = async () => {
    try {
      db.logout();
    } catch {}
    console.log('[NafisaSmartHome] Signing out -> /login');
    router.replace('/login');
  };

  const handleSignOut = () => {
    setShowSignOut(true);
  };

  return (
    <Screen>
      <Container>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>Manage your account and settings</Text>
        </View>
      </Container>

      <ScrollView contentContainerStyle={{ paddingVertical: 16 }}>
        <Container>
          {/* Profile Info */}
          <View style={styles.profileCard}>
            <View style={styles.avatarContainer}>
              <User size={64} color={theme.colors.brandPrimary} />
            </View>
            <Text style={styles.userName}>{(db.getCurrentUser()?.name) || 'User'}</Text>
            <Text style={styles.userEmail}>{(db.getCurrentUser()?.email) || ''}</Text>
          </View>

        {/* Account Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <SettingsItem 
            icon={<User size={20} color="#3B82F6" />}
            title="Edit Profile"
            subtitle="Update your personal information"
            onPress={() => router.push('/profile')}
            showArrow
          />
          {(() => { const u = db.getCurrentUser(); const isOwner = u?.role === 'parent' || u?.relation === 'owner'; return isOwner; })() && (
            <SettingsItem 
              icon={<ShieldCheck size={20} color="#10B981" />}
              title="Family Management"
              subtitle="Add members and set permissions"
              onPress={() => router.push('/family')}
              showArrow
            />
          )}
        </View>

        {/* Security Settings moved to Profile screen */}

        {/* Device Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Device Preferences</Text>
          
          <SettingsItem 
            icon={<Bell size={20} color="#F59E0B" />}
            title="Notifications"
            subtitle="Device alerts and updates"
            showToggle={true}
            toggleValue={notifications}
            onToggle={(value) => setNotifications(value)}
          />
          
          <SettingsItem 
            icon={<Palette size={20} color="#8B5CF6" />}
            title="Auto Lights"
            subtitle="Automatic lighting control"
            showToggle={true}
            toggleValue={autoLights}
            onToggle={(value) => setAutoLights(value)}
          />
          
          <SettingsItem 
            icon={<Wifi size={20} color="#06B6D4" />}
            title="Energy Saver"
            subtitle="Optimize power consumption"
            showToggle={true}
            toggleValue={energySaver}
            onToggle={(value) => setEnergySaver(value)}
          />
          <SettingsItem
            icon={<Mic size={20} color="#10B981" />}
            title="Voice Assistant"
            subtitle="Enable or disable voice control"
            showToggle={true}
            toggleValue={db.can('voice.use')}
            onToggle={async (value: boolean) => {
              const u = db.getCurrentUser();
              if (u) {
                const policies = u.policies || db.defaultPolicies(u.role);
                policies.controls.voice = value;
                if (remoteApi.enabled) {
                  try { await remoteApi.updateMember(u.id, { policies }); } catch {}
                  db.updateMember(u.id, { policies });
                } else {
                  db.updateMember(u.id, { policies });
                }
                // Force a re-render to update the toggle
                setAutoLights(v => !v);
                setAutoLights(v => !v);
              }
            }}
          />
        </View>

        {/* Support */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support</Text>
          
          <SettingsItem 
            icon={<HelpCircle size={20} color="#9CA3AF" />}
            title="Help & Support"
            subtitle="Get help with your smart home"
            onPress={() => {}}
            showArrow
          />
        </View>

          {/* Sign Out */}
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <LogOut size={24} color={theme.colors.danger} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>

          {/* App Info */}
          <View style={styles.appInfo}>
            <Text style={styles.appInfoText}>Smart Home By Nafisa Tabasum</Text>
            <Text style={styles.appInfoSlogan}>Simple and safe home control</Text>
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

type SettingsItemProps = {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onPress?: () => void;
  showArrow?: boolean;
  showToggle?: boolean;
  toggleValue?: boolean;
  onToggle?: (value: boolean) => void | Promise<void>;
};

function SettingsItem({ icon, title, subtitle, onPress, showArrow, showToggle, toggleValue = false, onToggle }: SettingsItemProps) {
  return (
    <TouchableOpacity style={styles.settingsItem} onPress={onPress} disabled={!onPress}>
      <View style={styles.settingsItemLeft}>
        <View style={styles.iconContainer}>
          {icon}
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.itemTitle}>{title}</Text>
          <Text style={styles.itemSubtitle}>{subtitle}</Text>
        </View>
      </View>
      
      <View style={styles.settingsItemRight}>
        {showToggle ? (
          <TouchableOpacity 
            style={[styles.toggle, toggleValue && styles.toggleActive]}
            onPress={() => onToggle?.(!toggleValue)}
          >
            <View style={[styles.toggleButton, toggleValue && styles.toggleButtonActive]} />
          </TouchableOpacity>
        ) : showArrow ? (
          <Text style={styles.arrow}>›</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: { alignItems: 'center', paddingVertical: 12 },
  title: { fontSize: 28, fontWeight: 'bold', color: theme.colors.textPrimary, marginBottom: 8 },
  subtitle: { fontSize: 16, color: theme.colors.textSecondary },
  content: { flex: 1, padding: 20 },
  profileCard: { backgroundColor: theme.colors.surface, padding: 24, borderRadius: 16, alignItems: 'center', marginBottom: 32, borderWidth: 1, borderColor: theme.colors.border },
  avatarContainer: { width: 80, height: 80, backgroundColor: theme.colors.surfaceAlt, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  userName: { color: theme.colors.textPrimary, fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  userEmail: { color: theme.colors.textSecondary, fontSize: 16 },
  section: {
    marginBottom: 32,
  },
  sectionTitle: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: 'bold', marginBottom: 16, paddingLeft: 4 },
  settingsItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surface, padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: theme.colors.border },
  settingsItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: { width: 40, height: 40, backgroundColor: theme.colors.surfaceAlt, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  textContainer: {
    flex: 1,
  },
  itemTitle: { color: theme.colors.textPrimary, fontSize: 16, fontWeight: '600', marginBottom: 2 },
  itemSubtitle: { color: theme.colors.textSecondary, fontSize: 14 },
  settingsItemRight: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggle: { width: 44, height: 24, backgroundColor: theme.colors.surfaceAlt, borderRadius: 12, padding: 2 },
  toggleActive: { backgroundColor: theme.colors.brandAccent },
  toggleButton: { width: 20, height: 20, backgroundColor: theme.colors.textSecondary, borderRadius: 10, marginLeft: 0 },
  toggleButtonActive: { backgroundColor: theme.colors.textPrimary, marginLeft: 20 },
  arrow: { color: theme.colors.textMuted, fontSize: 20, fontWeight: 'bold' },
  signOutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface, padding: 16, borderRadius: 12, marginBottom: 32, borderWidth: 1, borderColor: theme.colors.danger, gap: 12 },
  signOutText: { color: theme.colors.danger, fontSize: 18, fontWeight: '600' },
  appInfo: {
    alignItems: 'center',
    paddingVertical: 20,
    marginTop: 20,
  },
  appInfoText: { color: theme.colors.textMuted, fontSize: 14, fontWeight: '500' },
  appInfoSlogan: { color: theme.colors.borderMuted, fontSize: 12, marginTop: 4 },
});
