// Simple Google Gemini API client for Expo/React Native

const HARDCODED_GEMINI_API_KEY = 'AIzaSyBvo8Sn5aJbELzBqN3UJBNZO9T2vWZOC00';

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

function getApiKey() {
  return HARDCODED_GEMINI_API_KEY;
}

function buildPrompt(userText: string) {
  // System-style instruction embedded into the first user turn.
  const system = `You are Smart Home By Nafisa Tabasum voice assistant.
You can answer general questions and also control of doors and devices. Always end your reply with a single JSON command on the last line only.

If the user is asking a general question, use the 'none' action.

Supported JSON schema (choose one):
- {"action":"door.lock|door.unlock|door.lock_all|door.unlock_all","door":"main|front|back|garage|bathroom|room1|hall|kitchen|bedroom|*","say":"..."}
- {"action":"device.set","room":"hall|kitchen|bedroom|bathroom|room1","device":"light|ac|fan","value":"on|off","say":"..."}
- {"action":"none","say":"..."}

Rules:
- Only output one JSON object on the last line (no code fences, no extra text after it).
- Do not prefix the JSON with words like json or wrap it in any quotes or fences.
- For "home light" assume room=hall.
- For generic lights with no room specified, prefer room=hall.
`;
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
  const apiKey = getApiKey();
  if (!apiKey) {
    return { say: 'Gemini API key not configured.', action: 'none' };
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

  const sayText = (typeof payload?.say === 'string' && payload.say.trim().length)
    ? payload.say.trim()
    : remainder || partText.trim();

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
