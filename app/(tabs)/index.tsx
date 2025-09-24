import React, { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, RefreshControl } from 'react-native';
import { Screen, Container, SectionCard } from '../../components/Layout';
import { Home as HomeIcon, Lightbulb, Fan as FanIcon, Thermometer, Zap, Mic, Lock, Unlock, LogOut, Volume2 } from 'lucide-react-native';
import { router } from 'expo-router';
import { db } from '../../services/database';
import remoteApi, { type DeviceState } from '../../services/remote';
import theme from '../../theme';
import { voiceService } from '../../services/voice';
import { askGemini } from '../../services/gemini';
import InfoBanner from '../../components/InfoBanner';

type DeviceType = 'light' | 'fan' | 'ac';

type DeviceDescriptor = {
  id: string;
  label: string;
  type: DeviceType;
};

type ZoneDescriptor = {
  id: string;
  title: string;
  permissionKey: string;
  icon: ComponentType<{ size: number; color: string }>;
  devices: DeviceDescriptor[];
};

const DEVICE_ZONES: ZoneDescriptor[] = [
  {
    id: 'main-hall',
    title: 'Main Hall',
    permissionKey: 'hall',
    icon: HomeIcon,
    devices: [
      { id: 'mainhall-light-1', label: 'Light A', type: 'light' },
      { id: 'mainhall-light-2', label: 'Light B', type: 'light' },
      { id: 'mainhall-fan-1', label: 'Fan', type: 'fan' },
      { id: 'mainhall-ac-1', label: 'AC', type: 'ac' },
    ],
  },
  {
    id: 'bedroom-1',
    title: 'Bedroom 1',
    permissionKey: 'room1',
    icon: HomeIcon,
    devices: [
      { id: 'bedroom1-light-1', label: 'Light', type: 'light' },
      { id: 'bedroom1-fan-1', label: 'Fan', type: 'fan' },
      { id: 'bedroom1-ac-1', label: 'AC', type: 'ac' },
    ],
  },
  {
    id: 'bedroom-2',
    title: 'Bedroom 2',
    permissionKey: 'room1',
    icon: HomeIcon,
    devices: [
      { id: 'bedroom2-light-1', label: 'Light', type: 'light' },
      { id: 'bedroom2-fan-1', label: 'Fan', type: 'fan' },
      { id: 'bedroom2-ac-1', label: 'AC', type: 'ac' },
    ],
  },
  {
    id: 'kitchen',
    title: 'Kitchen',
    permissionKey: 'kitchen',
    icon: HomeIcon,
    devices: [
      { id: 'kitchen-light-1', label: 'Light', type: 'light' },
    ],
  },
];

const DEVICE_TYPE_INFO: Record<DeviceType, { icon: ComponentType<{ size: number; color: string }>; onColor: string; pill: string }> = {
  light: { icon: Lightbulb, onColor: '#F59E0B', pill: 'rgba(245,158,11,0.15)' },
  fan: { icon: FanIcon, onColor: '#8B5CF6', pill: 'rgba(139,92,246,0.15)' },
  ac: { icon: Thermometer, onColor: '#06B6D4', pill: 'rgba(6,182,212,0.15)' },
};

const ZONE_LOOKUP: Record<string, ZoneDescriptor> = DEVICE_ZONES.reduce((acc, zone) => {
  acc[zone.id] = zone;
  return acc;
}, {} as Record<string, ZoneDescriptor>);

const DEVICE_LOOKUP: Record<string, { device: DeviceDescriptor; zone: ZoneDescriptor }> = DEVICE_ZONES.reduce((acc, zone) => {
  zone.devices.forEach((device) => {
    acc[device.id] = { device, zone };
  });
  return acc;
}, {} as Record<string, { device: DeviceDescriptor; zone: ZoneDescriptor }>);

const ALL_DEVICE_IDS = Object.keys(DEVICE_LOOKUP);

export default function HomeControlScreen() {
  const [deviceStates, setDeviceStates] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    ALL_DEVICE_IDS.forEach((id) => { initial[id] = false; });
    return initial;
  });
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [doors, setDoors] = useState<Record<string, boolean>>({ main: true, front: true, back: true, garage: true });
  const [vaListening, setVaListening] = useState(false);
  const [vaSpeaking, setVaSpeaking] = useState(false);

  const loadDoorStates = useCallback(async () => {
    if (remoteApi.enabled) {
      try {
        const snapshot = await remoteApi.getDoors();
        setDoors(snapshot as Record<string, boolean>);
        return;
      } catch (e) {
        console.warn('[Home] failed to fetch doors', e);
      }
    }
    setDoors({
      main: db.getDoorState('main'),
      front: db.getDoorState('front'),
      back: db.getDoorState('back'),
      garage: db.getDoorState('garage'),
    } as Record<string, boolean>);
  }, []);

  const loadDeviceStates = useCallback(async () => {
    if (!remoteApi.enabled) return;
    setLoadingDevices(true);
    try {
      const snapshot = await remoteApi.getDeviceStates(ALL_DEVICE_IDS);
      setDeviceStates((prev) => {
        const next = { ...prev };
        ALL_DEVICE_IDS.forEach((id) => {
          const entry: DeviceState | undefined = snapshot[id];
          next[id] = entry ? !!entry.value : false;
        });
        return next;
      });
    } catch (e) {
      console.warn('[Home] failed to load device states', e);
    } finally {
      setLoadingDevices(false);
    }
  }, []);

  useEffect(() => {
    loadDoorStates();
  }, [loadDoorStates]);

  useEffect(() => {
    loadDeviceStates();
  }, [loadDeviceStates]);

  useEffect(() => {
    let stopped = false;
    const boot = async () => {
      setVaSpeaking(true);
      await voiceService.speak('Welcome to Smart Home. Try saying: turn on main hall light.');
      setVaSpeaking(false);
      if (!stopped && voiceService.isAvailable()) startAssistant();
    };
    boot();
    return () => { stopped = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startAssistant = async () => {
    if (vaSpeaking || !voiceService.isAvailable()) return;
    setVaListening(true);
    try {
      const result = await voiceService.startListening();
      setVaListening(false);
      const text = result?.transcript || '';
      if (text) await handleAssistantText(text);
    } catch (e) {
      setVaListening(false);
    } finally {
      setTimeout(() => startAssistant(), 300);
    }
  };

  const updateDeviceState = useCallback(async (deviceId: string, on: boolean) => {
    setDeviceStates((prev) => ({ ...prev, [deviceId]: on }));
    if (remoteApi.enabled) {
      try {
        await remoteApi.setDeviceState(deviceId, on ? 1 : 0);
      } catch (err) {
        setDeviceStates((prev) => ({ ...prev, [deviceId]: !on }));
        throw err;
      }
    }
  }, []);

  const handleDevicePress = useCallback(async (zone: ZoneDescriptor, device: DeviceDescriptor) => {
    if (!db.canDevice(zone.permissionKey, device.type)) {
      Alert.alert('Permission', `You are not allowed to control the ${device.label.toLowerCase()} in ${zone.title}.`);
      return;
    }
    const nextOn = !deviceStates[device.id];
    try {
      await updateDeviceState(device.id, nextOn);
    } catch (e: any) {
      Alert.alert('Device', e?.message || 'Failed to update device state.');
    }
  }, [deviceStates, updateDeviceState]);

  const setDevicesForZone = useCallback(async (zoneId: string, type: DeviceType, value: 'on' | 'off') => {
    const zone = ZONE_LOOKUP[zoneId];
    if (!zone) return;
    if (!db.canDevice(zone.permissionKey, type)) return;
    const targets = zone.devices.filter((d) => d.type === type);
    await Promise.all(targets.map(async (device) => {
      try {
        await updateDeviceState(device.id, value === 'on');
      } catch (e) {
        console.warn('[Voice] failed to set device', device.id, e);
      }
    }));
  }, [updateDeviceState]);

  const mapRoom = (room?: string) => {
    if (!room) return 'main-hall';
    const value = room.toLowerCase();
    if (value.includes('hall') || value.includes('main')) return 'main-hall';
    if (value.includes('kitchen')) return 'kitchen';
    if (value.includes('bedroom 2') || value.includes('room 2')) return 'bedroom-2';
    if (value.includes('bedroom') || value.includes('room')) return 'bedroom-1';
    return 'main-hall';
  };

  const handleAssistantText = async (text: string) => {
    try {
      const reply = await askGemini(text);
      if (!reply) return;
      if (reply.action === 'device.set') {
        const zoneId = mapRoom(reply.room);
        const type = (reply.device || 'light').toLowerCase() as DeviceType;
        const value = (reply.value || 'on').toLowerCase();
        await setDevicesForZone(zoneId, type, value === 'off' ? 'off' : 'on');
        await voiceService.speak(reply.say || `Turning ${value} ${type} in ${ZONE_LOOKUP[zoneId]?.title || 'home'}`);
      } else if (reply.action?.startsWith('door.')) {
        const door = (reply.door || 'main') as string;
        switch (reply.action) {
          case 'door.lock':
          case 'door.unlock': {
            const res = db.toggleDoor(door);
            await voiceService.speak(res.success ? (reply.say || 'Done.') : 'Action not allowed.');
            break;
          }
          case 'door.lock_all':
            db.lockAllDoors();
            await voiceService.speak(reply.say || 'All doors locked.');
            break;
          case 'door.unlock_all':
            db.unlockAllDoors();
            await voiceService.speak(reply.say || 'All doors unlocked.');
            break;
          default:
            await voiceService.speak(reply.say || 'Okay.');
        }
      } else {
        await voiceService.speak(reply.say || 'Okay.');
      }
    } catch (e) {
      console.warn('[Voice] interpretation failed', e);
    }
  };

  const handleVoiceControl = () => {
    if (!db.can('voice.use')) {
      Alert.alert('Permission', 'You are not allowed to use voice control.');
      return;
    }
    Alert.alert('Voice Control', 'Voice assistant will keep listening for commands.');
  };

  const performSignOut = () => {
    try { db.logout(); } catch {}
    router.replace('/login');
  };

  const toggleDoor = async (name: keyof typeof doors) => {
    if (remoteApi.enabled) {
      try {
        const response: any = await remoteApi.toggleDoor(name as string);
        setDoors((prev) => ({ ...prev, [name]: response.locked }));
      } catch (e: any) {
        Alert.alert('Door', e?.message || 'Failed to toggle door');
      }
    } else {
      const res = db.toggleDoor(name as string);
      if (!res.success) {
        Alert.alert('Door', res.error || 'Action not allowed');
        return;
      }
      setDoors((prev) => ({ ...prev, [name]: res.locked }));
    }
  };

  const lockAllDoors = async () => {
    if (remoteApi.enabled) {
      try {
        await remoteApi.lockAllDoors();
        setDoors((prev) => Object.fromEntries(Object.keys(prev).map((key) => [key, true])) as Record<string, boolean>);
      } catch (e: any) {
        Alert.alert('Door', e?.message || 'Failed to lock doors');
      }
    } else {
      db.lockAllDoors();
      setDoors((prev) => Object.fromEntries(Object.keys(prev).map((key) => [key, true])) as Record<string, boolean>);
    }
  };

  const unlockAllDoors = async () => {
    if (remoteApi.enabled) {
      try {
        await remoteApi.unlockAllDoors();
        setDoors((prev) => Object.fromEntries(Object.keys(prev).map((key) => [key, false])) as Record<string, boolean>);
      } catch (e: any) {
        Alert.alert('Door', e?.message || 'Failed to unlock doors');
      }
    } else {
      const res = db.unlockAllDoors();
      if (!res.success) {
        Alert.alert('Door', res.error || 'Action not allowed');
        return;
      }
      setDoors((prev) => Object.fromEntries(Object.keys(prev).map((key) => [key, false])) as Record<string, boolean>);
    }
  };

  const totalActive = useMemo(() => Object.values(deviceStates).filter(Boolean).length, [deviceStates]);
  const totalDevices = ALL_DEVICE_IDS.length;
  const estimatedPower = useMemo(() => (totalActive * 0.35).toFixed(2), [totalActive]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadDeviceStates(), loadDoorStates()]);
    setRefreshing(false);
  }, [loadDeviceStates, loadDoorStates]);

  return (
    <Screen>
      <Container style={{ paddingTop: 8, paddingBottom: 8 }}>
        <View style={styles.header}>
          <Text style={styles.title}>Home Control</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(vaListening || vaSpeaking) && (
              <View style={styles.assistantPill}>
                <Volume2 size={14} color={theme.colors.brandAccent} />
                <Text style={styles.assistantPillText}>{vaSpeaking ? 'Speaking' : 'Listening'}</Text>
              </View>
            )}
            <TouchableOpacity style={styles.voiceButton} onPress={handleVoiceControl}>
              <Mic size={24} color={theme.colors.brandAccent} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.voiceButton, { borderColor: theme.colors.danger }]} onPress={performSignOut}>
              <LogOut size={24} color={theme.colors.danger} />
            </TouchableOpacity>
          </View>
        </View>
      </Container>

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.brandAccent} />}>
        <Container>
          <View style={{ marginTop: 6, marginBottom: 12 }}>
            <InfoBanner>
              Main Hall has 2 lights, 1 fan, 1 AC. Each bedroom has 1 light, 1 fan, 1 AC. The kitchen has 1 light. Tap a tile to switch devices on or off.
            </InfoBanner>
          </View>

          <View style={styles.powerSummary}>
            <View style={styles.powerHeader}>
              <Zap size={20} color={theme.colors.warning} />
              <Text style={styles.powerTitle}>Active Devices</Text>
            </View>
            <Text style={styles.powerValue}>{totalActive} / {totalDevices}</Text>
            <Text style={styles.powerHint}>{loadingDevices ? 'Updating device states…' : `Estimated load ${estimatedPower} kW`}</Text>
          </View>

          <SectionCard style={{ marginBottom: 16 }}>
            <View style={styles.sectionHeader}>
              <Lock size={20} color={theme.colors.brandPrimary} />
              <Text style={styles.sectionTitle}>Door Locks</Text>
            </View>
            <View style={styles.lockRow}>
              <Text style={styles.lockLabel}>Main Door</Text>
              <TouchableOpacity style={[styles.lockButton, doors.main ? styles.locked : styles.unlocked]} onPress={() => toggleDoor('main')}>
                {doors.main ? <Lock size={18} color={theme.colors.brandAccent} /> : <Unlock size={18} color={theme.colors.danger} />}
                <Text style={[styles.lockText, doors.main ? styles.lockedText : styles.unlockedText]}>
                  {doors.main ? 'Locked' : 'Unlocked'}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.rowButtons}>
              <TouchableOpacity style={styles.secondaryButton} onPress={lockAllDoors}>
                <Text style={styles.secondaryButtonText}>Lock All</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={unlockAllDoors}>
                <Text style={styles.secondaryButtonText}>Unlock All</Text>
              </TouchableOpacity>
            </View>
          </SectionCard>

          {DEVICE_ZONES.map((zone) => (
            <DeviceZone
              key={zone.id}
              zone={zone}
              states={deviceStates}
              onToggle={handleDevicePress}
            />
          ))}
        </Container>
      </ScrollView>
    </Screen>
  );
}

type DeviceZoneProps = {
  zone: ZoneDescriptor;
  states: Record<string, boolean>;
  onToggle: (zone: ZoneDescriptor, device: DeviceDescriptor) => void | Promise<void>;
};

function DeviceZone({ zone, states, onToggle }: DeviceZoneProps) {
  const IconComponent = zone.icon;
  const activeCount = zone.devices.filter((device) => states[device.id]).length;

  return (
    <View style={styles.roomContainer}>
      <View style={styles.roomHeader}>
        <IconComponent size={20} color={theme.colors.brandPrimary} />
        <Text style={styles.roomTitle}>{zone.title}</Text>
        <View style={styles.powerBadge}>
          <Text style={styles.powerText}>{activeCount}/{zone.devices.length} ON</Text>
        </View>
      </View>
      <View style={styles.deviceGrid}>
        {zone.devices.map((device) => (
          <DeviceButton
            key={device.id}
            device={device}
            isOn={!!states[device.id]}
            onPress={() => onToggle(zone, device)}
          />
        ))}
      </View>
    </View>
  );
}

type DeviceButtonProps = {
  device: DeviceDescriptor;
  isOn: boolean;
  onPress: () => void;
};

function DeviceButton({ device, isOn, onPress }: DeviceButtonProps) {
  const info = DEVICE_TYPE_INFO[device.type];
  const Icon = info.icon;
  return (
    <TouchableOpacity style={[styles.deviceButton, isOn && styles.deviceButtonOn]} onPress={onPress}>
      <View style={[styles.deviceIcon, isOn && { backgroundColor: info.pill }]}>
        <Icon size={20} color={isOn ? info.onColor : '#6B7280'} />
      </View>
      <Text style={[styles.deviceButtonText, isOn && styles.deviceButtonTextOn]}>{device.label}</Text>
      <Text style={[styles.deviceStatus, isOn && styles.deviceStatusOn]}>{isOn ? 'ON' : 'OFF'}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  title: { fontSize: 24, fontWeight: 'bold', color: theme.colors.textPrimary },
  voiceButton: { backgroundColor: theme.colors.surface, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.brandAccent },
  assistantPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.brandAccent },
  assistantPillText: { color: theme.colors.brandAccent, fontSize: 12, fontWeight: '600' },
  powerSummary: { backgroundColor: theme.colors.surface, margin: 20, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.warning, alignItems: 'center', gap: 4 },
  powerHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  powerTitle: { color: theme.colors.textPrimary, fontSize: 16, fontWeight: '600' },
  powerValue: { color: theme.colors.warning, fontSize: 24, fontWeight: 'bold' },
  powerHint: { color: theme.colors.textSecondary, fontSize: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { color: theme.colors.textPrimary, fontSize: 16, fontWeight: '600' },
  lockRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  lockLabel: { color: '#E5E7EB', fontSize: 16, fontWeight: '600' },
  lockButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  locked: { borderColor: theme.colors.brandAccent, backgroundColor: 'rgba(16,185,129,0.1)' },
  unlocked: { borderColor: theme.colors.danger, backgroundColor: 'rgba(239,68,68,0.1)' },
  lockText: { fontWeight: '700' },
  lockedText: { color: theme.colors.brandAccent },
  unlockedText: { color: theme.colors.danger },
  rowButtons: { flexDirection: 'row', gap: 12 },
  secondaryButton: { flex: 1, backgroundColor: theme.colors.surface, paddingVertical: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border },
  secondaryButtonText: { color: theme.colors.textPrimary, fontWeight: '600', fontSize: 16 },
  roomContainer: { backgroundColor: theme.colors.surface, padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: theme.colors.border },
  roomHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 },
  roomTitle: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: 'bold', flex: 1 },
  powerBadge: { backgroundColor: theme.colors.surfaceAlt, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  powerText: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: '500' },
  deviceGrid: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  deviceButton: { backgroundColor: theme.colors.surfaceAlt, padding: 12, borderRadius: 8, minWidth: 90, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.borderMuted },
  deviceButtonOn: { backgroundColor: '#065F46', borderColor: theme.colors.brandAccent },
  deviceButtonText: { color: theme.colors.textPrimary, fontWeight: '600', marginTop: 6 },
  deviceButtonTextOn: { color: theme.colors.brandAccent },
  deviceIcon: { padding: 8, borderRadius: 12, backgroundColor: theme.colors.surface },
  deviceStatus: { marginTop: 2, fontSize: 12, color: theme.colors.textSecondary, fontWeight: '500' },
  deviceStatusOn: { color: theme.colors.brandAccent },
});
