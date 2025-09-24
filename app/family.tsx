import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert } from 'react-native';
import { ArrowLeft, Plus, Users, ShieldCheck } from 'lucide-react-native';
import { router } from 'expo-router';
import { db } from '../services/database';
import remoteApi from '../services/remote';

export default function FamilyScreen() {
  const [members, setMembers] = useState<any[]>(db.getMembers());
  const [name, setName] = useState('');
  const [role, setRole] = useState<'parent'|'member'|'child'>('member');
  const [relation, setRelation] = useState('member');
  const relationOptions = useMemo(() => {
    switch (role) {
      case 'parent':
        return ['owner','wife','husband','father','mother'] as const;
      case 'child':
        return ['son','daughter'] as const;
      default:
        return ['member','sibling','grandparent','guest','other'] as const;
    }
  }, [role]);
  const [pin, setPin] = useState('');
  const [showRolePicker, setShowRolePicker] = useState(false);

  const refresh = async () => {
    if (remoteApi.enabled) {
      try {
        const list = await remoteApi.listMembers();
        setMembers(list);
        db.replaceMembers(list);
      } catch {
        setMembers(db.getMembers());
      }
    } else {
      setMembers(db.getMembers());
    }
  };

  React.useEffect(() => { refresh(); }, []);

  const addMember = async () => {
    if (!name.trim()) { Alert.alert('Validation', 'Please enter a name'); return; }
    if (!pin.trim() || pin.trim().length < 4) { Alert.alert('Validation', 'PIN is mandatory (4–6 digits)'); return; }
    if (remoteApi.enabled) {
      try { await remoteApi.addMember({ name: name.trim(), role, relation, pin: pin.trim() }); }
      catch (e:any) { Alert.alert('Add member', e.message || 'Failed'); return; }
    } else {
      db.addMember({ name: name.trim(), role, relation, pin: pin.trim() });
    }
    setName(''); setPin(''); setRole('member');
    setRelation('member');
    refresh();
  };

  const updateMemberPolicies = async (memberId: string, updater: (policies: any) => any) => {
    const target = members.find((m) => String(m.id) === String(memberId));
    if (!target) return;
    const currentPolicies = JSON.parse(JSON.stringify(target.policies || db.defaultPolicies(target.role || 'member')));
    const updated = updater(currentPolicies);
    if (remoteApi.enabled) {
      try {
        await remoteApi.updateMember(memberId, { policies: updated });
      } catch (e: any) {
        Alert.alert('Update', e?.message || 'Failed to update permissions');
        return;
      }
    } else {
      db.updateMember(memberId, { policies: updated });
    }
    await refresh();
  };

  const togglePolicy = async (id: string, path: string) => {
    const [grp, key] = path.split('.');
    updateMemberPolicies(id, (policies) => {
      const copy = { ...policies, [grp]: { ...(policies?.[grp] || {}), [key]: !policies?.[grp]?.[key] } };
      return copy;
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.header}> 
          <Text style={styles.title}>Family Management</Text>
          <Text style={styles.subtitle}>Add members and set permissions</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Add Member */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Add Member</Text>
          {/* Full name */}
          <View style={styles.row}>
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Full name" placeholderTextColor="#6B7280" value={name} onChangeText={setName} />
          </View>
          {/* Role dropdown */}
          <View style={styles.row}>
            <TouchableOpacity style={[styles.input, styles.select]} onPress={() => setShowRolePicker((v)=>!v)}>
              <Text style={{ color: '#E5E7EB' }}>Role: {role}</Text>
            </TouchableOpacity>
          </View>
          {showRolePicker && (
            <View style={styles.dropdown}>
              {(['parent','member','child'] as const).map(opt => (
                <TouchableOpacity key={opt} style={styles.dropdownItem} onPress={() => { setRole(opt); setShowRolePicker(false); /* reset relation to first available */ setRelation((prev)=>{
                  const opts = opt==='parent'?['owner','wife','husband','father','mother']: opt==='child'?['son','daughter']: ['member','sibling','grandparent','guest','other'];
                  return opts[0];
                }); }}>
                  <Text style={{ color: '#E5E7EB', textTransform: 'capitalize' }}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {/* Relation chips (depend on role) */}
          <View style={[styles.row, { flexWrap: 'wrap' }]}> 
            {relationOptions.map((r: string) => (
              <TouchableOpacity key={r} style={[styles.chip, relation===r && styles.chipOn]} onPress={()=>setRelation(r)}>
                <Text style={[styles.chipText, relation===r && styles.chipTextOn]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {/* PIN required */}
          <View style={styles.row}>
            <TextInput style={styles.input} placeholder="PIN (required)" placeholderTextColor="#6B7280" keyboardType="number-pad" maxLength={6} value={pin} onChangeText={setPin} />
          </View>
          <Text style={{ color: '#9CA3AF', fontSize: 12 }}>PIN is required for first login; members can enable biometrics later.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={addMember}>
            <Plus size={18} color="#FFFFFF" />
            <Text style={styles.primaryText}>Add Member</Text>
          </TouchableOpacity>
        </View>

        {/* Members List */}
        <View style={styles.card}>
          <View style={styles.cardHeader}> 
            <Users size={18} color="#3B82F6" />
            <Text style={styles.cardTitle}>Members</Text>
          </View>
          {members.map((m:any) => (
            <View key={m.id} style={styles.memberItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName}>{m.name} <Text style={styles.roleTag}>({m.role}{m.relation?` • ${m.relation}`:''})</Text></Text>
                <Text style={styles.memberEmail}>{m.email || 'No email'}</Text>
              </View>
              <View style={styles.permsGrid}>
                <PermToggle label="Devices" value={!!m.policies.controls.devices} onToggle={() => togglePolicy(m.id, 'controls.devices')} />
                <PermToggle label="Doors" value={!!m.policies.controls.doors} onToggle={() => togglePolicy(m.id, 'controls.doors')} />
                <PermToggle label="Unlock" value={!!m.policies.controls.unlockDoors} onToggle={() => togglePolicy(m.id, 'controls.unlockDoors')} />
                <PermToggle label="Voice" value={!!m.policies.controls.voice} onToggle={() => togglePolicy(m.id, 'controls.voice')} />
                <PermToggle label="Power" value={!!m.policies.controls.power} onToggle={() => togglePolicy(m.id, 'controls.power')} />
              </View>

              {/* Room and device access */}
              <View style={{ marginTop: 8 }}>
                <Text style={{ color: '#9CA3AF', marginBottom: 6 }}>Area Access</Text>
                <AreaRow title="Hall" items={[['light','Light'],['ac','AC']]} member={m} area="hall" onToggle={(key)=>{
                  updateMemberPolicies(m.id, (policies) => {
                    const areas = { ...(policies.areas || {}) };
                    const curr = areas.hall || {};
                    areas.hall = { ...curr, [key]: !curr[key] };
                    return { ...policies, areas };
                  });
                }} />
                <AreaRow title="Kitchen" items={[['light','Light'],['ac','AC']]} member={m} area="kitchen" onToggle={(key)=>{
                  updateMemberPolicies(m.id, (policies) => {
                    const areas = { ...(policies.areas || {}) };
                    const curr = areas.kitchen || {};
                    areas.kitchen = { ...curr, [key]: !curr[key] };
                    return { ...policies, areas };
                  });
                }} />
                <AreaRow title="Bedroom" items={[['light','Light'],['ac','AC'],['door','Door']]} member={m} area="bedroom" onToggle={(key)=>{
                  updateMemberPolicies(m.id, (policies) => {
                    const areas = { ...(policies.areas || {}) };
                    const curr = areas.bedroom || {};
                    areas.bedroom = { ...curr, [key]: !curr[key] };
                    return { ...policies, areas };
                  });
                }} />
                <AreaRow title="Bathroom" items={[['light','Light'],['ac','AC'],['door','Door']]} member={m} area="bathroom" onToggle={(key)=>{
                  updateMemberPolicies(m.id, (policies) => {
                    const areas = { ...(policies.areas || {}) };
                    const curr = areas.bathroom || {};
                    areas.bathroom = { ...curr, [key]: !curr[key] };
                    return { ...policies, areas };
                  });
                }} />
                <AreaRow title="Main Door" items={[['door','Door']]} member={m} area="main" onToggle={(key)=>{
                  updateMemberPolicies(m.id, (policies) => {
                    const areas = { ...(policies.areas || {}) };
                    const curr = areas.main || {};
                    areas.main = { ...curr, [key]: !curr[key] };
                    return { ...policies, areas };
                  });
                }} />
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function PermToggle({ label, value, onToggle }: any) {
  return (
    <TouchableOpacity style={[styles.toggle, value && styles.toggleOn]} onPress={onToggle}>
      <Text style={[styles.toggleText, value && styles.toggleTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

function AreaRow({ title, items, member, area, onToggle }: any) {
  const curr = (member.policies.areas && member.policies.areas[area]) || {};
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={{ color: '#E5E7EB', marginBottom: 6 }}>{title}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {items.map(([key, label]: [string, string]) => (
          <TouchableOpacity key={key} style={[styles.toggle, curr[key] && styles.toggleOn]} onPress={()=>onToggle(key)}>
            <Text style={[styles.toggleText, curr[key] && styles.toggleTextOn]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 48, paddingHorizontal: 12 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1F2937', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#374151' },
  header: { alignItems: 'center', padding: 12 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#FFFFFF' },
  subtitle: { fontSize: 14, color: '#9CA3AF' },
  content: { flex: 1, padding: 20 },
  card: { backgroundColor: '#1F2937', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#374151', marginBottom: 16 },
  cardHeader: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 },
  cardTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  row: { flexDirection: 'row', gap: 12 },
  input: { flex: 1, backgroundColor: '#111827', color: '#FFFFFF', borderWidth: 1, borderColor: '#374151', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  select: { justifyContent: 'center' },
  dropdown: { backgroundColor: '#111827', borderWidth: 1, borderColor: '#374151', borderRadius: 10, marginTop: 6, marginBottom: 6 },
  dropdownItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#374151' },
  primaryBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#3B82F6', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#2563EB', marginTop: 12 },
  primaryText: { color: '#FFFFFF', fontWeight: '700' },
  memberItem: { borderTopWidth: 1, borderTopColor: '#374151', paddingVertical: 12 },
  memberName: { color: '#FFFFFF', fontWeight: '700' },
  roleTag: { color: '#9CA3AF', fontWeight: '400' },
  memberEmail: { color: '#9CA3AF', fontSize: 12 },
  permsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  toggle: { backgroundColor: '#111827', borderWidth: 1, borderColor: '#374151', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  toggleOn: { backgroundColor: 'rgba(59,130,246,0.15)', borderColor: '#3B82F6' },
  toggleText: { color: '#E5E7EB', fontWeight: '600' },
  toggleTextOn: { color: '#3B82F6' },
  chip: { backgroundColor: '#111827', borderWidth: 1, borderColor: '#374151', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8 },
  chipOn: { backgroundColor: 'rgba(59,130,246,0.15)', borderColor: '#3B82F6' },
  chipText: { color: '#9CA3AF', fontWeight: '600', textTransform: 'capitalize' },
  chipTextOn: { color: '#3B82F6' },
});
