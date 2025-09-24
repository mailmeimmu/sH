// Simple Google Gemini API client for Expo/React Native

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

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

const RAW_API_BASE = 'http://156.67.104.77:8080/api';

function buildAssistantUrl() {
  if (!RAW_API_BASE) return null;
  const trimmed = RAW_API_BASE.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  if (trimmed.endsWith('/api')) return `${trimmed}/assistant`;
  return `${trimmed}/api/assistant`;
}

const ASSISTANT_URL = buildAssistantUrl();

function getApiKey() {
  return 'AIzaSyBvo8Sn5aJbELzBqN3UJBNZO9T2vWZOC00';
}

function buildPrompt(userText: string) {
  // System-style instruction embedded into the first user turn.
  const system = `You are Smart Home By Nafisa Tabasum voice assistant.
Speak naturally and helpfully.

Response format (always in this order):
1. Conversational reply for the user. Do not mention commands or formatting rules.
2. A single line starting with "COMMAND:" followed by key=value pairs separated by semicolons.

Example: COMMAND: action=device.set; room=mainhall; device=light; value=on

Rules for the COMMAND line:
- Supported actions: device.set, door.lock, door.unlock, door.lock_all, door.unlock_all, none.
- Only include keys that matter (action is required; room/device/value/door are optional).
- Use lowercase for keys and values. Do not wrap values in quotes.
- If no smart-home action is needed, output exactly: COMMAND: action=none
- Never output JSON, code fences, or prefixes such as "json".
- For "home" or "living room" references, treat as room=mainhall.
- For unspecified lights, prefer room=mainhall.

You may answer any question before the COMMAND line.`;
  return `${system}\n\nUser: ${userText}`;
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
  if (ASSISTANT_URL) {
    try {
      const res = await fetch(ASSISTANT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: userText, history }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
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

  const apiKey = getApiKey();
  if (!apiKey) {
    return { say: 'Assistant service unavailable (no API key).', action: 'none' };
  }

  const contents = [] as any[];
  for (const m of history) {
    contents.push({ role: m.role, parts: [{ text: m.content }] });
  }
  contents.push({ role: 'user', parts: [{ text: buildPrompt(userText) }] });

  const body = {
    contents,
    generationConfig: { temperature: 0.6, topP: 0.9, maxOutputTokens: 256 },
  };

  const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const rawText = await res.text().catch(() => '');
    let message = rawText || res.statusText;
    if (rawText) {
      try {
        const parsed = JSON.parse(rawText);
        message = parsed?.error?.message || parsed?.message || message;
      } catch {
        message = rawText;
      }
    }
    return {
      say: `Gemini error ${res.status}: ${String(message).trim()}`,
      action: 'none',
    };
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const partText = candidate?.content?.parts?.[0]?.text as string | undefined;
  if (!partText) return { say: 'No response from Gemini', action: 'none' };

  const { payload, remainder } = extractAssistantCommand(partText);

  const primarySay = remainder.trim();
  const secondarySay = typeof payload?.say === 'string' ? payload.say.trim() : '';
  const rawFallback = partText.trim();
  const fallbackSay = /^COMMAND:/i.test(rawFallback) ? '' : rawFallback;
  const sayText = primarySay || secondarySay || fallbackSay || 'Okay.';

  const action = typeof payload?.action === 'string' ? (payload.action as string).trim() : 'none';

  return {
    action: (action as GeminiAction) || 'none',
    say: sayText,
    room: typeof payload?.room === 'string' ? payload.room.trim() : undefined,
    device: typeof payload?.device === 'string' ? payload.device.trim() : undefined,
    value: typeof payload?.value === 'string' ? payload.value.trim() : undefined,
    door: typeof payload?.door === 'string' ? payload.door.trim() : undefined,
  };
}
