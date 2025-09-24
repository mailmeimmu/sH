import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react-native';
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

const ROOM_DEVICE_ID_MAP: Record<string, Record<DeviceType, string[]>> = {
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

const INITIAL_ASSISTANT_MESSAGE: ConversationEntry = {
  type: 'assistant',
  message: 'Hello! I\'m your smart home voice assistant. Try saying "Lock the main hall door" or "Turn on the bedroom 1 fan".',
};

export default function VoiceControlScreen() {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [conversationHistory, setConversationHistory] = useState<ConversationEntry[]>([INITIAL_ASSISTANT_MESSAGE]);
  const [autoMode, setAutoMode] = useState(true);
  const [speakEnabled, setSpeakEnabled] = useState(true);

  useEffect(() => {
    // Initialize and destroy the voice service
    voiceService.initializeServices();
    return () => {
      voiceService.destroy();
    };
  }, []);

  useEffect(() => {
    // Auto-start assistant loop if allowed
    if (db.can('voice.use') && autoMode && !isListening && !isSpeaking) {
      const t = setTimeout(() => startListening(), 500);
      return () => clearTimeout(t);
    }
  }, [autoMode, isListening, isSpeaking]);

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
    if (!voiceService.isAvailable()) {
      Alert.alert('Voice unavailable', 'Speech recognition is not available in Expo Go. Use the dev client or web, or try quick commands.');
      return;
    }
    setTranscript('');
    setIsListening(true);
    
    // Use actual voice service
    voiceService.startListening()
      .then((result) => {
        setTranscript(result.transcript);
        setIsListening(false);
        handleVoiceCommand(result.transcript);
      })
      .catch((error) => {
        setIsListening(false);
        console.log('Voice recognition error:', error);
        if (error.message.includes('permission')) {
          Alert.alert('Microphone Permission', 'Please grant microphone permission to use voice control.');
        } else {
          addAssistantMessage('Sorry, I couldn\'t hear that clearly. Please try again.');
        }
      });
  };

  const stopListening = () => {
    voiceService.stopListening();
    setIsListening(false);
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

  const normalizeRoomKey = (room?: string): keyof typeof ROOM_DEVICE_ID_MAP => {
    const value = (room || '').toLowerCase();
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

  const getRoomDisplayName = (roomKey: keyof typeof ROOM_DEVICE_ID_MAP): string => {
    switch (roomKey) {
      case 'bedroom1':
        return 'bedroom 1';
      case 'bedroom2':
        return 'bedroom 2';
      case 'kitchen':
        return 'kitchen';
      default:
        return 'main hall';
    }
  };

  const normalizeDoorKey = (door?: string): 'mainhall' | 'bedroom1' | 'bedroom2' | 'kitchen' => {
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
    const policyRoom = mapRoomToPolicyKey(roomKey);

    if (!db.canDevice(policyRoom, deviceType)) {
      return `You are not allowed to control the ${deviceType} in the ${getRoomDisplayName(roomKey)}.`;
    }

    const deviceIds = ROOM_DEVICE_ID_MAP[roomKey]?.[deviceType] || [];
    if (remoteApi.enabled && deviceIds.length) {
      try {
        await Promise.all(deviceIds.map((id) => remoteApi.setDeviceState(id, desired === 'on' ? 1 : 0)));
      } catch (error: any) {
        return error?.message || `Failed to set the ${deviceType} in the ${getRoomDisplayName(roomKey)}.`;
      }
    }

    return reply.say || `Turning ${desired} the ${deviceType} in the ${getRoomDisplayName(roomKey)}.`;
  };

  const executeDoorAction = async (reply: GeminiAssistantReply): Promise<string> => {
    const door = normalizeDoorKey(reply.door);
    switch (reply.action) {
      case 'door.lock':
      case 'door.unlock': {
        const desiredLock = reply.action === 'door.lock';
        if (remoteApi.enabled) {
          try {
            const currentSnapshot = await remoteApi.getDoors();
            const currentlyLocked = Boolean(currentSnapshot?.[door]);
            if (currentlyLocked !== desiredLock) {
              const result: any = await remoteApi.toggleDoor(door);
              const locked = Boolean(result?.locked);
              if (locked !== desiredLock) {
                return 'The door state could not be confirmed.';
              }
            }
            return reply.say || (desiredLock ? 'Door locked.' : 'Door unlocked.');
          } catch (error: any) {
            return error?.message || 'Failed to update the door state.';
          }
        }
        const currentlyLocked = db.getDoorState(door);
        if (typeof currentlyLocked === 'boolean') {
          if (currentlyLocked !== desiredLock) {
            const res = db.toggleDoor(door);
            if (!res.success) {
              return res.error || 'Door action not allowed.';
            }
            if (res.locked !== desiredLock) {
              return 'Door state could not be updated.';
            }
          }
          return reply.say || (desiredLock ? 'Door locked.' : 'Door unlocked.');
        }
        const res = db.toggleDoor(door);
        if (!res.success) return res.error || 'Door action not allowed.';
        return reply.say || (res.locked ? 'Door locked.' : 'Door unlocked.');
      }
      case 'door.lock_all': {
        if (remoteApi.enabled) {
          try {
            await remoteApi.lockAllDoors();
          } catch (error: any) {
            return error?.message || 'Failed to lock all doors.';
          }
        } else {
          const res = db.lockAllDoors();
          if (!res.success) return res.error || 'Lock all action not allowed.';
        }
        return reply.say || 'All doors locked.';
      }
      case 'door.unlock_all': {
        if (remoteApi.enabled) {
          try {
            await remoteApi.unlockAllDoors();
          } catch (error: any) {
            return error?.message || 'Failed to unlock all doors.';
          }
        } else {
          const res = db.unlockAllDoors();
          if (!res.success) return res.error || 'Unlock all action not allowed.';
        }
        return reply.say || 'All doors unlocked.';
      }
      default:
        return reply.say || 'Okay.';
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
    addUserMessage(text);
    try {
      const chatHistory: ChatMessage[] = [...conversationHistory, { type: 'user' as const, message: text }].map((entry) => ({
        role: entry.type,
        content: entry.message,
      }));
      const reply = await askGemini(text, chatHistory);
      const message = await executeAssistantReply(reply);
      addAssistantMessage(message);
      await speakResponse(message);
    } catch (e) {
      const fallback = 'Sorry, I could not contact the assistant service.';
      addAssistantMessage(fallback);
      await speakResponse(fallback);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Voice Control</Text>
        <Text style={styles.subtitle}>Speak to control your smart home</Text>
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

      <ScrollView style={styles.conversationContainer} showsVerticalScrollIndicator={false}>
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

      <View style={styles.controlsContainer}>
        {transcript ? (
          <View style={styles.transcriptContainer}>
            <Text style={styles.transcriptLabel}>You said:</Text>
            <Text style={styles.transcriptText}>{transcript}</Text>
          </View>
        ) : null}

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.voiceButton, (isListening || autoMode) && styles.voiceButtonActive]}
            onPress={() => {
              if (autoMode) {
                setAutoMode(false);
                stopListening();
              } else {
                setAutoMode(true);
                startListening();
              }
            }}
          >
            {(isListening || autoMode) ? (
              <MicOff size={32} color="#FFFFFF" />
            ) : (
              <Mic size={32} color="#FFFFFF" />
            )}
          </TouchableOpacity>

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
        </View>

        <View style={styles.quickCommands}>
          <Text style={styles.quickCommandsTitle}>Quick Commands:</Text>
          <View style={styles.quickCommandList}>
            {QUICK_COMMANDS.map((cmd) => (
              <TouchableOpacity
                key={cmd.label}
                style={[
                  styles.quickCommand,
                  cmd.tone === 'positive' && styles.quickCommandPositive,
                  cmd.tone === 'negative' && styles.quickCommandNegative,
                ]}
                onPress={() => handleVoiceCommand(cmd.phrase)}
              >
                <Text style={styles.quickCommandText}>{cmd.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
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
  },
  conversationContainer: {
    flex: 1,
    marginBottom: 20,
  },
  messageContainer: {
    marginVertical: 8,
    padding: 12,
    borderRadius: 12,
    maxWidth: '80%',
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
  buttonContainer: {
    alignItems: 'center',
    gap: 16,
  },
  voiceButton: {
    backgroundColor: '#3B82F6',
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  voiceButtonActive: {
    backgroundColor: '#EF4444',
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
  quickCommands: {
    gap: 12,
  },
  quickCommandsTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  quickCommandList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickCommand: {
    backgroundColor: '#374151',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  quickCommandPositive: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  quickCommandNegative: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  quickCommandText: {
    color: '#D1D5DB',
    fontSize: 14,
  },
});
