// Local command parser for smart home voice commands
// This serves as a fallback when Gemini API is unavailable or quota exceeded

export type LocalCommandResult = {
  success: boolean;
  action: string;
  say: string;
  room?: string;
  device?: string;
  value?: string;
  door?: string;
};

const DEVICE_KEYWORDS = {
  light: ['light', 'lights', 'lamp', 'lamps', 'lighting'],
  fan: ['fan', 'fans', 'ventilation'],
  ac: ['ac', 'air conditioner', 'air conditioning', 'cooling', 'aircon']
};

const ROOM_KEYWORDS = {
  mainhall: ['main hall', 'hall', 'living room', 'main', 'mainhall'],
  bedroom1: ['bedroom 1', 'bedroom one', 'first bedroom', 'room 1', 'bedroom1'],
  bedroom2: ['bedroom 2', 'bedroom two', 'second bedroom', 'room 2', 'bedroom2'],
  kitchen: ['kitchen'],
  all: ['all', 'every', 'everywhere', 'entire', 'whole house', 'whole home', 'all rooms']
};

const DOOR_KEYWORDS = {
  mainhall: ['main hall door', 'hall door', 'main door', 'front door', 'mainhall'],
  bedroom1: ['bedroom 1 door', 'bedroom one door', 'first bedroom door', 'bedroom1'],
  bedroom2: ['bedroom 2 door', 'bedroom two door', 'second bedroom door', 'bedroom2'],
  kitchen: ['kitchen door']
};

const ACTION_KEYWORDS = {
  on: ['on', 'turn on', 'switch on', 'activate', 'enable', 'start'],
  off: ['off', 'turn off', 'switch off', 'deactivate', 'disable', 'stop'],
  lock: ['lock', 'secure', 'close'],
  unlock: ['unlock', 'open', 'unsecure']
};

function normalizeText(text: string): string {
  return text.toLowerCase().trim();
}

function findKeyword(text: string, keywords: Record<string, string[]>): string | null {
  const normalized = normalizeText(text);
  for (const [key, phrases] of Object.entries(keywords)) {
    for (const phrase of phrases) {
      if (normalized.includes(phrase)) {
        return key;
      }
    }
  }
  return null;
}

function detectAction(text: string): 'on' | 'off' | 'lock' | 'unlock' | null {
  const normalized = normalizeText(text);
  
  // Check for specific action keywords
  for (const [action, keywords] of Object.entries(ACTION_KEYWORDS)) {
    for (const keyword of keywords) {
      if (normalized.includes(keyword)) {
        return action as 'on' | 'off' | 'lock' | 'unlock';
      }
    }
  }
  
  return null;
}

function detectDevice(text: string): 'light' | 'fan' | 'ac' | null {
  return findKeyword(text, DEVICE_KEYWORDS) as 'light' | 'fan' | 'ac' | null;
}

function detectRoom(text: string): string | null {
  return findKeyword(text, ROOM_KEYWORDS);
}

function detectDoor(text: string): string | null {
  const normalized = normalizeText(text);
  
  // Check for "all doors"
  if (normalized.includes('all door') || normalized.includes('every door')) {
    return 'all';
  }
  
  return findKeyword(text, DOOR_KEYWORDS);
}

function generateResponse(action: string, room?: string, device?: string, value?: string, door?: string): string {
  switch (action) {
    case 'device.set':
      if (room === 'all') {
        return `Turning ${value} all ${device === 'light' ? 'lights' : device === 'fan' ? 'fans' : 'air conditioners'} in your home.`;
      }
      return `Turning ${value} the ${device} in ${room || 'main hall'}.`;
    
    case 'door.lock':
      return door === 'all' ? 'Locking all doors.' : `Locking the ${door || 'main hall'} door.`;
    
    case 'door.unlock':
      return door === 'all' ? 'Unlocking all doors.' : `Unlocking the ${door || 'main hall'} door.`;
    
    case 'door.lock_all':
      return 'Locking all doors for you.';
    
    case 'door.unlock_all':
      return 'Unlocking all doors for you.';
    
    default:
      return "I understand you want to control your smart home, but I'm not sure exactly what you'd like me to do. Try saying 'turn on all lights' or 'lock the main door'.";
  }
}

export function parseLocalCommand(text: string): LocalCommandResult {
  const normalized = normalizeText(text);
  
  // Handle greetings and general queries
  if (normalized.includes('hello') || normalized.includes('hi ') || normalized.includes('hey')) {
    return {
      success: true,
      action: 'none',
      say: "Hello! I'm your smart home assistant. You can ask me to control lights, fans, AC, or doors."
    };
  }
  
  if (normalized.includes('help') || normalized.includes('what can you do')) {
    return {
      success: true,
      action: 'none',
      say: "I can control your lights, fans, air conditioning, and door locks. Try saying 'turn on all lights' or 'lock the bedroom door'."
    };
  }

  // Detect if this is about doors
  if (normalized.includes('door') || normalized.includes('lock') || normalized.includes('unlock')) {
    const action = detectAction(text);
    const door = detectDoor(text);
    
    if (action === 'lock' || action === 'unlock') {
      if (door === 'all' || normalized.includes('all door')) {
        return {
          success: true,
          action: action === 'lock' ? 'door.lock_all' : 'door.unlock_all',
          say: generateResponse(action === 'lock' ? 'door.lock_all' : 'door.unlock_all')
        };
      } else {
        return {
          success: true,
          action: action === 'lock' ? 'door.lock' : 'door.unlock',
          say: generateResponse(action === 'lock' ? 'door.lock' : 'door.unlock', undefined, undefined, undefined, door || 'mainhall'),
          door: door || 'mainhall'
        };
      }
    }
  }
  
  // Detect device control commands
  const action = detectAction(text);
  const device = detectDevice(text);
  const room = detectRoom(text);
  
  if ((action === 'on' || action === 'off') && device) {
    return {
      success: true,
      action: 'device.set',
      say: generateResponse('device.set', room, device, action),
      room: room || 'mainhall',
      device,
      value: action
    };
  }
  
  // Handle light-specific commands with A/B variants
  if (normalized.includes('light a') || normalized.includes('light b')) {
    const isLightA = normalized.includes('light a');
    const action = detectAction(text);
    
    if (action === 'on' || action === 'off') {
      return {
        success: true,
        action: 'device.set',
        say: `Turning ${action} main hall light ${isLightA ? 'A' : 'B'}.`,
        room: 'mainhall',
        device: isLightA ? 'light-a' : 'light-b',
        value: action
      };
    }
  }
  
  // General fallback
  return {
    success: false,
    action: 'none',
    say: "I'm not sure what you'd like me to do. Try saying 'turn on all lights', 'lock the kitchen door', or 'turn off bedroom fan'."
  };
}

export default { parseLocalCommand };