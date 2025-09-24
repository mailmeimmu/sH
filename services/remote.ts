// Simple remote API client (Node backend) for MySQL integration
// Configure EXPO_PUBLIC_API_BASE in .env, e.g. http://YOUR_SERVER:8080

// @ts-ignore
const RAW_API_BASE = process.env.EXPO_PUBLIC_API_BASE as string | undefined;

function normalizeBase(base?: string) {
  if (!base) return '';
  const trimmed = base.trim().replace(/\/+$/, '');
  return trimmed;
}

const normalizedBase = normalizeBase(RAW_API_BASE);
const baseEndsWithApi = normalizedBase.endsWith('/api');

function buildUrl(path: string) {
  if (!normalizedBase) throw new Error('API base not configured');
  const cleanedPath = path.startsWith('/') ? path : `/${path}`;
  if (baseEndsWithApi && cleanedPath.startsWith('/api')) {
    return `${normalizedBase}${cleanedPath.slice(4)}`;
  }
  return `${normalizedBase}${cleanedPath}`;
}

let adminToken: string | null = null;

export type SensorReading = {
  id: number;
  deviceId: string;
  metric: string;
  value: number;
  unit?: string | null;
  metadata?: unknown;
  recordedAt: string;
};

export type SensorHistoryOptions = {
  metric?: string;
  limit?: number;
  since?: string | Date;
  until?: string | Date;
};

export type SensorReadingPayload = {
  metric: string;
  value: number | string;
  unit?: string;
  recordedAt?: string | Date;
  metadata?: unknown;
};

export type DeviceState = {
  deviceId: string;
  value: number;
  recordedAt?: string | null;
};

async function post(path: string, body: any, headers: Record<string, string> = {}) {
  const url = buildUrl(path);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export const remoteApi = {
  enabled: !!normalizedBase,
  base: normalizedBase,
  async registerUser(user: any, template: string) {
    const { ok, status, data } = await post('/api/register', {
      name: user?.name,
      email: user?.email,
      role: user?.role,
      relation: user?.relation,
      pin: user?.pin,
      preferred_login: user?.preferredLogin || 'pin',
      template,
      faceId: user?.faceId,
    });
    if (ok) return { success: true, user: data?.user };
    if (status === 409) return { success: false, duplicate: true, user: data?.user, error: data?.error };
    return { success: false, error: data?.error || 'register failed' };
  },
  async authByFace(template: string) {
    const { ok, data, status } = await post('/api/auth/face', { template });
    if (ok) return { success: true, user: data?.user };
    return { success: false, error: data?.error || `auth failed (${status})` };
  },
  async authByPin(pin: string) {
    const { ok, data } = await post('/api/auth/pin', { pin });
    if (ok) return { success: true, user: data?.user };
    return { success: false, error: data?.error || 'invalid PIN' };
  },
  async listMembers() {
    const res = await fetch(buildUrl('/api/users'));
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'members failed');
    return data;
  },
  async addMember(m: any) {
    const res = await fetch(buildUrl('/api/members'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(m) });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'add member failed');
    return data;
  },
  async updateMember(id: string | number, updates: any) {
    const res = await fetch(buildUrl(`/api/members/${id}`), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'update member failed');
    return data;
  },
  async deleteMember(id: string | number) {
    const res = await fetch(buildUrl(`/api/members/${id}`), { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'delete member failed');
    return data;
  },
  async getDoors() {
    const res = await fetch(buildUrl('/api/door'));
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'door get failed');
    return data as Record<string, boolean>;
  },
  async toggleDoor(door: string) {
    const { ok, data } = await post('/api/door/toggle', { door });
    if (ok) return data; throw new Error(data?.error || 'toggle failed');
  },
  async lockAllDoors() {
    const { ok, data } = await post('/api/door/lock_all', {});
    if (ok) return data; throw new Error(data?.error || 'lock all failed');
  },
  async unlockAllDoors() {
    const { ok, data } = await post('/api/door/unlock_all', {});
    if (ok) return data; throw new Error(data?.error || 'unlock all failed');
  },
  async submitSensorReading(deviceId: string, reading: SensorReadingPayload, options: { secret?: string } = {}) {
    const payload = {
      metric: reading.metric,
      value: reading.value,
      unit: reading.unit,
      recordedAt: reading.recordedAt instanceof Date ? reading.recordedAt.toISOString() : reading.recordedAt,
      metadata: reading.metadata,
    };
    const headers: Record<string, string> = {};
    if (options.secret) headers['x-device-secret'] = options.secret;
    const { ok, data } = await post(`/api/sensors/${encodeURIComponent(deviceId)}/readings`, payload, headers);
    if (!ok) throw new Error(data?.error || 'sensor ingest failed');
    return data?.reading as SensorReading | undefined;
  },
  async getSensorReadings(deviceId: string, opts: SensorHistoryOptions = {}) {
    if (!normalizedBase) throw new Error('API base not configured');
    const params = new URLSearchParams();
    if (opts.metric) params.set('metric', opts.metric);
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.since) params.set('since', opts.since instanceof Date ? opts.since.toISOString() : opts.since);
    if (opts.until) params.set('until', opts.until instanceof Date ? opts.until.toISOString() : opts.until);
    const qs = params.toString();
    const res = await fetch(buildUrl(`/api/sensors/${encodeURIComponent(deviceId)}/readings${qs ? `?${qs}` : ''}`));
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'sensor history failed');
    return data as { deviceId: string; metric: string | null; count: number; readings: SensorReading[] };
  },
  async getSensorLatest(deviceId: string, metric?: string) {
    if (!normalizedBase) throw new Error('API base not configured');
    const params = new URLSearchParams();
    if (metric) params.set('metric', metric);
    const qs = params.toString();
    const res = await fetch(buildUrl(`/api/sensors/${encodeURIComponent(deviceId)}/readings/latest${qs ? `?${qs}` : ''}`));
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'latest sensor failed');
    return data as { reading?: SensorReading; readings?: SensorReading[] };
  },
  async setDeviceState(deviceId: string, value: number | boolean, options: { secret?: string } = {}) {
    const payload = {
      value: typeof value === 'boolean' ? (value ? 1 : 0) : value,
    };
    const headers: Record<string, string> = {};
    if (options.secret) headers['x-device-secret'] = options.secret;
    const { ok, data } = await post(`/api/devices/${encodeURIComponent(deviceId)}/state`, payload, headers);
    if (!ok) throw new Error(data?.error || 'device state update failed');
    return data as DeviceState & { success: boolean };
  },
  async getDeviceState(deviceId: string) {
    if (!normalizedBase) throw new Error('API base not configured');
    const res = await fetch(buildUrl(`/api/devices/${encodeURIComponent(deviceId)}/state`));
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'device state query failed');
    return data as DeviceState;
  },
  async getDeviceStates(deviceIds?: string[]) {
    if (!normalizedBase) throw new Error('API base not configured');
    const params = new URLSearchParams();
    if (deviceIds && deviceIds.length) params.set('ids', deviceIds.join(','));
    const qs = params.toString();
    const res = await fetch(buildUrl(`/api/devices/state${qs ? `?${qs}` : ''}`));
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'device states query failed');
    const raw = data?.states || {};
    const mapped: Record<string, DeviceState> = {};
    Object.entries(raw).forEach(([id, val]: any) => {
      mapped[id] = {
        deviceId: id,
        value: Number(val?.value) ? 1 : 0,
        recordedAt: val?.recordedAt ?? null,
      };
    });
    return mapped;
  },
  async adminLogin(email: string, pin: string) {
    const { ok, data } = await post('/api/admin/login', { email, pin });
    if (!ok) throw new Error(data?.error || 'admin login failed');
    adminToken = data?.token || null;
    if (data?.success && data?.user) {
      return { success: true, user: data.user, token: adminToken };
    }
    throw new Error(data?.error || 'admin login failed');
  },
  adminLogout() {
    adminToken = null;
  },
  setAdminToken(token: string | null) {
    adminToken = token || null;
  },
  getAdminToken() {
    return adminToken;
  },
  async adminListUsers() {
    if (!normalizedBase) throw new Error('API base not configured');
    const headers: Record<string, string> = {};
    if (adminToken) headers.Authorization = `Bearer ${adminToken}`;
    const res = await fetch(buildUrl('/api/admin/users'), { headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'admin users failed');
    return data?.users || [];
  },
  async adminCreateUser(payload: any) {
    const headers: Record<string, string> = {};
    if (adminToken) headers.Authorization = `Bearer ${adminToken}`;
    const { ok, data } = await post('/api/admin/users', payload, headers);
    if (!ok) throw new Error(data?.error || 'admin create user failed');
    return data;
  },
  async adminUpdateUser(id: string | number, updates: any) {
    if (!normalizedBase) throw new Error('API base not configured');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (adminToken) headers.Authorization = `Bearer ${adminToken}`;
    const res = await fetch(buildUrl(`/api/admin/users/${id}`), {
      method: 'PATCH',
      headers,
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'admin update user failed');
    return data;
  },
  async adminDeleteUser(id: string | number) {
    if (!normalizedBase) throw new Error('API base not configured');
    const headers: Record<string, string> = {};
    if (adminToken) headers.Authorization = `Bearer ${adminToken}`;
    const res = await fetch(buildUrl(`/api/admin/users/${id}`), { method: 'DELETE', headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'admin delete user failed');
    return data;
  },
};

export default remoteApi;
