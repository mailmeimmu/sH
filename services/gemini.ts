// Simple Google Gemini API client for Expo/React Native

import { parseLocalCommand } from './local-parser';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type GeminiAction =
  | 'device.set'
  | 'door.lock'
  | 'door.unlock'
  | 'door.lock_all'
  | 'door.unlock_all'
  | 'none';

export type GeminiAssistantReply = {
  action: GeminiAction;
  say: string;
  room?: string;
  device?: string;
  value?: string;
  door?: string;
};

const GEMINI_MODELS = [
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash'
];

const getGeminiEndpoint = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const RAW_API_BASE = process.env.EXPO_PUBLIC_API_BASE || '';

function buildAssistantUrl() {
  if (!RAW_API_BASE) return null;
  const trimmed = RAW_API_BASE.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  if (trimmed.endsWith('/api')) return `${trimmed}/assistant`;
  return `${trimmed}/api/assistant`;
}

const ASSISTANT_URL = buildAssistantUrl();

function getApiKey() {
  return 'AIzaSyAcLNrhvMSahZk7BKr-rL2cMZAUm545_X4';
}

async function tryGeminiModel(model, body, apiKey) {
  console.log(`[Gemini] Trying model: ${model}`);
  const endpoint = getGeminiEndpoint(model);
  
  const res = await fetch(`${endpoint}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.ok) {
    console.log(`[Gemini] Success with model: ${model}`);
    return { success: true, data: await res.json() };
  } else {
    const errorText = await res.text().catch(() => '');
    console.log(`[Gemini] Failed with model ${model}:`, res.status, errorText);
    return { success: false, status: res.status, error: errorText };
  }
}

function buildPrompt(userText: string) {
  const system = `You are a helpful smart home voice assistant for "Smart Home By Nafisa Tabasum".
You can control devices and answer questions naturally.

Available rooms: main hall (mainhall), bedroom 1 (bedroom1), bedroom 2 (bedroom2), kitchen
Available devices: light, fan, ac (air conditioner)
Available doors: main hall, bedroom 1, bedroom 2, kitchen

ALWAYS respond in this exact format:
Line 1: Your natural conversational response
Line 2: COMMAND: action=X; room=Y; device=Z; value=W; door=D

Examples:
User: "Turn on all lights"
Response: "I'll turn on all the lights in your home."
COMMAND: action=device.set; room=all; device=light; value=on

User: "Turn on bedroom 1 fan"
Response: "I'll turn on the fan in bedroom 1."
COMMAND: action=device.set; room=bedroom1; device=fan; value=on

User: "Lock all doors"
Response: "I'll lock all the doors for you."
COMMAND: action=door.lock_all

User: "What's the weather?"
Response: "I'm a smart home assistant and don't have weather data, but I can help control your devices."
COMMAND: action=none

Device Control Rules:
- Rooms: mainhall, bedroom1, bedroom2, kitchen, or "all" for everything
- Devices: light, fan, ac  
- Values: on, off
- Doors: mainhall, bedroom1, bedroom2, kitchen
- Actions: device.set, door.lock, door.unlock, door.lock_all, door.unlock_all, none

When user says "all lights", "all fans", "everything", use room=all
When user mentions specific rooms like "bedroom", "kitchen", "main hall", use that room
If no room specified, default to room=mainhall`;

  return `${system}\n\nUser: ${userText}\nAssistant:`;
}

function sanitizeJsonCandidate(candidate: string): string {
  return candidate
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .replace(/^json\b[\s:=-]*/i, '')
    .replace(/^`+|`+$/g, '')
    .trim();
}

function parseLooseKeyValues(candidate: string): Record<string, string> | null {
  const cleaned = sanitizeJsonCandidate(candidate);
  if (!cleaned) return null;
  const pairs = [...cleaned.matchAll(/"([a-zA-Z0-9_.-]+)"\s*:?\s*"([^"\n]*)"/g)];
  if (!pairs.length) return null;
  const result: Record<string, string> = {};
  for (const [, key, value] of pairs) {
    result[key] = value;
  }
  if (!result.action && !result.say) return null;
  return result;
}

function findJsonCommandBlock(text: string): { json: string; start: number; end: number } | null {
  const regex = /\{[\s\S]*?\}/g;
  let match: RegExpExecArray | null;
  let found: { json: string; start: number; end: number } | null = null;
  while ((match = regex.exec(text))) {
    if (match.index === undefined) continue;
    if (/"action"\s*:/i.test(match[0])) {
      found = { json: match[0], start: match.index, end: match.index + match[0].length };
    }
  }
  return found;
}

function parseCommandLine(line: string): Record<string, string> | null {
  if (!line) return null;
  const match = line.trim().match(/^COMMAND:\s*(.*)$/i);
  if (!match) return null;
  const body = match[1];
  if (!body) return null;
  const pairs = body
    .split(/;+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (!pairs.length) return null;
  const result: Record<string, string> = {};
  for (const pair of pairs) {
    const [rawKey, ...rest] = pair.split('=');
    if (!rawKey || !rest.length) continue;
    const key = rawKey.trim().toLowerCase();
    const rawValue = rest.join('=').trim();
    if (!rawValue) continue;
    const normalizedValue = key === 'say' ? rawValue.trim() : rawValue.trim().toLowerCase();
    result[key] = normalizedValue;
  }
  if (!Object.keys(result).length) return null;
  if (!result.action) {
    result.action = 'none';
  }
  return result;
}

function stripCommandArtifacts(text: string): string {
  const lines = text.split('\n');
  while (lines.length) {
    const lastRaw = lines[lines.length - 1];
    if (!lastRaw) {
      lines.pop();
      continue;
    }
    const trimmed = lastRaw.trim();
    if (!trimmed) {
      lines.pop();
      continue;
    }
    if (/^COMMAND:/i.test(trimmed)) {
      lines.pop();
      continue;
    }
    const cleaned = sanitizeJsonCandidate(trimmed);
    if (!cleaned) {
      lines.pop();
      continue;
    }
    if (/"action"\s*:/i.test(cleaned) || /"say"\s*:/i.test(cleaned)) {
      lines.pop();
      continue;
    }
    if (/^```/.test(trimmed) || /^json\b/i.test(trimmed)) {
      lines.pop();
      continue;
    }
    break;
  }
  return lines.join('\n').trim();
}

function extractAssistantCommand(partText: string): { payload: Record<string, any> | null; remainder: string } {
  const trimmed = partText.trim();
  if (!trimmed) return { payload: null, remainder: '' };

  let payload: Record<string, any> | null = null;
  let remainder = trimmed;

  const lines = trimmed.split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const parsed = parseCommandLine(lines[i]);
    if (parsed) {
      payload = parsed;
      lines.splice(i, 1);
      remainder = lines.join('\n').trim();
      break;
    }
  }

  if (!payload) {
    const block = findJsonCommandBlock(trimmed);
    if (block) {
      const candidate = sanitizeJsonCandidate(block.json);
      try {
        payload = JSON.parse(candidate);
        remainder = (trimmed.slice(0, block.start) + trimmed.slice(block.end)).trim();
      } catch (error) {
        payload = null;
      }
    }
  }

  if (!payload) {
    const nonEmptyLines = trimmed.split('\n').filter((line) => line.trim().length > 0);
    const lastLineRaw = nonEmptyLines[nonEmptyLines.length - 1];
    if (lastLineRaw) {
      const loose = parseLooseKeyValues(lastLineRaw);
      if (loose) {
        payload = loose;
        const lastIndex = trimmed.lastIndexOf(lastLineRaw);
        if (lastIndex >= 0) {
          remainder = (trimmed.slice(0, lastIndex) + trimmed.slice(lastIndex + lastLineRaw.length)).trim();
        }
      }
    }
  }

  if (!payload && /"action"\s*:/i.test(trimmed)) {
    const loose = parseLooseKeyValues(trimmed);
    if (loose) {
      payload = loose;
      remainder = stripCommandArtifacts(trimmed);
    }
  }

  remainder = stripCommandArtifacts(remainder);

  return { payload, remainder };
}

export async function askGemini(userText: string, history: ChatMessage[] = []): Promise<GeminiAssistantReply> {
  console.log('[Gemini] Processing request:', userText);
  
  if (ASSISTANT_URL) {
    try {
      console.log('[Gemini] Trying backend at:', ASSISTANT_URL);
      const res = await fetch(ASSISTANT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: userText, history }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        console.log('[Gemini] Backend response received');
        return {
          action: (data?.action as GeminiAction) || 'none',
          say: typeof data?.say === 'string' && data.say.trim() ? data.say.trim() : 'Okay.',
          room: typeof data?.room === 'string' ? data.room : undefined,
          device: typeof data?.device === 'string' ? data.device : undefined,
          value: typeof data?.value === 'string' ? data.value : undefined,
          door: typeof data?.door === 'string' ? data.door : undefined,
        };
      }
      if (data?.error) {
        return { say: String(data.error).trim(), action: 'none' };
      }
    } catch (error: any) {
      console.log('[gemini] backend call failed, falling back to direct API:', error?.message || error);
    }
  }

  console.log('[Gemini] Using direct API call');
  const apiKey = getApiKey();
  if (!apiKey) {
    console.log('[Gemini] No API key available');
    return { say: 'Assistant service unavailable (no API key).', action: 'none' };
  }

  const contents = [] as any[];
  for (const m of history) {
    contents.push({ role: m.role, parts: [{ text: m.content }] });
  }
  contents.push({ role: 'user', parts: [{ text: buildPrompt(userText) }] });

  const body = {
    contents,
    generationConfig: { 
      temperature: 0.2, 
      topP: 0.8, 
      maxOutputTokens: 100,
      candidateCount: 1
    },
  };

  console.log('[Gemini] Making API request to Google');
  
  // Implement retry with exponential backoff for quota errors
  const retryWithBackoff = async (model, attempt = 1) => {
    const result = await tryGeminiModel(model, body, apiKey);
    
    if (!result.success && result.status === 429 && attempt < 3) {
      const retryDelay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
      console.log(`[Gemini] Quota exceeded, retrying in ${retryDelay}ms (attempt ${attempt + 1})`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return retryWithBackoff(model, attempt + 1);
    }
    
    return result;
  };

  // Try models in order until one works
  let lastError = null;
  for (const model of GEMINI_MODELS) {
    try {
      const result = await retryWithBackoff(model);
      if (result.success) {
        const data = result.data;
        const candidate = data?.candidates?.[0];
        const partText = candidate?.content?.parts?.[0]?.text as string | undefined;
        if (!partText) {
          console.log('[Gemini] No text in response from', model);
          continue;
        }

        console.log(`[Gemini] Processing response from ${model}`);
        const { payload, remainder } = extractAssistantCommand(partText);

        const primarySay = remainder.trim();
        const secondarySay = typeof payload?.say === 'string' ? payload.say.trim() : '';
        const rawFallback = partText.trim();
        const fallbackSay = /^COMMAND:/i.test(rawFallback) ? '' : rawFallback;
        const sayText = primarySay || secondarySay || fallbackSay || 'Okay.';

        const action = typeof payload?.action === 'string' ? (payload.action as string).trim() : 'none';

        console.log(`[Gemini] Final response from ${model} - action:`, action, 'say:', sayText);
        
        return {
          action: (action as GeminiAction) || 'none',
          say: sayText,
          room: typeof payload?.room === 'string' ? payload.room.trim() : undefined,
          device: typeof payload?.device === 'string' ? payload.device.trim() : undefined,
          value: typeof payload?.value === 'string' ? payload.value.trim() : undefined,
          door: typeof payload?.door === 'string' ? payload.door.trim() : undefined,
        };
      }
      lastError = result.error;
    } catch (error) {
      console.log(`[Gemini] Exception with model ${model}:`, error);
      lastError = error.message || String(error);
    }
  }

  // All models failed
  console.log('[Gemini] All models failed, last error:', lastError);
  
  // Fallback to local command parsing when Gemini is unavailable
  console.log('[Gemini] Falling back to local command parser');
  const localResult = parseLocalCommand(userText);
  
  if (localResult.success) {
    return {
      action: (localResult.action as GeminiAction) || 'none',
      say: localResult.say,
      room: localResult.room,
      device: localResult.device,
      value: localResult.value,
      door: localResult.door,
    };
  }
  
  return {
    say: localResult.say || "I'm having trouble connecting to the cloud assistant. I can still help with basic commands like 'turn on lights' or 'lock doors'.",
    action: 'none',
  };
}
