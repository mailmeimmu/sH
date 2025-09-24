import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Lock, Unlock, List } from 'lucide-react-native';
import { db } from '../../services/database';
import remoteApi from '../../services/remote';

export default function DoorsScreen() {
  const [doors, setDoors] = useState<any>({});
  const events = useMemo(()=> db.getDoorEvents ? db.getDoorEvents() : [], [doors]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (remoteApi.enabled) {
        try { const snap = await remoteApi.getDoors(); if (mounted) setDoors(snap); } catch {}
      } else {
        const snap = Object.fromEntries(db.getAllDoors().map((k)=>[k, db.getDoorState(k)]));
        if (mounted) setDoors(snap as any);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  const toggle = async (name: string) => {
    if (remoteApi.enabled) {
      try { const r:any = await remoteApi.toggleDoor(name); setDoors((prev:any)=>({ ...prev, [name]: r.locked })); } catch (e:any) { Alert.alert('Door', e.message || 'Not allowed'); }
    } else {
      const res = db.toggleDoor(name);
      if (!res.success) { Alert.alert('Door', res.error || 'Not allowed'); return; }
      setDoors((prev:any)=>({ ...prev, [name]: res.locked }));
    }
  };

  const lockAll = async () => {
    if (remoteApi.enabled) { try { await remoteApi.lockAllDoors(); setDoors((prev:any)=>Object.fromEntries(Object.keys(prev).map(k=>[k,true])) as any); } catch (e:any) { Alert.alert('Door', e.message || 'Failed'); } }
    else { const r = db.lockAllDoors(); if (!r.success) { Alert.alert('Door', r.error); return; } setDoors((prev:any)=>Object.fromEntries(Object.keys(prev).map(k=>[k,true])) as any); }
  };
  const unlockAll = async () => {
    if (remoteApi.enabled) { try { await remoteApi.unlockAllDoors(); setDoors((prev:any)=>Object.fromEntries(Object.keys(prev).map(k=>[k,false])) as any); } catch (e:any) { Alert.alert('Door', e.message || 'Failed'); } }
    else { const r = db.unlockAllDoors(); if (!r.success) { Alert.alert('Door', r.error); return; } setDoors((prev:any)=>Object.fromEntries(Object.keys(prev).map(k=>[k,false])) as any); }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}> 
        <Text style={styles.title}>Doors</Text>
        <View style={styles.rowButtons}>
          <TouchableOpacity style={styles.secondaryButton} onPress={lockAll}><Text style={styles.secondaryButtonText}>Lock All</Text></TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={unlockAll}><Text style={styles.secondaryButtonText}>Unlock All</Text></TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content}>
        {Object.keys(doors).map((name) => (
          <View key={name} style={styles.doorRow}>
            <Text style={styles.doorLabel}>{labelize(name)}</Text>
            <TouchableOpacity style={[styles.lockButton, doors[name] ? styles.locked : styles.unlocked]} onPress={()=>toggle(name)}>
              {doors[name] ? <Lock size={18} color="#10B981" /> : <Unlock size={18} color="#EF4444" />}
              <Text style={[styles.lockText, doors[name] ? styles.lockedText : styles.unlockedText]}>{doors[name] ? 'Locked' : 'Unlocked'}</Text>
            </TouchableOpacity>
          </View>
        ))}

        <View style={styles.logCard}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <List size={16} color="#9CA3AF" />
            <Text style={styles.logTitle}>Activity Log</Text>
          </View>
          {events.length === 0 ? (
            <Text style={styles.logEmpty}>No activity yet</Text>
          ) : events.slice(0, 20).map((e:any, idx:number) => (
            <Text key={idx} style={styles.logItem}>{new Date(e.ts).toLocaleString()} • {e.type} • {e.door} • {e.success ? 'ok' : 'denied'}</Text>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function labelize(k:string) { return k.charAt(0).toUpperCase() + k.slice(1); }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  header: { padding: 20, paddingTop: 60 },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: 'bold', marginBottom: 12 },
  rowButtons: { flexDirection: 'row', gap: 12 },
  secondaryButton: { flex: 1, backgroundColor: '#1F2937', paddingVertical: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#374151' },
  secondaryButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 16 },
  content: { flex: 1, padding: 20 },
  doorRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1F2937', borderWidth: 1, borderColor: '#374151', borderRadius: 12, padding: 16, marginBottom: 12 },
  doorLabel: { color: '#E5E7EB', fontSize: 16, fontWeight: '600' },
  lockButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  locked: { borderColor: '#10B981', backgroundColor: 'rgba(16,185,129,0.1)' },
  unlocked: { borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,0.1)' },
  lockText: { fontWeight: '700' },
  lockedText: { color: '#10B981' },
  unlockedText: { color: '#EF4444' },
  logCard: { backgroundColor: '#1F2937', borderWidth: 1, borderColor: '#374151', borderRadius: 12, padding: 16, marginTop: 8 },
  logTitle: { color: '#9CA3AF', fontWeight: '700' },
  logEmpty: { color: '#6B7280' },
  logItem: { color: '#9CA3AF', fontSize: 12, paddingVertical: 2 },
});
