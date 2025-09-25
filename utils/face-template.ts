export type NormalizedFace = {
  bounds: {
    origin: { x: number; y: number };
    size: { width: number; height: number };
  };
  landmarks: Record<string, { x: number; y: number }>;
};

const LANDMARK_KEYS: Record<string, string> = {
  leftEye: 'leftEye',
  rightEye: 'rightEye',
  noseBase: 'noseBase',
  leftEar: 'leftEar',
  rightEar: 'rightEar',
  leftCheek: 'leftCheek',
  rightCheek: 'rightCheek',
  mouthLeft: 'mouthLeft',
  mouthRight: 'mouthRight',
  bottomMouth: 'bottomMouth',
  LEFT_EYE: 'leftEye',
  RIGHT_EYE: 'rightEye',
  NOSE_BASE: 'noseBase',
  LEFT_EAR: 'leftEar',
  RIGHT_EAR: 'rightEar',
  LEFT_CHEEK: 'leftCheek',
  RIGHT_CHEEK: 'rightCheek',
  MOUTH_LEFT: 'mouthLeft',
  MOUTH_RIGHT: 'mouthRight',
  MOUTH_BOTTOM: 'bottomMouth',
  BOTTOM_MOUTH: 'bottomMouth',
};

function mapLandmarkKey(raw?: string): string | null {
  if (!raw) return null;
  if (LANDMARK_KEYS[raw]) return LANDMARK_KEYS[raw];
  const upper = raw.toUpperCase();
  if (LANDMARK_KEYS[upper]) return LANDMARK_KEYS[upper];
  const normalized = upper.replace(/[-\s]/g, '_');
  return LANDMARK_KEYS[normalized] || null;
}

function resolveBounds(face: any) {
  const bounds = face?.bounds || {};
  if (bounds.origin && bounds.size) {
    return {
      origin: {
        x: Number(bounds.origin.x) || 0,
        y: Number(bounds.origin.y) || 0,
      },
      size: {
        width: Number(bounds.size.width) || 1,
        height: Number(bounds.size.height) || 1,
      },
    };
  }
  const left = bounds.left ?? bounds.x ?? 0;
  const top = bounds.top ?? bounds.y ?? 0;
  const right = bounds.right ?? (bounds.width != null ? left + bounds.width : left + 1);
  const bottom = bounds.bottom ?? (bounds.height != null ? top + bounds.height : top + 1);
  let width = bounds.width ?? (right - left);
  let height = bounds.height ?? (bottom - top);
  if (!width || !Number.isFinite(width)) width = 1;
  if (!height || !Number.isFinite(height)) height = 1;
  return {
    origin: { x: Number(left) || 0, y: Number(top) || 0 },
    size: { width: Number(width) || 1, height: Number(height) || 1 },
  };
}

function extractLandmarks(face: any) {
  const landmarks: Record<string, { x: number; y: number }> = {};
  const source = face?.landmarks || face?.landmarkPositions || {};
  if (Array.isArray(source)) {
    source.forEach((entry) => {
      const key = mapLandmarkKey(entry?.type || entry?.name);
      if (!key) return;
      const position = entry?.position || entry;
      const x = Number(position?.x ?? position?.X ?? 0);
      const y = Number(position?.y ?? position?.Y ?? 0);
      landmarks[key] = { x, y };
    });
  } else if (source && typeof source === 'object') {
    Object.keys(source).forEach((rawKey) => {
      const key = mapLandmarkKey(rawKey);
      if (!key) return;
      const position = source[rawKey];
      const x = Number(position?.x ?? position?.X ?? position?.latitude ?? 0);
      const y = Number(position?.y ?? position?.Y ?? position?.longitude ?? 0);
      landmarks[key] = { x, y };
    });
  }
  return landmarks;
}

export function normalizeVisionFace(face: any): NormalizedFace {
  return {
    bounds: resolveBounds(face),
    landmarks: extractLandmarks(face),
  };
}

export function buildTemplateFromFace(face: NormalizedFace) {
  const bounds = face.bounds || { origin: { x: 0, y: 0 }, size: { width: 1, height: 1 } };
  const origin = bounds.origin || { x: 0, y: 0 };
  const size = bounds.size || { width: 1, height: 1 };
  const w = size.width || 1;
  const h = size.height || 1;
  const lm = face.landmarks || {};

  const pick = (name: string) => {
    const p = lm[name];
    if (!p) return [0, 0];
    const x = (p.x - origin.x) / w;
    const y = (p.y - origin.y) / h;
    return [Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0];
  };

  const keys = ['leftEye', 'rightEye', 'noseBase', 'leftEar', 'rightEar', 'leftCheek', 'rightCheek', 'mouthLeft', 'mouthRight', 'bottomMouth'];
  const pts = keys.map((k) => pick(k)).flat();
  const padded = pts.concat(Array(Math.max(0, 20 - pts.length)).fill(0));
  const [lex, ley, rex, rey, nx, ny, lerx, lery, rerx, rery, lcx, lcy, rcx, rcy, mlx, mly, mrx, mry, bmx, bmy] = padded;
  const eyeDist = Math.hypot(rex - lex, rey - ley);
  const mouthWidth = Math.hypot(mrx - mlx, mry - mly);
  const noseToMouth = Math.hypot(nx - (mlx + mrx) / 2, ny - (mly + mry) / 2);
  const vec = [...pts, eyeDist, mouthWidth, noseToMouth];

  return { vec, meta: { w, h } };
}

export function hashTemplateFromString(value: string) {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return (Math.abs(hash)).toString(36);
}
