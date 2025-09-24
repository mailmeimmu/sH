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
- For "home light" assume room=hall.
- For generic lights with no room specified, prefer room=hall.
`;
  return `${system}\n\nUser: ${userText}`;
}

export async function askGemini(userText: string, history: ChatMessage[] = []): Promise<GeminiAssistantReply> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { say: 'Gemini API key not set. Please set EXPO_PUBLIC_GEMINI_API_KEY.', action: 'none' };
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

  // Try to parse JSON on the last line
  const lastLine = partText.trim().split('\n').filter(Boolean).pop() || '';
  try {
    const parsed = JSON.parse(lastLine);
    return {
      action: (parsed?.action as GeminiAction) || 'none',
      say: typeof parsed?.say === 'string' ? parsed.say : partText.trim(),
      room: typeof parsed?.room === 'string' ? parsed.room : undefined,
      device: typeof parsed?.device === 'string' ? parsed.device : undefined,
      value: typeof parsed?.value === 'string' ? parsed.value : undefined,
      door: typeof parsed?.door === 'string' ? parsed.door : undefined,
    };
  } catch (e) {
    // Fallback to plain text
    return { say: partText.trim(), action: 'none' };
  }
}
