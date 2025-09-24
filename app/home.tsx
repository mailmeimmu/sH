import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import { Chrome as Home, Lightbulb, Fan, Thermometer, Zap, ArrowLeft, Mic } from 'lucide-react-native';
import { voiceService } from '../services/voice';
import { db } from '../services/database';
import theme from '../theme';

let welcomeSpoken = false;

export default function HomeControlScreen() {
  const [devices, setDevices] = useState({
    mainhall: { lightA: false, lightB: false, fan: false, ac: false },
    bedroom1: { light: false, fan: false, ac: false },
    bedroom2: { light: false, fan: false, ac: false },
    kitchen: { light: false },
  });

  useEffect(() => {
    if (db.can('voice.use') && !welcomeSpoken) {
      voiceService.speakWelcomeMessage();
      welcomeSpoken = true;
    }
  }, []);

  const [powerUsage] = useState({
    total: 2.4,
    rooms: {
      mainhall: 0.7,
      bedroom1: 0.6,
      bedroom2: 0.5,
      kitchen: 0.2,
    }
  });

  const toggleDevice = (room: string, device: string) => {
    setDevices(prev => ({
      ...prev,
      [room]: {
        ...prev[room],
        [device]: !prev[room][device],
      },
    }));
  };

  const handleVoiceControl = () => {
    Alert.alert(
      'Voice Control',
      'Voice control feature will be activated',
      [{ text: 'OK', onPress: () => {} }]
    );
  };

  const goBack = () => {
    router.back();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={goBack}>
          <ArrowLeft size={24} color="#3B82F6" />
        </TouchableOpacity>
        <Text style={styles.title}>Home Control</Text>
        <TouchableOpacity style={styles.voiceButton} onPress={handleVoiceControl}>
          <Mic size={24} color="#10B981" />
        </TouchableOpacity>
      </View>

      {/* Power Usage Summary */}
      <View style={styles.powerSummary}>
        <View style={styles.powerHeader}>
          <Zap size={20} color="#F59E0B" />
          <Text style={styles.powerTitle}>Total Power Usage</Text>
        </View>
        <Text style={styles.powerValue}>{powerUsage.total} kW</Text>
      </View>

      <ScrollView style={styles.content}>
        <DeviceRoom 
          title="Main Hall" 
          icon={<Home size={20} color="#3B82F6" />}
          devices={devices.mainhall} 
          onToggle={(device) => toggleDevice('mainhall', device)}
          powerUsage={powerUsage.rooms.mainhall}
          variant="mainhall"
        />
        
        <DeviceRoom 
          title="Bedroom 1" 
          icon={<Home size={20} color="#3B82F6" />}
          devices={devices.bedroom1} 
          onToggle={(device) => toggleDevice('bedroom1', device)}
          powerUsage={powerUsage.rooms.bedroom1}
        />
        
        <DeviceRoom 
          title="Bedroom 2" 
          icon={<Home size={20} color="#3B82F6" />}
          devices={devices.bedroom2} 
          onToggle={(device) => toggleDevice('bedroom2', device)}
          powerUsage={powerUsage.rooms.bedroom2}
        />
        
        <DeviceRoom 
          title="Kitchen" 
          icon={<Home size={20} color="#3B82F6" />}
          devices={devices.kitchen} 
          onToggle={(device) => toggleDevice('kitchen', device)}
          powerUsage={powerUsage.rooms.kitchen}
          variant="kitchen"
        />
      </ScrollView>
    </View>
  );
}

function DeviceRoom({ title, icon, devices, onToggle, powerUsage, variant }: any) {
  return (
    <View style={styles.roomContainer}>
      <View style={styles.roomHeader}>
        {icon}
        <Text style={styles.roomTitle}>{title}</Text>
        <View style={styles.powerBadge}>
          <Text style={styles.powerText}>{powerUsage}kW</Text>
        </View>
      </View>
      
      <View style={styles.deviceGrid}>
        {variant === 'mainhall' ? (
          <>
            <DeviceButton 
              name="Light A" 
              icon={<Lightbulb size={20} color={devices.lightA ? '#F59E0B' : '#6B7280'} />}
              isOn={devices.lightA} 
              onPress={() => onToggle('lightA')}
            />
            <DeviceButton 
              name="Light B" 
              icon={<Lightbulb size={20} color={devices.lightB ? '#F59E0B' : '#6B7280'} />}
              isOn={devices.lightB} 
              onPress={() => onToggle('lightB')}
            />
            <DeviceButton 
              name="Fan" 
              icon={<Fan size={20} color={devices.fan ? '#8B5CF6' : '#6B7280'} />}
              isOn={devices.fan} 
              onPress={() => onToggle('fan')}
            />
            <DeviceButton 
              name="AC" 
              icon={<Thermometer size={20} color={devices.ac ? '#06B6D4' : '#6B7280'} />}
              isOn={devices.ac} 
              onPress={() => onToggle('ac')}
            />
          </>
        ) : variant === 'kitchen' ? (
          <DeviceButton 
            name="Light" 
            icon={<Lightbulb size={20} color={devices.light ? '#F59E0B' : '#6B7280'} />}
            isOn={devices.light} 
            onPress={() => onToggle('light')}
          />
        ) : (
          <>
            <DeviceButton 
              name="Light" 
              icon={<Lightbulb size={20} color={devices.light ? '#F59E0B' : '#6B7280'} />}
              isOn={devices.light} 
              onPress={() => onToggle('light')}
            />
            <DeviceButton 
              name="Fan" 
              icon={<Fan size={20} color={devices.fan ? '#8B5CF6' : '#6B7280'} />}
              isOn={devices.fan} 
              onPress={() => onToggle('fan')}
            />
            <DeviceButton 
              name="AC" 
              icon={<Thermometer size={20} color={devices.ac ? '#06B6D4' : '#6B7280'} />}
              isOn={devices.ac} 
              onPress={() => onToggle('ac')}
            />
          </>
        )}
      </View>
    </View>
  );
}

function DeviceButton({ name, icon, isOn, onPress }: any) {
  return (
    <TouchableOpacity 
      style={[styles.deviceButton, isOn && styles.deviceButtonOn]} 
      onPress={onPress}
    >
      <View style={styles.deviceIcon}>
        {icon}
      </View>
      <Text style={[styles.deviceButtonText, isOn && styles.deviceButtonTextOn]}>
        {name}
      </Text>
      <Text style={[styles.deviceStatus, isOn && styles.deviceStatusOn]}>
        {isOn ? 'ON' : 'OFF'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 60,
  },
  backButton: {
    padding: 8,
  },
  title: { fontSize: 20, fontWeight: 'bold', color: theme.colors.textPrimary },
  voiceButton: { backgroundColor: theme.colors.surface, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.brandAccent },
  powerSummary: { backgroundColor: theme.colors.surface, margin: 20, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.warning, alignItems: 'center' },
  powerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  powerTitle: { color: theme.colors.textPrimary, fontSize: 16, fontWeight: '600' },
  powerValue: { color: theme.colors.warning, fontSize: 24, fontWeight: 'bold' },
  content: { flex: 1, padding: 20 },
  roomContainer: { backgroundColor: theme.colors.surface, padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: theme.colors.border },
  roomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  roomTitle: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: 'bold', flex: 1 },
  powerBadge: { backgroundColor: theme.colors.surfaceAlt, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  powerText: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: '500' },
  deviceGrid: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  deviceButton: { backgroundColor: theme.colors.surfaceAlt, padding: 12, borderRadius: 8, minWidth: 80, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.borderMuted },
  deviceButtonOn: { backgroundColor: '#065F46', borderColor: theme.colors.brandAccent },
  deviceIcon: {
    marginBottom: 8,
  },
  deviceButtonText: { color: '#D1D5DB', fontSize: 14, fontWeight: '600', marginBottom: 2 },
  deviceButtonTextOn: { color: theme.colors.textPrimary },
  deviceStatus: { color: theme.colors.textSecondary, fontSize: 10 },
  deviceStatusOn: { color: theme.colors.brandAccent },
});
