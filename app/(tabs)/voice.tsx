import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Mic, MicOff, Volume2, VolumeX, Send } from 'lucide-react-native';
import { voiceService } from '../../services/voice';
import { askGemini, type GeminiAssistantReply, type ChatMessage } from '../../services/gemini';
import { db } from '../../services/database';
import remoteApi from '../../services/remote';

type ConversationEntry = { type: 'user' | 'assistant'; message: string };

type DeviceType = 'light' | 'fan' | 'ac';

type QuickCommand = {
  label: string;
  phrase: string;
  tone?: 'positive' | 'negative' | 'neutral';
};

const QUICK_COMMANDS: QuickCommand[] = [
  { label: 'All Lights On', phrase: 'Turn on all the lights', tone: 'positive' },
  { label: 'All Lights Off', phrase: 'Turn off all the lights', tone: 'negative' },
  { label: 'All Fans On', phrase: 'Turn on all the fans', tone: 'positive' },
  { label: 'All Fans Off', phrase: 'Turn off all the fans', tone: 'negative' },
  { label: 'All AC On', phrase: 'Turn on all the air conditioners', tone: 'positive' },
  { label: 'All AC Off', phrase: 'Turn off all the air conditioners', tone: 'negative' },
  { label: 'Main Hall Lights On', phrase: 'Turn on all lights in the main hall', tone: 'positive' },
  { label: 'Main Hall Lights Off', phrase: 'Turn off all lights in the main hall', tone: 'negative' },
  { label: 'Light A On', phrase: 'Turn on main hall light A', tone: 'positive' },
  { label: 'Light A Off', phrase: 'Turn off main hall light A', tone: 'negative' },
  { label: 'Light B On', phrase: 'Turn on main hall light B', tone: 'positive' },
  { label: 'Light B Off', phrase: 'Turn off main hall light B', tone: 'negative' },
  { label: 'Main Hall Fan On', phrase: 'Turn on the main hall fan', tone: 'positive' },
  { label: 'Main Hall Fan Off', phrase: 'Turn off the main hall fan', tone: 'negative' },
  { label: 'Main Hall AC On', phrase: 'Turn on the main hall AC', tone: 'positive' },
  { label: 'Main Hall AC Off', phrase: 'Turn off the main hall AC', tone: 'negative' },
  { label: 'Bedroom 1 Light On', phrase: 'Turn on the bedroom 1 light', tone: 'positive' },
  { label: 'Bedroom 1 Light Off', phrase: 'Turn off the bedroom 1 light', tone: 'negative' },
  { label: 'Bedroom 1 Fan On', phrase: 'Turn on the bedroom 1 fan', tone: 'positive' },
  { label: 'Bedroom 1 Fan Off', phrase: 'Turn off the bedroom 1 fan', tone: 'negative' },
  { label: 'Bedroom 1 AC On', phrase: 'Turn on the bedroom 1 AC', tone: 'positive' },
  { label: 'Bedroom 1 AC Off', phrase: 'Turn off the bedroom 1 AC', tone: 'negative' },
  { label: 'Bedroom 2 Light On', phrase: 'Turn on the bedroom 2 light', tone: 'positive' },
  { label: 'Bedroom 2 Light Off', phrase: 'Turn off the bedroom 2 light', tone: 'negative' },
  { label: 'Bedroom 2 Fan On', phrase: 'Turn on the bedroom 2 fan', tone: 'positive' },
  { label: 'Bedroom 2 Fan Off', phrase: 'Turn off the bedroom 2 fan', tone: 'negative' },
  { label: 'Bedroom 2 AC On', phrase: 'Turn on the bedroom 2 AC', tone: 'positive' },
  { label: 'Bedroom 2 AC Off', phrase: 'Turn off the bedroom 2 AC', tone: 'negative' },
  { label: 'Kitchen Light On', phrase: 'Turn on the kitchen light', tone: 'positive' },
  { label: 'Kitchen Light Off', phrase: 'Turn off the kitchen light', tone: 'negative' },
  { label: 'Lock Main Hall Door', phrase: 'Lock the main hall door', tone: 'neutral' },
  { label: 'Unlock Main Hall Door', phrase: 'Unlock the main hall door', tone: 'neutral' },
  { label: 'Lock Bedroom 1 Door', phrase: 'Lock the bedroom 1 door', tone: 'neutral' },
  { label: 'Unlock Bedroom 1 Door', phrase: 'Unlock the bedroom 1 door', tone: 'neutral' },
  { label: 'Lock Bedroom 2 Door', phrase: 'Lock the bedroom 2 door', tone: 'neutral' },
  { label: 'Unlock Bedroom 2 Door', phrase: 'Unlock the bedroom 2 door', tone: 'neutral' },
  { label: 'Lock Kitchen Door', phrase: 'Lock the kitchen door', tone: 'neutral' },
  { label: 'Unlock Kitchen Door', phrase: 'Unlock the kitchen door', tone: 'neutral' },
  { label: 'Lock All Doors', phrase: 'Lock all doors', tone: 'neutral' },
  { label: 'Unlock All Doors', phrase: 'Unlock all doors', tone: 'neutral' },
];

const ROOM_DEVICE_ID_MAP: Record<'mainhall' | 'bedroom1' | 'bedroom2' | 'kitchen', Record<DeviceType, string[]>> = {
  mainhall: {
    light: ['mainhall-light-1', 'mainhall-light-2'],
    fan: ['mainhall-fan-1'],
    ac: ['mainhall-ac-1'],
  },
  bedroom1: {
    light: ['bedroom1-light-1'],
    fan: ['bedroom1-fan-1'],
    ac: ['bedroom1-ac-1'],
  },
  bedroom2: {
    light: ['bedroom2-light-1'],
    fan: ['bedroom2-fan-1'],
    ac: ['bedroom2-ac-1'],
  },
  kitchen: {
    light: ['kitchen-light-1'],
    fan: [],
    ac: [],
  },
};

// Update ALL_DEVICE_IDS in the main home screen to match these IDs
const VOICE_ALL_DEVICE_IDS = [
  'mainhall-light-1', 'mainhall-light-2', 'mainhall-fan-1', 'mainhall-ac-1',
  'bedroom1-light-1', 'bedroom1-fan-1', 'bedroom1-ac-1',
  'bedroom2-light-1', 'bedroom2-fan-1', 'bedroom2-ac-1',
  'kitchen-light-1'
];

const ROOM_KEYS = Object.keys(ROOM_DEVICE_ID_MAP) as Array<keyof typeof ROOM_DEVICE_ID_MAP>;

const ROOM_KEYWORDS: Record<keyof typeof ROOM_DEVICE_ID_MAP | 'all', string[]> = {
  mainhall: ['main hall', 'living room', 'hall', 'mainhall'],
  bedroom1: ['bedroom 1', 'room 1', 'first bedroom', 'bedroom1'],
  bedroom2: ['bedroom 2', 'room 2', 'second bedroom', 'bedroom2'],
  kitchen: ['kitchen'],
  all: ['all', 'everywhere', 'entire house', 'whole house', 'whole home'],
};

type RoomKey = keyof typeof ROOM_DEVICE_ID_MAP | 'all';

const INITIAL_ASSISTANT_MESSAGE: ConversationEntry = {
  type: 'assistant',
  message: 'Hello! I\'m your smart home voice assistant. Try saying "Lock the main hall door" or "Turn on the bedroom 1 fan".',
};

export default function VoiceControlScreen() {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [conversationHistory, setConversationHistory] = useState<ConversationEntry[]>([INITIAL_ASSISTANT_MESSAGE]);
  const [autoMode, setAutoMode] = useState(false);
  const [speakEnabled, setSpeakEnabled] = useState(true);
  const [typedMessage, setTypedMessage] = useState('');
  const [suggestions, setSuggestions] = useState<QuickCommand[]>([]);
  const scrollRef = useRef<ScrollView>(null);

  // Add crash protection
  const [voiceError, setVoiceError] = useState<string | null>(null);

  // Debug state for troubleshooting
  const [debugMode, setDebugMode] = useState(__DEV__);
  const [voiceDebugInfo, setVoiceDebugInfo] = useState<any>({});

  useEffect(() => {
    const initVoice = async () => {
      try {
        console.log('[Voice] Initializing voice service...');
        // Get debug info from voice service
        const debugInfo = voiceService.getDebugInfo ? voiceService.getDebugInfo() : {};
        setVoiceDebugInfo(debugInfo);
        console.log('[Voice] Voice service debug info:', debugInfo);
        
        const permissions = await voiceService.requestPermissions();
        if (!permissions.granted) {
          setVoiceError(permissions.error || 'Microphone permission not granted');
        } else {
          console.log('[Voice] Permissions granted successfully');
          if (permissions.simulation) {
            setVoiceError('Voice recognition not available - using simulation mode');
          }
        }
      } catch (error) {
        console.warn('[Voice] Voice service init error:', error?.message || error);
        setVoiceError(error?.message || 'Voice service failed to initialize');
      }
    };
    
    initVoice();
    
    return () => {
      try {
        voiceService.destroy();
      } catch (error) {
        console.warn('[Voice] Cleanup error:', error);
      }
    };
  }, []);

  useEffect(() => {
    // Auto-start assistant loop if allowed and on web
    if (db.can('voice.use') && autoMode && !isListening && !isSpeaking && Platform.OS === 'web') {
      const t = setTimeout(() => startListening(), 500);
      return () => clearTimeout(t);
    }
  }, [autoMode, isListening, isSpeaking]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [conversationHistory]);

  const addUserMessage = (message: string) => {
    setConversationHistory((prev) => [...prev, { type: 'user' as const, message }]);
  };

  const addAssistantMessage = (message: string) => {
    setConversationHistory((prev) => [...prev, { type: 'assistant' as const, message }]);
  };

  const startListening = () => {
    if (!db.can('voice.use')) {
      Alert.alert('Permission', 'You are not allowed to use voice control.');
      return;
    }
    
    if (voiceError) {
      Alert.alert('Voice Error', voiceError);
      return;
    }
    
    if (!voiceService.isAvailable()) {
      if (!voiceService.hasRealVoiceRecognition()) {
        Alert.alert('Voice Control', `Real voice recognition is not available on this device (${Platform.OS}). You can still use the text input below to chat with the assistant.`);
      } else {
        Alert.alert('Voice Control', `Voice recognition is not available. Please check your microphone permissions or use text input.`);
      }
      return;
    }
    
    console.log('[Voice] Starting listening process...');
    setTranscript('');
    setIsListening(true);
    setVoiceError(null);
    
    try {
      voiceService.startListening()
        .then((result) => {
          console.log('[Voice] Recognition result:', result);
          setTranscript(result?.transcript || '');
          setIsListening(false);
          if (result?.transcript) {
            handleVoiceCommand(result.transcript);
          } else {
            addAssistantMessage('I didn\'t catch that. Please try speaking again or use the text input below.');
          }
        })
        .catch((error) => {
          setIsListening(false);
          console.log('[Voice] Recognition error:', error);
          const errorMsg = error?.message || String(error);
          setVoiceError(errorMsg);
          
          if (errorMsg.includes('permission')) {
            Alert.alert('Microphone Permission', 'Please grant microphone permission to use voice control.');
          } else if (errorMsg.includes('not-allowed')) {
            Alert.alert('Microphone Blocked', 'Microphone access is blocked. Please check your browser settings.');
          } else if (errorMsg.includes('network')) {
            Alert.alert('Network Error', 'Voice recognition requires an internet connection.');
          } else if (errorMsg.includes('not available')) {
            addAssistantMessage('Voice recognition is not available on this device. Please use the text input below to chat with me.');
          } else {
            addAssistantMessage(`Voice error: ${errorMsg}. Please try typing your message below instead.`);
          }
        });
    } catch (error) {
      console.error('[Voice] Start listening exception:', error);
      setIsListening(false);
      setVoiceError(error?.message || 'Voice service failed');
      Alert.alert('Voice Error', 'Voice recognition failed. Please try typing your command instead.');
    }
  };

  const stopListening = () => {
    try {
      voiceService.stopListening();
    } catch (error) {
      console.warn('[Voice] Stop listening error:', error);
    }
    setIsListening(false);
    setVoiceError(null);
  };

  const speakResponse = async (text: string) => {
    setIsSpeaking(true);
    try {
      if (speakEnabled) await voiceService.speak(text);
    } catch (error) {
      console.log('Speech synthesis error:', error);
    } finally {
      setIsListening(false);
      setIsSpeaking(false);
      // Continue loop if auto mode
      if (autoMode) {
        setTimeout(() => startListening(), 250);
      }
    }
  };

  const normalizeRoomKey = (room?: string): RoomKey => {
    const value = (room || '').toLowerCase();
    if (value.includes('all') || value.includes('everywhere') || value.includes('whole') || value.includes('entire')) {
      return 'all';
    }
    if (value.includes('kitchen')) return 'kitchen';
    if (value.includes('bedroom 2') || value.includes('room 2') || value.includes('second bedroom')) return 'bedroom2';
    if (value.includes('bedroom 1') || value.includes('room 1') || value.includes('first bedroom') || value.includes('bedroom')) return 'bedroom1';
    if (value.includes('main') || value.includes('hall') || value.includes('living')) return 'mainhall';
    return 'mainhall';
  };

  const mapRoomToPolicyKey = (roomKey: keyof typeof ROOM_DEVICE_ID_MAP): 'mainhall' | 'bedroom1' | 'bedroom2' | 'kitchen' => {
    switch (roomKey) {
      case 'bedroom1':
        return 'bedroom1';
      case 'bedroom2':
        return 'bedroom2';
      case 'kitchen':
        return 'kitchen';
      default:
        return 'mainhall';
    }
  };

  const getRoomDisplayName = (roomKey: RoomKey): string => {
    switch (roomKey) {
      case 'bedroom1':
        return 'bedroom 1';
      case 'bedroom2':
        return 'bedroom 2';
      case 'kitchen':
        return 'kitchen';
      case 'all':
        return 'whole home';
      default:
        return 'main hall';
    }
  };

  const normalizeDoorKey = (door?: string): RoomKey => {
    const value = (door || '').toLowerCase();
    if (value.includes('bedroom 2') || value.includes('room 2') || value.includes('second')) return 'bedroom2';
    if (value.includes('bedroom 1') || value.includes('room 1') || value.includes('first') || value.includes('bedroom')) return 'bedroom1';
    if (value.includes('kitchen')) return 'kitchen';
    return 'mainhall';
  };

  const ensureDeviceType = (value?: string): DeviceType => {
    switch ((value || '').toLowerCase()) {
      case 'fan':
        return 'fan';
      case 'ac':
      case 'airconditioner':
      case 'air-conditioner':
        return 'ac';
      default:
        return 'light';
    }
  };

  const executeDeviceSet = async (reply: GeminiAssistantReply): Promise<string> => {
    const roomKey = normalizeRoomKey(reply.room);
    const deviceType = ensureDeviceType(reply.device);
    const desired = (reply.value || 'on').toLowerCase() === 'off' ? 'off' : 'on';
    const targetRooms: (keyof typeof ROOM_DEVICE_ID_MAP)[] =
      roomKey === 'all' ? [...ROOM_KEYS] : [roomKey as keyof typeof ROOM_DEVICE_ID_MAP];

    const denied: string[] = [];
    const errors: string[] = [];
    const successful: string[] = [];

    for (const room of targetRooms) {
      const policyRoom = mapRoomToPolicyKey(room);
      if (!db.canDevice(policyRoom, deviceType)) {
        denied.push(getRoomDisplayName(room));
        continue;
      }

      const deviceIds = ROOM_DEVICE_ID_MAP[room]?.[deviceType] || [];
      if (!deviceIds.length) continue;

      try {
        if (remoteApi.enabled) {
          await Promise.all(deviceIds.map((id) => remoteApi.setDeviceState(id, desired === 'on' ? 1 : 0)));
        } else {
          // For local mode, just log the action
          console.log(`[Voice] Local mode: Setting ${deviceIds.join(', ')} to ${desired}`);
        }
        successful.push(getRoomDisplayName(room));
      } catch (error: any) {
        console.error(`[Voice] Failed to control ${deviceType} in ${room}:`, error);
        errors.push(getRoomDisplayName(room));
      }
    }

    if (denied.length) {
      return `You are not allowed to control the ${deviceType} in ${denied.join(', ')}.`;
    }

    if (errors.length) {
      if (successful.length) {
        return `Updated ${deviceType} in ${successful.join(', ')}, but failed in ${errors.join(', ')}.`;
      }
      return `Failed to update the ${deviceType} in ${errors.join(', ')}. Please check your network connection.`;
    }

    if (reply.say && reply.say.trim().length) {
      return reply.say.trim();
    }

    if (roomKey === 'all') {
      return `Turning ${desired} all ${deviceType === 'light' ? 'lights' : deviceType === 'fan' ? 'fans' : 'air conditioners'}.`;
    }

    return `Turning ${desired} the ${deviceType} in the ${getRoomDisplayName(roomKey)}.`;
  };

  const executeDoorAction = async (reply: GeminiAssistantReply): Promise<string> => {
    const door = reply.door || 'mainhall';
    const doorKey = normalizeDoorKey(door);
    
    switch (reply.action) {
      case 'door.lock':
      case 'door.unlock': {
        const desiredLock = reply.action === 'door.lock';
        
        // Check permissions
        if (!db.canDoorAction(doorKey, !desiredLock)) {
          return `You are not allowed to ${desiredLock ? 'lock' : 'unlock'} the ${getRoomDisplayName(doorKey)} door.`;
        }
        
        if (remoteApi.enabled) {
          try {
            const currentSnapshot = await remoteApi.getDoors();
            const currentlyLocked = Boolean(currentSnapshot?.[doorKey]);
            if (currentlyLocked !== desiredLock) {
              const result: any = await remoteApi.toggleDoor(doorKey);
              const locked = Boolean(result?.locked);
              if (locked !== desiredLock) {
                return 'The door state could not be confirmed.';
              }
            }
            console.log(`[Voice] Door ${doorKey} ${desiredLock ? 'locked' : 'unlocked'} successfully`);
            return reply.say || (desiredLock ? 'Door locked.' : 'Door unlocked.');
          } catch (error: any) {
            console.error(`[Voice] Failed to control door ${doorKey}:`, error);
            return error?.message || 'Failed to update the door state.';
          }
        } else {
          // Local mode
          const res = db.toggleDoor(doorKey);
          if (!res.success) {
            return res.error || 'Door action not allowed.';
          }
          console.log(`[Voice] Local mode: Door ${doorKey} ${res.locked ? 'locked' : 'unlocked'}`);
          return reply.say || (res.locked ? 'Door locked.' : 'Door unlocked.');
        }
        
        /* Remove unreachable code
        const currentlyLocked = db.getDoorState(doorKey);
        if (typeof currentlyLocked === 'boolean') {
          if (currentlyLocked !== desiredLock) {
            const res = db.toggleDoor(doorKey);
            if (!res.success) {
              return res.error || 'Door action not allowed.';
            }
            if (res.locked !== desiredLock) {
              return 'Door state could not be updated.';
            }
          }
          return reply.say || (desiredLock ? 'Door locked.' : 'Door unlocked.');
        }
        const res = db.toggleDoor(doorKey);
        if (!res.success) return res.error || 'Door action not allowed.';
        return reply.say || (res.locked ? 'Door locked.' : 'Door unlocked.');
        */
      }
      case 'door.lock_all': {
        if (!db.can('door.lockAll')) {
          return 'You are not allowed to lock all doors.';
        }
        
        if (remoteApi.enabled) {
          try {
            await remoteApi.lockAllDoors();
            console.log('[Voice] All doors locked successfully (remote)');
          } catch (error: any) {
            console.error('[Voice] Failed to lock all doors:', error);
            return error?.message || 'Failed to lock all doors.';
          }
        } else {
          const res = db.lockAllDoors();
          if (!res.success) {
            return res.error || 'Lock all action not allowed.';
          }
          console.log('[Voice] All doors locked successfully (local)');
        }
        return reply.say || 'All doors locked.';
      }
      case 'door.unlock_all': {
        if (!db.can('door.unlockAll')) {
          return 'You are not allowed to unlock all doors.';
        }
        
        if (remoteApi.enabled) {
          try {
            await remoteApi.unlockAllDoors();
            console.log('[Voice] All doors unlocked successfully (remote)');
          } catch (error: any) {
            console.error('[Voice] Failed to unlock all doors:', error);
            return error?.message || 'Failed to unlock all doors.';
          }
        } else {
          const res = db.unlockAllDoors();
          if (!res.success) {
            return res.error || 'Unlock all action not allowed.';
          }
          console.log('[Voice] All doors unlocked successfully (local)');
        }
        return reply.say || 'All doors unlocked.';
      }
      default:
        return reply.say || 'Okay.';
    }
  };

  const sendMessage = async (raw: string) => {
    const message = raw.trim();
    if (!message) return;
    setTypedMessage('');
    updateSuggestions('');
    await handleVoiceCommand(message);
  };

  const submitTypedMessage = async () => {
    await sendMessage(typedMessage);
  };

  const handleToggleAutoMode = () => {
    const next = !autoMode;
    setAutoMode(next);
    if (next) {
      if (!isListening && !isSpeaking) {
        startListening();
      }
    } else if (isListening) {
      stopListening();
    }
  };

  const executeAssistantReply = async (reply: GeminiAssistantReply): Promise<string> => {
    switch (reply.action) {
      case 'device.set':
        return executeDeviceSet(reply);
      case 'door.lock':
      case 'door.unlock':
      case 'door.lock_all':
      case 'door.unlock_all':
        return executeDoorAction(reply);
      default:
        return reply.say || 'Okay.';
    }
  };

  const handleVoiceCommand = async (text: string) => {
    console.log('[Voice] Processing command:', text);
    addUserMessage(text);
    
    let responseMessage = '';
    try {
      // Limit history to save tokens
      const chatHistory: ChatMessage[] = conversationHistory.slice(-2).map((entry) => ({
        role: entry.type,
        content: entry.message,
      }));
      
      console.log('[Voice] Sending to Gemini:', { text, historyLength: chatHistory.length });
      const reply = await askGemini(text, chatHistory);
      console.log('[Voice] Gemini reply:', JSON.stringify(reply, null, 2));
      
      responseMessage = await executeAssistantReply(reply);
      console.log('[Voice] Executed reply:', responseMessage);
      addAssistantMessage(responseMessage);
      updateSuggestions(text, reply);
      await speakResponse(responseMessage);
    } catch (e) {
      responseMessage = `Sorry, I had trouble processing that command. ${(e as any)?.message || 'Please try again.'}`;
      console.log('[Voice] Error processing command:', e);
      addAssistantMessage(responseMessage);
      await speakResponse(responseMessage);
    }
  };

  const updateSuggestions = (input: string, reply?: GeminiAssistantReply) => {
    const loweredInput = input.toLowerCase();

    if (!reply && loweredInput.trim().length === 0) {
      setSuggestions([]);
      return;
    }

    const selectByRoom = (roomKey: RoomKey) => {
      const keywords = ROOM_KEYWORDS[roomKey] || [];
      if (!keywords.length) return [];
      return QUICK_COMMANDS.filter((cmd) => {
        const phrase = cmd.phrase.toLowerCase();
        return keywords.some((keyword) => phrase.includes(keyword));
      }).slice(0, 3);
    };

    let next: QuickCommand[] = [];

    if (reply) {
      if (reply.action === 'device.set' && reply.room) {
        const roomKey = normalizeRoomKey(reply.room);
        next = selectByRoom(roomKey);
      } else if (reply.action?.startsWith('door.')) {
        if (reply.door) {
          const doorKey = normalizeDoorKey(reply.door);
          next = selectByRoom(doorKey);
        } else {
          next = QUICK_COMMANDS.filter((cmd) => cmd.phrase.includes('door')).slice(0, 3);
        }
      } else if (reply.action === 'none') {
        next = [];
      }
    }

    if (!next.length && loweredInput) {
      const matched = QUICK_COMMANDS.filter((cmd) =>
        cmd.phrase.toLowerCase().includes(loweredInput)
      );
      if (matched.length) {
        next = matched.slice(0, 3);
      }
    }

    setSuggestions(next.slice(0, 3));
  };

  const handleTypedChange = (value: string) => {
    setTypedMessage(value);
    updateSuggestions(value);
  };

  const showDebugInfo = () => {
    const info = {
      voiceService: voiceDebugInfo,
      currentState: {
        isListening,
        isSpeaking,
        voiceError,
        platform: Platform.OS,
        canUseVoice: db.can('voice.use'),
      },
      suggestions: suggestions.length,
      conversationLength: conversationHistory.length,
    };
    Alert.alert('Voice Debug Info', JSON.stringify(info, null, 2));
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Voice Control</Text>
        <View style={styles.headerRight}>
          <Text style={styles.subtitle}>Chat or speak with your smart home assistant</Text>
          {debugMode && (
            <TouchableOpacity style={styles.debugButton} onPress={showDebugInfo}>
              <Text style={styles.debugButtonText}>Debug</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      {/* Greeting on mount */}
      {conversationHistory.length <= 1 && (
        <>
          <View style={{ backgroundColor: '#1F2937', borderColor: '#374151', borderWidth: 1, borderRadius: 12, padding: 12, marginHorizontal: 20, marginBottom: 12 }}>
            <Text style={{ color: '#9CA3AF' }}>Assistant is online. Tap the mic and say things like "Lock the main door" or "Unlock all doors".</Text>
          </View>
          <View style={{ marginTop: 8 }}>
            <TouchableOpacity 
              style={[styles.quickCommand, { alignSelf: 'center', backgroundColor: speakEnabled ? '#10B981' : '#374151' }]}
              onPress={() => setSpeakEnabled(v => !v)}
            >
              {speakEnabled ? <Volume2 size={16} color="#ffffff" /> : <VolumeX size={16} color="#ffffff" />}
              <Text style={[styles.quickCommandText, { color: '#ffffff', marginLeft: 6 }]}>{speakEnabled ? 'Speaking On' : 'Speaking Off'}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
      {!db.can('voice.use') && (
        <View style={{ backgroundColor: '#1F2937', borderColor: '#374151', borderWidth: 1, borderRadius: 12, padding: 12, marginHorizontal: 20, marginBottom: 12 }}>
          <Text style={{ color: '#F59E0B' }}>Voice control is disabled for your account.</Text>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.conversationContainer}
        contentContainerStyle={styles.conversationContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {conversationHistory.map((message, index) => (
          <View 
            key={index}
            style={[
              styles.messageContainer,
              message.type === 'user' ? styles.userMessage : styles.assistantMessage
            ]}
          >
            <Text style={[
              styles.messageText,
              message.type === 'user' ? styles.userMessageText : styles.assistantMessageText
            ]}>
              {message.message}
            </Text>
          </View>
        ))}
      </ScrollView>

      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.controlsContainer}>
        {transcript ? (
          <View style={styles.transcriptContainer}>
            <Text style={styles.transcriptLabel}>You said:</Text>
            <Text style={styles.transcriptText}>{transcript}</Text>
          </View>
        ) : null}

        {/* Enhanced error display */}
        {voiceError && (
          <View style={styles.errorContainer}>
            <View style={styles.errorContent}>
              <Text style={styles.errorText}>Voice Error: {voiceError}</Text>
              <Text style={styles.errorHint}>Platform: {Platform.OS}</Text>
            </View>
            <TouchableOpacity 
              style={styles.retryButton} 
              onPress={() => {
                setVoiceError(null);
                setIsListening(false);
                // Try to reinitialize
                voiceService.requestPermissions().catch(() => {});
              }}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.statusContainer}>
          {isListening && (
            <View style={styles.statusItem}>
              <View style={styles.listeningIndicator} />
              <Text style={styles.statusText}>Listening...</Text>
            </View>
          )}
          
          {isSpeaking && (
            <View style={styles.statusItem}>
              <Volume2 size={16} color="#10B981" />
              <Text style={[styles.statusText, { color: '#10B981' }]}>Speaking...</Text>
            </View>
          )}
        </View>
        <View style={styles.composerContainer}>
          <TouchableOpacity
            style={[styles.autoToggle, autoMode && styles.autoToggleActive]}
            onPress={handleToggleAutoMode}
          >
            <Text style={[styles.autoToggleText, autoMode && styles.autoToggleTextActive]}>
              Auto listen {autoMode ? 'on' : 'off'}
            </Text>
          </TouchableOpacity>

          <View style={styles.inputContainer}>
            {suggestions.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.suggestionRow}
              >
                {suggestions.map((cmd) => (
                  <TouchableOpacity
                    key={cmd.label}
                    style={styles.suggestionChip}
                    onPress={() => sendMessage(cmd.phrase)}
                  >
                    <Text style={styles.suggestionText}>{cmd.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <View style={styles.inputField}>
              <TextInput
                value={typedMessage}
                onChangeText={handleTypedChange}
                placeholder={voiceError ? 'Voice unavailable - type your command here...' : suggestions.length ? 'Ask or tap a suggestion…' : 'Type your question or command...'}
                placeholderTextColor="#6B7280"
                style={styles.textInput}
                multiline={false}
                returnKeyType="send"
                onSubmitEditing={() => submitTypedMessage()}
                blurOnSubmit
              />
              <View style={styles.inlineButtons}>
                <TouchableOpacity
                  style={[
                    styles.inlineIcon, 
                    isListening && styles.inlineIconActive,
                    voiceError && styles.inlineIconDisabled
                  ]}
                  onPress={() => {
                    if (voiceError) {
                      Alert.alert('Voice Unavailable', 'Please use the text input instead.');
                      return;
                    }
                    if (isListening) {
                      stopListening();
                      setAutoMode(false);
                    } else {
                      startListening();
                    }
                  }}
                  disabled={!!voiceError}
                >
                  {isListening ? <MicOff size={18} color="#F3F4F6" /> : <Mic size={18} color={voiceError ? "#6B7280" : "#F3F4F6"} />}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.inlineIcon, typedMessage.trim() ? styles.inlineIconConfirm : styles.inlineIconDisabled]}
                  onPress={submitTypedMessage}
                  disabled={!typedMessage.trim()}
                >
                  <Send size={18} color={typedMessage.trim() ? '#10B981' : '#6B7280'} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  headerRight: {
    alignItems: 'center',
    gap: 8,
  },
  debugButton: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  debugButtonText: {
    color: '#60A5FA',
    fontSize: 10,
    fontWeight: '600',
  },
  conversationContainer: {
    flex: 1,
    marginBottom: 20,
  },
  conversationContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingBottom: 12,
  },
  messageContainer: {
    marginVertical: 8,
    padding: 12,
    borderRadius: 12,
    maxWidth: '80%',
  },
  keyboardContainer: {
    width: '100%',
  },
  userMessage: {
    backgroundColor: '#3B82F6',
    alignSelf: 'flex-end',
  },
  assistantMessage: {
    backgroundColor: '#1F2937',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#374151',
  },
  messageText: {
    fontSize: 16,
  },
  userMessageText: {
    color: '#FFFFFF',
  },
  assistantMessageText: {
    color: '#E5E7EB',
  },
  controlsContainer: {
    gap: 20,
  },
  transcriptContainer: {
    backgroundColor: '#1F2937',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  transcriptLabel: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 4,
  },
  transcriptText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  statusContainer: {
    alignItems: 'center',
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  listeningIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  autoToggle: {
    alignSelf: 'center',
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#1F2937',
  },
  autoToggleActive: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  autoToggleText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  autoToggleTextActive: {
    color: '#10B981',
  },
  composerContainer: {
    width: '100%',
    gap: 12,
    marginTop: 12,
  },
  quickCommand: {
    backgroundColor: '#374151',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  quickCommandText: {
    color: '#D1D5DB',
    fontSize: 14,
  },
  inputContainer: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#374151',
    padding: 12,
    gap: 10,
  },
  textInput: {
    flex: 1,
    color: '#F9FAFB',
    fontSize: 16,
    paddingVertical: 8,
  },
  inputField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    paddingHorizontal: 12,
  },
  inlineButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inlineIcon: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(59,130,246,0.12)',
  },
  inlineIconActive: {
    backgroundColor: 'rgba(239,68,68,0.18)',
  },
  inlineIconConfirm: {
    backgroundColor: 'rgba(16,185,129,0.18)',
  },
  inlineIconDisabled: {
    opacity: 0.4,
  },
  errorContainer: {
    backgroundColor: 'rgba(127, 29, 29, 0.8)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#DC2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  errorContent: {
    flex: 1,
  },
  errorText: {
    color: '#FEE2E2',
    fontSize: 14,
    fontWeight: '600',
  },
  errorHint: {
    color: '#FECACA',
    fontSize: 12,
    marginTop: 2,
  },
  retryButton: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  suggestionRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 6,
  },
  suggestionChip: {
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  suggestionText: {
    color: '#93C5FD',
    fontSize: 12,
    fontWeight: '600',
  },
});