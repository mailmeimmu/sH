import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Platform } from 'react-native';
import { Zap, Chrome as Home, Lightbulb, Fan, Thermometer } from 'lucide-react-native';
import { db } from '../../services/database';
import { computeCost, formatSar, sectorConfigs, validateCalculatorInputs, type SectorKey } from '../../services/cost';

export default function PowerUsageScreen() {
  const [powerData, setPowerData] = useState({
    total: 2.4,
    rooms: {
      room1: { total: 0.8, light: 0.1, fan: 0.3, ac: 0.4 },
      hall: { total: 0.6, light: 0.1, fan: 0.2, ac: 0.3 },
      kitchen: { total: 0.4, light: 0.1, appliances: 0.3 },
      bathroom: { total: 0.15, light: 0.1, exhaust: 0.05 },
    },
    cost: {
      current: 12.50,
      daily: 57.60,
      monthly: 1728.00,
    }
  });
  const [sector, setSector] = useState<SectorKey>('residential');
  const [usageInput, setUsageInput] = useState('');
  const [rateInput, setRateInput] = useState('');
  const [calculatedCost, setCalculatedCost] = useState<number | null>(null);
  const [calculatorError, setCalculatorError] = useState<string | null>(null);

  const selectedSectorConfig = sectorConfigs[sector];

  // Simulate real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      setPowerData(prev => ({
        ...prev,
        total: prev.total + (Math.random() - 0.5) * 0.1,
        rooms: {
          ...prev.rooms,
          room1: {
            ...prev.rooms.room1,
            total: prev.rooms.room1.total + (Math.random() - 0.5) * 0.05,
          },
          hall: {
            ...prev.rooms.hall,
            total: prev.rooms.hall.total + (Math.random() - 0.5) * 0.05,
          },
        }
      }));
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const sanitizeNumericInput = (value: string) => value.replace(/[^0-9.]/g, '');

  const handleUsageChange = (value: string) => {
    setUsageInput(sanitizeNumericInput(value));
    setCalculatorError(null);
    setCalculatedCost(null);
  };

  const handleRateChange = (value: string) => {
    setRateInput(sanitizeNumericInput(value));
    setCalculatorError(null);
    setCalculatedCost(null);
  };

  const handleSectorChange = (nextSector: SectorKey) => {
    setSector(nextSector);
    setCalculatorError(null);
    setCalculatedCost(null);
    setRateInput('');
  };

  const handleCalculate = () => {
    const parsedUsage = parseFloat(usageInput);
    const parsedRate = parseFloat(rateInput);

    const validationMessage = validateCalculatorInputs(parsedUsage, parsedRate, sector);
    if (validationMessage) {
      setCalculatorError(validationMessage);
      setCalculatedCost(null);
      return;
    }

    const cost = computeCost(parsedUsage, parsedRate);
    setCalculatedCost(cost);
    setCalculatorError(null);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Power Usage</Text>
        <Text style={styles.subtitle}>Real-time energy monitoring</Text>
      </View>
      {!db.can('power.view') && (
        <View style={{ backgroundColor: '#1F2937', borderColor: '#374151', borderWidth: 1, borderRadius: 12, padding: 12, marginHorizontal: 20, marginBottom: 12 }}>
          <Text style={{ color: '#F59E0B' }}>Power usage is not available for your account.</Text>
        </View>
      )}

      <ScrollView style={styles.content}>
        {/* Total Usage Card */}
        <View style={styles.totalCard}>
          <View style={styles.totalHeader}>
            <Zap size={24} color="#10B981" />
            <Text style={styles.totalTitle}>Total Consumption</Text>
          </View>
          <Text style={styles.totalValue}>{powerData.total.toFixed(2)} kW</Text>
          <Text style={styles.totalSubtext}>Current usage</Text>
          
          <View style={styles.costContainer}>
            <Text style={styles.costLabel}>Current Cost: {formatSar(powerData.cost.current)} / hour</Text>
            <Text style={styles.costLabel}>Daily: {formatSar(powerData.cost.daily)}</Text>
            <Text style={styles.costLabel}>Monthly: {formatSar(powerData.cost.monthly)}</Text>
          </View>
        </View>

        {/* Saudi Electricity Cost Calculator */}
        <View style={styles.calculatorCard}>
          <Text style={styles.calculatorTitle}>Saudi Electricity Cost Calculator</Text>
          <Text style={styles.calculatorSubtitle}>
            Estimate your electricity cost in Saudi Riyals based on sector tariffs.
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Energy Usage (kWh)</Text>
            <TextInput
              value={usageInput}
              onChangeText={handleUsageChange}
              placeholder="e.g., 400"
              placeholderTextColor="#6B7280"
              keyboardType={Platform.select({ ios: 'decimal-pad', default: 'numeric' })}
              style={styles.input}
              returnKeyType="done"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Sector</Text>
            <View style={styles.sectorRow}>
              {(['residential', 'commercial'] as SectorKey[]).map((option) => {
                const optionConfig = sectorConfigs[option];
                const isActive = sector === option;
                return (
                  <TouchableOpacity
                    key={option}
                    style={[styles.sectorOption, isActive && styles.sectorOptionActive]}
                    onPress={() => handleSectorChange(option)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.sectorOptionText, isActive && styles.sectorOptionTextActive]}>
                      {optionConfig.label}
                    </Text>
                    <Text style={[styles.sectorRateRange, isActive && styles.sectorRateRangeActive]}>
                      {optionConfig.minRateHalala}-{optionConfig.maxRateHalala} halalas/kWh
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Rate (halalas per kWh)</Text>
            <TextInput
              value={rateInput}
              onChangeText={handleRateChange}
              placeholder={`e.g., ${selectedSectorConfig.minRateHalala}`}
              placeholderTextColor="#6B7280"
              keyboardType={Platform.select({ ios: 'number-pad', default: 'numeric' })}
              style={styles.input}
              returnKeyType="done"
            />
            <Text style={styles.helperText}>
              Allowed range: {selectedSectorConfig.minRateHalala}-{selectedSectorConfig.maxRateHalala} halalas/kWh
            </Text>
          </View>

          {calculatorError ? (
            <Text style={styles.errorText}>{calculatorError}</Text>
          ) : null}

          {calculatedCost !== null && !calculatorError ? (
            <View style={styles.resultBox}>
              <Text style={styles.resultLabel}>Estimated Cost</Text>
              <Text style={styles.resultValue}>{formatSar(calculatedCost)}</Text>
            </View>
          ) : null}

          <TouchableOpacity style={styles.calculateButton} onPress={handleCalculate} activeOpacity={0.85}>
            <Text style={styles.calculateButtonText}>Calculate Cost</Text>
          </TouchableOpacity>
        </View>

        {/* Room-wise Usage */}
        <Text style={styles.sectionTitle}>Room-wise Usage</Text>
        
        <RoomUsageCard 
          title="Room 1"
          icon={<Home size={20} color="#3B82F6" />}
          data={powerData.rooms.room1}
          devices={['light', 'fan', 'ac']}
        />
        
        <RoomUsageCard 
          title="Hall"
          icon={<Home size={20} color="#3B82F6" />}
          data={powerData.rooms.hall}
          devices={['light', 'fan', 'ac']}
        />
        
        <RoomUsageCard 
          title="Kitchen"
          icon={<Home size={20} color="#3B82F6" />}
          data={powerData.rooms.kitchen}
          devices={['light', 'appliances']}
        />
        
        <RoomUsageCard 
          title="Bathroom"
          icon={<Home size={20} color="#3B82F6" />}
          data={powerData.rooms.bathroom}
          devices={['light', 'exhaust']}
        />

        {/* Usage Tips */}
        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>Energy Saving Tips</Text>
          <Text style={styles.tipText}>• Turn off AC when not needed to save up to 40% energy</Text>
          <Text style={styles.tipText}>• Use LED lights to reduce lighting consumption by 75%</Text>
          <Text style={styles.tipText}>• Set AC temperature to 24°C for optimal efficiency</Text>
          <Text style={styles.tipText}>• Turn off fans when room is unoccupied</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function RoomUsageCard({ title, icon, data, devices }: any) {
  const getDeviceIcon = (device: string) => {
    switch (device) {
      case 'light': return <Lightbulb size={16} color="#F59E0B" />;
      case 'fan': return <Fan size={16} color="#8B5CF6" />;
      case 'ac': return <Thermometer size={16} color="#06B6D4" />;
      default: return <Zap size={16} color="#6B7280" />;
    }
  };

  return (
    <View style={styles.roomCard}>
      <View style={styles.roomHeader}>
        {icon}
        <Text style={styles.roomTitle}>{title}</Text>
        <Text style={styles.roomTotal}>{data.total.toFixed(2)} kW</Text>
      </View>
      
      <View style={styles.devicesContainer}>
        {devices.map((device: string) => (
          <View key={device} style={styles.deviceItem}>
            {getDeviceIcon(device)}
            <Text style={styles.deviceName}>{device}</Text>
            <Text style={styles.deviceValue}>{data[device]?.toFixed(2) || '0.00'} kW</Text>
          </View>
        ))}
      </View>
      
      {/* Usage Bar */}
      <View style={styles.usageBar}>
        <View style={[styles.usageBarFill, { width: `${Math.min(data.total * 50, 100)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  header: {
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#9CA3AF',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  totalCard: {
    backgroundColor: '#1F2937',
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  totalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  totalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  totalValue: {
    color: '#10B981',
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  totalSubtext: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 16,
  },
  costContainer: {
    gap: 4,
  },
  costLabel: {
    color: '#D1D5DB',
    fontSize: 14,
  },
  calculatorCard: {
    backgroundColor: '#1F2937',
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  calculatorTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  calculatorSubtitle: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F9FAFB',
    fontSize: 16,
  },
  sectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  sectorOption: {
    width: '48%',
    marginHorizontal: 6,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#111827',
  },
  sectorOptionActive: {
    backgroundColor: '#1D4ED8',
    borderColor: '#60A5FA',
  },
  sectorOptionText: {
    color: '#BFDBFE',
    fontSize: 14,
    fontWeight: '600',
  },
  sectorOptionTextActive: {
    color: '#FFFFFF',
  },
  sectorRateRange: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 6,
  },
  sectorRateRangeActive: {
    color: '#DBEAFE',
  },
  helperText: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 6,
  },
  errorText: {
    color: '#F87171',
    fontSize: 14,
    marginBottom: 12,
  },
  resultBox: {
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#10B981',
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  resultLabel: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 6,
  },
  resultValue: {
    color: '#10B981',
    fontSize: 28,
    fontWeight: 'bold',
  },
  calculateButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  calculateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  roomCard: {
    backgroundColor: '#1F2937',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  roomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  roomTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  roomTotal: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: 'bold',
  },
  devicesContainer: {
    gap: 8,
    marginBottom: 12,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  deviceName: {
    color: '#D1D5DB',
    fontSize: 14,
    flex: 1,
    textTransform: 'capitalize',
  },
  deviceValue: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '500',
  },
  usageBar: {
    height: 4,
    backgroundColor: '#374151',
    borderRadius: 2,
    overflow: 'hidden',
  },
  usageBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 2,
  },
  tipsCard: {
    backgroundColor: '#1F2937',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#374151',
  },
  tipsTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  tipText: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 6,
  },
});
