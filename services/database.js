// Database service for user management
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

export const DOOR_LABELS = {
  mainhall: 'Main Hall',
  bedroom1: 'Bedroom 1',
  bedroom2: 'Bedroom 2',
  kitchen: 'Kitchen',
};

export const DOOR_KEYS = Object.keys(DOOR_LABELS);

function openDb() {
  try {
    // SQLite is not available on web, return null
    if (Platform.OS === 'web') {
      console.log('[DB] SQLite not available on web, using memory storage');
      return null;
    }
    // Use classic WebSQL-style API for broad compatibility (Expo Go, Dev Client)
    const db = SQLite.openDatabase('fawzino.db');
    return db;
  } catch (e) {
    return null;
  }
}

// Web storage helpers
const webStorage = {
  getItem: (key) => {
    if (Platform.OS !== 'web') return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    if (Platform.OS !== 'web') return;
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
  removeItem: (key) => {
    if (Platform.OS !== 'web') return;
    try {
      localStorage.removeItem(key);
    } catch {}
  }
};

async function exec(db, sql, params = []) {
  if (Platform.OS === 'web' || !db) {
    // Web fallback - just resolve
    return Promise.resolve(null);
  }
  return new Promise((resolve, reject) => {
    try {
      if (db && db.transaction) {
        db.transaction(tx => {
          tx.executeSql(sql, params, (_, res) => resolve(res), (_, err) => { reject(err); return true; });
        });
      } else {
        resolve(null);
      }
    } catch (e) { reject(e); }
  });
}

async function queryAll(db, sql, params = []) {
  if (Platform.OS === 'web' || !db) {
    // Web fallback - return empty array
    return [];
  }
  const res = await exec(db, sql, params);
  if (!res) return [];
  if (Array.isArray(res)) {
    // execAsync returns an array of results
    const rows = res[0]?.rows?._array || [];
    return rows;
  }
  try { return res.rows?._array || []; } catch { return []; }
}

class DatabaseService {
  constructor() {
    this.users = new Map();
    this.faceData = new Map();
    this.currentUser = null;
    this.adminSession = null;

    // Simple in-memory door lock model
    // true = locked, false = unlocked
    this.doorLocks = new Map(DOOR_KEYS.map((door) => [door, true]));
    
    // Family members
    this.members = new Map();
    // Activity log for doors
    this.doorEvents = [];
    this.doorListeners = new Set();

    // SQLite persistence
    this.db = openDb();
    this.dbPath = Platform.OS === 'web' ? 'web-storage' : (FileSystem?.documentDirectory ? `${FileSystem.documentDirectory}SQLite/fawzino.db` : 'SQLite/fawzino.db');
    this.ready = false;
    this.readyPromise = this.initializeStorage()
      .then(() => { this.ready = true; console.log('[DB] Ready at', this.dbPath); })
      .catch((e) => { this.ready = true; console.log('[DB] init error', e?.message || e); });

    // Start with empty household; first registration becomes owner
    this.initializeDemoUsers();
  }

  initializeDemoUsers() {
    // No demo users by default
  }

  ensurePolicyShape(role, policies) {
    const defaults = this.defaultPolicies(role || 'member');
    if (!policies) return defaults;

    const normalized = {
      controls: { ...defaults.controls, ...(policies.controls || {}) },
      areas: {},
    };

    const defaultAreas = defaults.areas || {};
    const providedAreas = policies.areas || {};
    const areaKeys = new Set([...Object.keys(defaultAreas), ...Object.keys(providedAreas)]);
    areaKeys.forEach((key) => {
      const base = defaultAreas[key] || {};
      const provided = providedAreas[key] || {};
      normalized.areas[key] = { ...base, ...provided };
      if (base.fan !== undefined && normalized.areas[key].fan === undefined) {
        normalized.areas[key].fan = base.fan;
      }
    });

    return normalized;
  }

  async initializeStorage() {
    if (Platform.OS === 'web') {
      await this.initializeWebStorage();
      return;
    }
    if (!this.db) return;
    // Create tables
    await exec(this.db, `CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT,
      email TEXT,
      role TEXT,
      relation TEXT,
      pin TEXT,
      preferredLogin TEXT,
      policies TEXT,
      faceId TEXT,
      faceTemplate TEXT,
      registeredAt TEXT
    );`);
    await exec(this.db, `CREATE TABLE IF NOT EXISTS door_state (
      door TEXT PRIMARY KEY NOT NULL,
      locked INTEGER NOT NULL
    );`);

    // Load persisted members
    const rows = await queryAll(this.db, 'SELECT * FROM members');
    for (const r of rows) {
      const rawPolicies = r.policies ? JSON.parse(r.policies) : null;
      const normalizedPolicies = this.ensurePolicyShape(r.role, rawPolicies);
      const m = { id: r.id, name: r.name, email: r.email, role: r.role, relation: r.relation, pin: r.pin, preferredLogin: r.preferredLogin, policies: normalizedPolicies, faceId: r.faceId, faceTemplate: r.faceTemplate, registeredAt: r.registeredAt };
      this.members.set(m.id, m);
      this.users.set(m.id, m);
      if (m.faceTemplate) this.faceData.set(m.faceTemplate, m.id);
      if (rawPolicies && this.db) {
        exec(this.db, 'UPDATE members SET policies=? WHERE id=?', [JSON.stringify(normalizedPolicies), m.id]).catch(() => {});
      }
    }

    // Load door states (fallback to defaults)
    const allowedDoors = Array.from(this.doorLocks.keys());
    const doors = await queryAll(this.db, 'SELECT door, locked FROM door_state');
    if (doors.length) {
      const seen = new Set();
      for (const d of doors) {
        if (allowedDoors.includes(d.door)) {
          this.doorLocks.set(d.door, !!d.locked);
          seen.add(d.door);
        }
      }
      for (const door of allowedDoors) {
        if (!seen.has(door)) {
          await exec(this.db, 'INSERT OR REPLACE INTO door_state (door, locked) VALUES (?,?)', [door, 1]);
          this.doorLocks.set(door, true);
        }
      }
    } else {
      for (const [k, v] of this.doorLocks.entries()) {
        await exec(this.db, 'INSERT OR REPLACE INTO door_state (door, locked) VALUES (?,?)', [k, v ? 1 : 0]);
      }
    }

    if (this.members.size === 0) {
      const adminUser = {
        id: 'admin-default',
        name: 'Admin User',
        email: 'admin@example.com',
        role: 'admin',
        relation: 'owner',
        pin: '123456',
        preferredLogin: 'pin',
        policies: this.defaultPolicies('admin'),
        registeredAt: new Date().toISOString(),
      };
      this.members.set(adminUser.id, adminUser);
      this.users.set(adminUser.id, adminUser);
      if (this.db) {
        await exec(this.db, 'INSERT OR REPLACE INTO members (id,name,email,role,relation,pin,preferredLogin,policies,faceId,faceTemplate,registeredAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [
          adminUser.id,
          adminUser.name,
          adminUser.email,
          adminUser.role,
          adminUser.relation,
          adminUser.pin,
          adminUser.preferredLogin,
          JSON.stringify(adminUser.policies),
          '',
          '',
          adminUser.registeredAt,
        ]);
      }
    }
  }

  async initializeWebStorage() {
    console.log('[DB] Initializing web storage');
    
    // Load members from localStorage
    const membersData = webStorage.getItem('smarthome_members');
    if (membersData) {
      try {
        const parsed = JSON.parse(membersData);
        for (const m of parsed) {
          const normalizedPolicies = this.ensurePolicyShape(m.role, m.policies);
          const member = { ...m, policies: normalizedPolicies };
          this.members.set(m.id, member);
          this.users.set(m.id, member);
          if (m.faceTemplate) this.faceData.set(m.faceTemplate, m.id);
        }
      } catch (e) {
        console.warn('[DB] Failed to parse members from web storage', e);
      }
    }

    // Load door states
    const doorData = webStorage.getItem('smarthome_doors');
    if (doorData) {
      try {
        const parsed = JSON.parse(doorData);
        for (const [door, locked] of Object.entries(parsed)) {
          if (DOOR_KEYS.includes(door)) {
            this.doorLocks.set(door, !!locked);
          }
        }
      } catch (e) {
        console.warn('[DB] Failed to parse doors from web storage', e);
      }
    }

    // Create default admin user if no users exist
    if (this.members.size === 0) {
      const adminUser = {
        id: 'admin-default',
        name: 'Admin User',
        email: 'admin@example.com',
        role: 'admin',
        relation: 'owner',
        pin: '123456',
        preferredLogin: 'pin',
        policies: this.defaultPolicies('admin'),
        registeredAt: new Date().toISOString(),
      };
      this.members.set(adminUser.id, adminUser);
      this.users.set(adminUser.id, adminUser);
      this.persistMembersToWeb();
    }
  }

  persistMembersToWeb() {
    if (Platform.OS !== 'web') return;
    try {
      const members = Array.from(this.members.values());
      webStorage.setItem('smarthome_members', JSON.stringify(members));
    } catch (e) {
      console.warn('[DB] Failed to persist members to web storage', e);
    }
  }

  persistDoorsToWeb() {
    if (Platform.OS !== 'web') return;
    try {
      const doors = {};
      for (const [k, v] of this.doorLocks.entries()) {
        doors[k] = v;
      }
      webStorage.setItem('smarthome_doors', JSON.stringify(doors));
    } catch (e) {
      console.warn('[DB] Failed to persist doors to web storage', e);
    }
  }

  // Register new user with face data
  async registerUser(userData, faceTemplate) {
    const userId = Date.now().toString();
    const isFirst = this.members.size === 0;
    const user = {
      id: userId,
      ...userData,
      faceTemplate,
      role: isFirst ? 'parent' : (userData.role || 'member'),
      relation: isFirst ? 'owner' : (userData.relation || ''),
      preferredLogin: 'pin',
      registeredAt: new Date().toISOString()
    };

    user.policies = this.ensurePolicyShape(user.role, userData.policies);
    if (isFirst) {
      user.policies = this.defaultPolicies('parent');
    }

    // Duplicate face check: if template matches an existing user, abort
    for (const [template, uid] of this.faceData.entries()) {
      try {
        if (this.simulateFaceMatch(faceTemplate, template)) {
          const existing = this.users.get(uid);
          return { success: false, duplicate: true, user: existing, error: 'Face already registered' };
        }
      } catch {}
    }

    this.users.set(userId, user);
    this.faceData.set(faceTemplate, userId);
    this.members.set(userId, user);

    // Persist
    this.persistMembersToWeb();
    try {
      await this.readyPromise;
      if (this.db) {
        await exec(this.db, 'INSERT OR REPLACE INTO members (id,name,email,role,relation,pin,preferredLogin,policies,faceId,faceTemplate,registeredAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [
          user.id, user.name, user.email, user.role, user.relation, user.pin || '', user.preferredLogin, JSON.stringify(user.policies || this.defaultPolicies(user.role)), user.faceId || '', user.faceTemplate || '', user.registeredAt
        ]);
      }
    } catch {}
    return { success: true, user };
  }

  hasOwner() { return Array.from(this.members.values()).some(m => m.role === 'parent' && (m.relation === 'owner' || m.role === 'parent')); }
  getOwner() { return Array.from(this.members.values()).find(m => m.role === 'parent'); }

  // Authenticate user by face
  async authenticateByFace(faceTemplate) {
    // Simulate face matching with 80% accuracy
    const matchProbability = Math.random();
    
    if (matchProbability > 0.2) {
      // Find matching face
      for (const [template, userId] of this.faceData.entries()) {
        // Simulate template matching
        if (this.simulateFaceMatch(faceTemplate, template)) {
          const user = this.users.get(userId);
          this.currentUser = user;
          return { success: true, user, confidence: (matchProbability * 100).toFixed(1) };
        }
      }
    }
    
    return { success: false, error: 'Face not recognized' };
  }

  // Find a user by face template without logging in
  matchFaceNoLogin(faceTemplate) {
    for (const [template, userId] of this.faceData.entries()) {
      if (this.simulateFaceMatch(faceTemplate, template)) {
        const user = this.users.get(userId);
        return { success: true, user, confidence: 100 };
      }
    }
    return { success: false };
  }

  simulateFaceMatch(template1, template2) {
    // If templates are landmark vectors, compare distance. Otherwise fallback to random.
    try {
      const a = JSON.parse(template1);
      const b = JSON.parse(template2);
      const va = Array.isArray(a?.vec) ? a.vec : (Array.isArray(a?.v) ? a.v : null);
      const vb = Array.isArray(b?.vec) ? b.vec : (Array.isArray(b?.v) ? b.v : null);
      if (a?.hash && b?.hash) {
        // hash-only fallback (Expo Go): exact match only
        return a.hash === b.hash;
      }
      if (va && vb && va.length === vb.length && va.length > 0) {
        let sum = 0; for (let i = 0; i < va.length; i++) { const d = (va[i] - vb[i]); sum += d*d; }
        const dist = Math.sqrt(sum / va.length);
        // Conservative threshold for same-person (tune as needed)
        return dist < 0.12;
      }
    } catch {}
    // Simple simulation fallback
    return Math.random() > 0.6; // stricter by default
  }

  getCurrentUser() {
    return this.currentUser;
  }

  saveRemoteUser(user, templateStr, faceId) {
    if (!user || !user.id) return;
    const normalizedPolicies = this.ensurePolicyShape(user.role || 'member', user.policies || this.users.get(user.id)?.policies);
    const merged = {
      ...this.users.get(user.id),
      ...user,
      faceId: faceId || user.faceId || (this.users.get(user.id)?.faceId) || '',
      faceTemplate: templateStr || this.users.get(user.id)?.faceTemplate || '',
      policies: normalizedPolicies,
      registeredAt: user.registeredAt || user.registered_at || this.users.get(user.id)?.registeredAt || new Date().toISOString(),
    };
    this.users.set(user.id, merged);
    this.members.set(user.id, merged);
    if (templateStr) {
      this.faceData.set(templateStr, user.id);
    }
  }

  replaceMembers(remotes = []) {
    for (const [id] of this.members) {
      if (!remotes.find((m) => String(m.id) === String(id))) {
        this.members.delete(id);
        this.users.delete(id);
      }
    }
    remotes.forEach((member) => {
      const policies = this.ensurePolicyShape(member.role || 'member', member.policies);
      const stored = {
        ...this.members.get(member.id),
        ...member,
        policies,
      };
      this.members.set(member.id, stored);
      this.users.set(member.id, stored);
    });
  }

  setAdminSession(session) {
    this.adminSession = session;
  }

  getAdminSession() {
    return this.adminSession;
  }

  clearAdminSession() {
    this.adminSession = null;
    if (Platform.OS === 'web') {
      webStorage.removeItem('admin_session');
    }
  }

  async initializeAdminSession() {
    if (Platform.OS === 'web') {
      const sessionData = webStorage.getItem('admin_session');
      if (sessionData) {
        try {
          this.adminSession = JSON.parse(sessionData);
        } catch {}
      }
    }
  }

  setAdminSession(session) {
    this.adminSession = session;
    if (Platform.OS === 'web') {
      webStorage.setItem('admin_session', JSON.stringify(session));
    }
  }

  // Admin user management for local fallback
  async adminCreateUser(userData) {
    const userId = Date.now().toString();
    const pin = userData.pin || '123456';
    const user = {
      id: userId,
      name: userData.name,
      email: userData.email || '',
      role: userData.role || 'member',
      relation: userData.relation || '',
      pin: pin,
      preferredLogin: 'pin',
      policies: this.defaultPolicies(userData.role || 'member'),
      registeredAt: new Date().toISOString()
    };

    this.users.set(userId, user);
    this.members.set(userId, user);
    this.persistMembersToWeb();
    
    try {
      await this.readyPromise;
      if (this.db) {
        await exec(this.db, 'INSERT OR REPLACE INTO members (id,name,email,role,relation,pin,preferredLogin,policies,faceId,faceTemplate,registeredAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [
          user.id, user.name, user.email, user.role, user.relation, pin, user.preferredLogin, JSON.stringify(user.policies), '', '', user.registeredAt
        ]);
      }
    } catch (e) {
      console.warn('[DB] Failed to persist admin created user to SQLite', e);
    }
    
    return { success: true, user };
  }

  async adminUpdateUser(id, updates) {
    const user = this.users.get(id);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    const updatedUser = { ...user, ...updates };
    if (updates.policies) {
      updatedUser.policies = this.ensurePolicyShape(updatedUser.role, updates.policies);
    }

    this.users.set(id, updatedUser);
    this.members.set(id, updatedUser);
    this.persistMembersToWeb();

    try {
      await this.readyPromise;
      if (this.db) {
        await exec(this.db, 'INSERT OR REPLACE INTO members (id,name,email,role,relation,pin,preferredLogin,policies,faceId,faceTemplate,registeredAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [
          updatedUser.id, updatedUser.name, updatedUser.email, updatedUser.role, updatedUser.relation, updatedUser.pin || '', updatedUser.preferredLogin || 'pin', JSON.stringify(updatedUser.policies), updatedUser.faceId || '', updatedUser.faceTemplate || '', updatedUser.registeredAt || new Date().toISOString()
        ]);
      }
    } catch {}

    return { success: true, user: updatedUser };
  }

  async adminDeleteUser(id) {
    if (!this.users.has(id)) {
      return { success: false, error: 'User not found' };
    }

    this.users.delete(id);
    this.members.delete(id);
    this.persistMembersToWeb();

    try {
      await this.readyPromise;
      if (this.db) {
        await exec(this.db, 'DELETE FROM members WHERE id=?', [id]);
      }
    } catch {}

    return { success: true };
  }

  // --- Family management ---
  defaultPolicies(_role) {
    const areaPermissions = { light: true, fan: true, ac: true, door: true };
    return {
      controls: {
        devices: true,
        doors: true,
        unlockDoors: true,
        voice: true,
        power: true,
      },
      areas: {
        mainhall: { ...areaPermissions },
        bedroom1: { ...areaPermissions },
        bedroom2: { ...areaPermissions },
        kitchen: { ...areaPermissions },
      },
    };
  }

  addMember({ name, role = 'member', relation = 'member', email = '', pin = '' }) {
    const id = Date.now().toString();
    const member = { id, name, email, role, relation, pin, preferredLogin: 'pin', policies: this.defaultPolicies(role), registeredAt: new Date().toISOString() };
    this.members.set(id, member);
    this.users.set(id, member);
    // Persist
    this.persistMembersToWeb();
    (async () => { try { await this.readyPromise; if (this.db) await exec(this.db, 'INSERT OR REPLACE INTO members (id,name,email,role,relation,pin,preferredLogin,policies,faceId,faceTemplate,registeredAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [id, name, email, role, relation, pin, 'pin', JSON.stringify(member.policies), '', '', member.registeredAt]); } catch {} })();
    return { success: true, member };
  }

  updateMember(id, updates) {
    const m = this.members.get(id);
    if (!m) return { success: false, error: 'Member not found' };
    let newPolicies = m.policies;
    if (updates.policies) {
      newPolicies = { ...m.policies, ...updates.policies };
      if (updates.policies.areas) {
        newPolicies.areas = { ...m.policies.areas };
        for (const [area, perms] of Object.entries(updates.policies.areas)) {
          newPolicies.areas[area] = { ...(m.policies.areas[area] || {}), ...perms };
        }
      }
    }
    const updatedPolicies = this.ensurePolicyShape(updates.role || m.role, newPolicies);
    const updated = { ...m, ...updates, policies: updatedPolicies };
    this.members.set(id, updated);
    this.users.set(id, updated);
    // Persist
    this.persistMembersToWeb();
    (async () => { try { await this.readyPromise; if (this.db) await exec(this.db, 'INSERT OR REPLACE INTO members (id,name,email,role,relation,pin,preferredLogin,policies,faceId,faceTemplate,registeredAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [updated.id, updated.name, updated.email, updated.role, updated.relation, updated.pin || '', updated.preferredLogin || 'pin', JSON.stringify(updated.policies || this.defaultPolicies(updated.role)), updated.faceId || '', updated.faceTemplate || '', updated.registeredAt || new Date().toISOString()]); } catch {} })();
    if (this.currentUser?.id === id) this.currentUser = updated;
    return { success: true, member: updated };
  }

  removeMember(id) {
    this.members.delete(id);
    this.users.delete(id);
    // Persist
    this.persistMembersToWeb();
    (async () => { try { await this.readyPromise; if (this.db) await exec(this.db, 'DELETE FROM members WHERE id=?', [id]); } catch {} })();
    if (this.currentUser?.id === id) this.currentUser = null;
    return { success: true };
  }

  getMembers() { return Array.from(this.members.values()); }

  setMemberPin(id, pin) { return this.updateMember(id, { pin }); }

  setPreferredLogin(id, method) { return this.updateMember(id, { preferredLogin: method }); }

  getMemberById(id) { return this.members.get(id); }

  authenticateByPin(pin) {
    for (const m of this.members.values()) {
      if (m.pin && m.pin === pin) {
        this.currentUser = m;
        return { success: true, user: m };
      }
    }
    return { success: false, error: 'Invalid PIN' };
  }

  can(action, resource) {
    const u = this.currentUser;
    if (!u) return false;
    const p = u.policies || this.defaultPolicies(u.role);
    switch (action) {
      case 'device.toggle':
        return !!p.controls.devices;
      case 'door.lock':
        return !!p.controls.doors;
      case 'door.unlock':
        return !!p.controls.unlockDoors;
      case 'door.lockAll':
        return !!p.controls.doors;
      case 'door.unlockAll':
        return !!p.controls.unlockDoors;
      case 'voice.use':
        return !!p.controls.voice;
      case 'power.view':
        return !!p.controls.power;
      default:
        return true;
    }
  }

  roomToArea(room) {
    const value = (room || '').toString().toLowerCase();
    if (value.includes('bedroom 2') || value.includes('room 2') || value === 'bedroom2') return 'bedroom2';
    if (value.includes('bedroom 1') || value.includes('room 1') || value === 'bedroom1' || value.includes('bedroom')) return 'bedroom1';
    if (value.includes('kitchen')) return 'kitchen';
    if (value.includes('main') || value.includes('hall') || value.includes('living')) return 'mainhall';
    return 'mainhall';
  }

  doorToArea(door) {
    const value = (door || '').toString().toLowerCase();
    if (value.includes('bedroom 2') || value === 'bedroom2') return 'bedroom2';
    if (value.includes('bedroom 1') || value === 'bedroom1') return 'bedroom1';
    if (value.includes('kitchen')) return 'kitchen';
    if (value.includes('main') || value.includes('hall') || value === 'mainhall') return 'mainhall';
    return 'mainhall';
  }

  canDevice(room, device) {
    const u = this.currentUser; if (!u) return false;
    const p = u.policies || this.defaultPolicies(u.role);
    if (!p.controls.devices) return false;
    const area = this.roomToArea(room);
    const perms = p.areas?.[area];
    return !!(perms && perms[device]);
  }

  canDoorAction(door, unlocking) {
    const u = this.currentUser; if (!u) return false;
    const p = u.policies || this.defaultPolicies(u.role);
    if (!p.controls.doors) return false;
    if (unlocking && !p.controls.unlockDoors) return false;
    const area = this.doorToArea(door);
    const perms = p.areas?.[area];
    return !!(perms && perms.door);
  }

  logout() {
    this.currentUser = null;
  }

  // Get all registered users (for demo)
  getAllUsers() {
    return Array.from(this.users.values());
  }

  // Guest mode removed

  // Door lock helpers
  getDoorState(name) {
    return this.doorLocks.get(name);
  }

  getAllDoors() {
    return Array.from(this.doorLocks.keys());
  }

  getDoorsSnapshot() {
    const obj = {};
    for (const [k, v] of this.doorLocks.entries()) obj[k] = v;
    return obj;
  }

  onDoorChange(listener) {
    this.doorListeners.add(listener);
    // emit current state immediately for convenience
    try { listener(this.getDoorsSnapshot()); } catch {}
    return () => this.doorListeners.delete(listener);
  }

  emitDoorChange() {
    const snap = this.getDoorsSnapshot();
    for (const l of this.doorListeners) {
      try { l(snap); } catch {}
    }
  }

  async persistDoorState(door, locked) {
    try {
      await this.readyPromise;
      if (this.db) {
        await exec(this.db, 'INSERT OR REPLACE INTO door_state (door,locked) VALUES (?,?)', [door, locked ? 1 : 0]);
      }
    } catch {}
  }

  setDoorState(name, locked, options = {}) {
    if (!this.doorLocks.has(name)) return;
    const value = !!locked;
    const prev = this.doorLocks.get(name);
    if (prev === value && !options.force) return;
    this.doorLocks.set(name, value);
    if (options.log) {
      this.logDoorEvent(value ? 'lock' : 'unlock', name, this.currentUser?.id, true, options.reason);
    }
    this.persistDoorsToWeb();
    if (options.persist !== false) {
      (async () => {
        await this.persistDoorState(name, value);
      })();
    }
    if (options.emit !== false) {
      this.emitDoorChange();
    }
  }

  setDoorStates(states = {}, options = {}) {
    let changed = false;
    DOOR_KEYS.forEach((door) => {
      if (Object.prototype.hasOwnProperty.call(states, door)) {
        const value = !!states[door];
        const prev = this.doorLocks.get(door);
        if (prev !== value) {
          this.doorLocks.set(door, value);
          changed = true;
          if (options.log) {
            this.logDoorEvent(value ? 'lock' : 'unlock', door, this.currentUser?.id, true, options.reason);
          }
          if (options.persist !== false) {
            (async () => {
              await this.persistDoorState(door, value);
            })();
          }
        }
      }
    });
    this.persistDoorsToWeb();
    if (changed && options.emit !== false) {
      this.emitDoorChange();
    }
  }

  toggleDoor(name) {
    if (!this.doorLocks.has(name)) return { success: false, error: 'Unknown door' };
    const next = !this.doorLocks.get(name);
    const unlocking = next === false;
    if (!this.canDoorAction(name, unlocking)) {
      this.logDoorEvent('denied', name, this.currentUser?.id, false, unlocking ? 'unlock' : 'lock');
      return { success: false, error: 'Not allowed' };
    }
    this.setDoorState(name, next, { log: true, reason: 'toggle' });
    return { success: true, locked: next };
  }

  lockAllDoors() {
    if (!this.can('door.lockAll')) return { success: false, error: 'Not allowed' };
    this.setDoorStates(
      Object.fromEntries(DOOR_KEYS.map((k) => [k, true])),
      { log: true, reason: 'lockAll' }
    );
    this.logDoorEvent('lockAll', '*', this.currentUser?.id, true);
    return { success: true };
  }

  unlockAllDoors() {
    if (!this.can('door.unlockAll')) return { success: false, error: 'Not allowed' };
    this.setDoorStates(
      Object.fromEntries(DOOR_KEYS.map((k) => [k, false])),
      { log: true, reason: 'unlockAll' }
    );
    this.logDoorEvent('unlockAll', '*', this.currentUser?.id, true);
    return { success: true };
  }

  logDoorEvent(type, door, by, success, reason) {
    this.doorEvents.push({ ts: new Date().toISOString(), type, door, by, success, reason });
    if (this.doorEvents.length > 200) this.doorEvents.shift();
  }

  getDoorEvents() { return this.doorEvents.slice().reverse(); }

  // Update an existing user's face template
  async updateUserFaceTemplate(userId, newFaceTemplate) {
    const user = this.users.get(userId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // Remove previous template mapping if present
    for (const [template, mappedUserId] of this.faceData.entries()) {
      if (mappedUserId === userId) {
        this.faceData.delete(template);
        break;
      }
    }

    const updatedUser = { ...user, faceTemplate: newFaceTemplate };
    this.users.set(userId, updatedUser);
    this.faceData.set(newFaceTemplate, userId);
    this.persistMembersToWeb();
    if (this.currentUser?.id === userId) {
      this.currentUser = updatedUser;
    }

    // Persist
    try { await this.readyPromise; if (this.db) await exec(this.db, 'UPDATE members SET faceTemplate=? WHERE id=?', [newFaceTemplate, userId]); } catch {}

    return { success: true, user: updatedUser };
  }
}

export const db = new DatabaseService();