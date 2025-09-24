// Database service for user management
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';

function openDb() {
  try {
    // Use classic WebSQL-style API for broad compatibility (Expo Go, Dev Client)
    const db = SQLite.openDatabase('fawzino.db');
    return db;
  } catch (e) {
    return null;
  }
}

async function exec(db, sql, params = []) {
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
    this.doorLocks = new Map([
      ['main', true],
      ['front', true],
      ['back', true],
      ['garage', true],
      ['room1', true],
      ['hall', true],
      ['kitchen', true],
      ['bathroom', true],
      ['bedroom1', true],
      ['bedroom2', true],
    ]);
    
    // Family members
    this.members = new Map();
    // Activity log for doors
    this.doorEvents = [];
    this.doorListeners = new Set();

    // SQLite persistence
    this.db = openDb();
    this.dbPath = (FileSystem?.documentDirectory ? `${FileSystem.documentDirectory}SQLite/fawzino.db` : 'SQLite/fawzino.db');
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

  async initializeStorage() {
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
      const m = { id: r.id, name: r.name, email: r.email, role: r.role, relation: r.relation, pin: r.pin, preferredLogin: r.preferredLogin, policies: r.policies ? JSON.parse(r.policies) : this.defaultPolicies(r.role), faceId: r.faceId, faceTemplate: r.faceTemplate, registeredAt: r.registeredAt };
      this.members.set(m.id, m);
      this.users.set(m.id, m);
      if (m.faceTemplate) this.faceData.set(m.faceTemplate, m.id);
    }

    // Load door states (fallback to defaults)
    const doors = await queryAll(this.db, 'SELECT door, locked FROM door_state');
    if (doors.length) {
      for (const d of doors) this.doorLocks.set(d.door, !!d.locked);
    } else {
      for (const [k, v] of this.doorLocks.entries()) {
        await exec(this.db, 'INSERT OR REPLACE INTO door_state (door, locked) VALUES (?,?)', [k, v ? 1 : 0]);
      }
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
    try {
      await this.readyPromise;
      if (this.db) {
        await exec(this.db, 'INSERT OR REPLACE INTO members (id,name,email,role,relation,pin,preferredLogin,policies,faceId,faceTemplate,registeredAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [
          user.id, user.name, user.email, user.role, user.relation, user.pin || '', user.preferredLogin, JSON.stringify(user.policies || this.defaultPolicies(user.role)), user.faceId || '', user.faceTemplate || '', user.registeredAt
        ]);
      }
    } catch {}
    if (isFirst) {
      // First registered user becomes the household owner/parent
      user.policies = this.defaultPolicies('parent');
    }
    
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
    const merged = {
      ...this.users.get(user.id),
      ...user,
      faceId: faceId || user.faceId || (this.users.get(user.id)?.faceId) || '',
      faceTemplate: templateStr || this.users.get(user.id)?.faceTemplate || '',
      policies: user.policies || this.users.get(user.id)?.policies || this.defaultPolicies(user.role || 'member'),
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
      const policies = member.policies || this.defaultPolicies(member.role || 'member');
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
  }

  // --- Family management ---
  defaultPolicies(role) {
    const isAdmin = role === 'admin';
    const base = {
      controls: { devices: true, doors: true, unlockDoors: role === 'parent' || isAdmin, voice: true, power: true },
      areas: {
        hall: { light: isAdmin, ac: isAdmin, door: isAdmin },
        kitchen: { light: isAdmin, ac: isAdmin, door: isAdmin },
        bedroom: { light: isAdmin, ac: isAdmin, door: isAdmin },
        bathroom: { light: isAdmin, ac: isAdmin, door: isAdmin },
        main: { door: role === 'parent' || isAdmin },
      },
    };
    if (role === 'parent' || isAdmin) {
      base.areas.hall = { light: true, ac: true, door: true };
      base.areas.kitchen = { light: true, ac: true, door: true };
      base.areas.bedroom = { light: true, ac: true, door: true };
      base.areas.bathroom = { light: true, ac: true, door: true };
      base.areas.main = { door: true };
    }
    return base;
  }

  addMember({ name, role = 'member', relation = 'member', email = '', pin = '' }) {
    const id = Date.now().toString();
    const member = { id, name, email, role, relation, pin, preferredLogin: 'pin', policies: this.defaultPolicies(role), registeredAt: new Date().toISOString() };
    this.members.set(id, member);
    this.users.set(id, member);
    // Persist
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
    const updated = { ...m, ...updates, policies: newPolicies };
    this.members.set(id, updated);
    this.users.set(id, updated);
    // Persist
    (async () => { try { await this.readyPromise; if (this.db) await exec(this.db, 'INSERT OR REPLACE INTO members (id,name,email,role,relation,pin,preferredLogin,policies,faceId,faceTemplate,registeredAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [updated.id, updated.name, updated.email, updated.role, updated.relation, updated.pin || '', updated.preferredLogin || 'pin', JSON.stringify(updated.policies || this.defaultPolicies(updated.role)), updated.faceId || '', updated.faceTemplate || '', updated.registeredAt || new Date().toISOString()]); } catch {} })();
    if (this.currentUser?.id === id) this.currentUser = updated;
    return { success: true, member: updated };
  }

  removeMember(id) {
    this.members.delete(id);
    this.users.delete(id);
    // Persist
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
    switch (room) {
      case 'room1': return 'bedroom';
      case 'hall': return 'hall';
      case 'kitchen': return 'kitchen';
      case 'bathroom': return 'bathroom';
      default: return 'hall';
    }
  }

  doorToArea(door) {
    switch (door) {
      case 'main': return 'main';
      case 'front': return 'hall';
      case 'back': return 'kitchen';
      case 'garage': return 'garage';
      case 'bathroom': return 'bathroom';
      case 'room1': return 'bedroom';
      default: return 'hall';
    }
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

  toggleDoor(name) {
    if (!this.doorLocks.has(name)) return { success: false, error: 'Unknown door' };
    const next = !this.doorLocks.get(name);
    const unlocking = next === false;
    if (!this.canDoorAction(name, unlocking)) {
      this.logDoorEvent('denied', name, this.currentUser?.id, false, action);
      return { success: false, error: 'Not allowed' };
    }
    this.doorLocks.set(name, next);
    // Persist
    (async () => { try { await this.readyPromise; if (this.db) await exec(this.db, 'INSERT OR REPLACE INTO door_state (door,locked) VALUES (?,?)', [name, next ? 1 : 0]); } catch {} })();
    this.logDoorEvent(next ? 'lock' : 'unlock', name, this.currentUser?.id, true);
    this.emitDoorChange();
    return { success: true, locked: next };
  }

  lockAllDoors() {
    if (!this.can('door.lockAll')) return { success: false, error: 'Not allowed' };
    for (const k of this.doorLocks.keys()) this.doorLocks.set(k, true);
    (async () => { try { await this.readyPromise; if (this.db) for (const k of this.doorLocks.keys()) await exec(this.db, 'INSERT OR REPLACE INTO door_state (door,locked) VALUES (?,?)', [k, 1]); } catch {} })();
    this.logDoorEvent('lockAll', '*', this.currentUser?.id, true);
    this.emitDoorChange();
    return { success: true };
  }

  unlockAllDoors() {
    if (!this.can('door.unlockAll')) return { success: false, error: 'Not allowed' };
    for (const k of this.doorLocks.keys()) this.doorLocks.set(k, false);
    (async () => { try { await this.readyPromise; if (this.db) for (const k of this.doorLocks.keys()) await exec(this.db, 'INSERT OR REPLACE INTO door_state (door,locked) VALUES (?,?)', [k, 0]); } catch {} })();
    this.logDoorEvent('unlockAll', '*', this.currentUser?.id, true);
    this.emitDoorChange();
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
    if (this.currentUser?.id === userId) {
      this.currentUser = updatedUser;
    }

    // Persist
    try { await this.readyPromise; if (this.db) await exec(this.db, 'UPDATE members SET faceTemplate=? WHERE id=?', [newFaceTemplate, userId]); } catch {}

    return { success: true, user: updatedUser };
  }
}

export const db = new DatabaseService();
