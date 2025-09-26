import { Platform } from 'react-native';
import * as Speech from 'expo-speech';

// Import native voice recognition for mobile
let Voice = null;
let ExpoSpeechRecognition = null;

try {
  if (Platform.OS !== 'web') {
    // Try to use @react-native-voice/voice first
    Voice = require('@react-native-voice/voice').default;
    console.log('[Voice] react-native-voice loaded successfully');
  }
} catch (error) {
  console.log('[Voice] react-native-voice not available, trying expo-speech-recognition');
  try {
    if (Platform.OS !== 'web') {
      ExpoSpeechRecognition = require('expo-speech-recognition');
      console.log('[Voice] expo-speech-recognition loaded successfully');
    }
  } catch (error2) {
    console.log('[Voice] No mobile voice recognition available, will use simulation');
  }
}

// Enhanced voice service with real mobile voice recognition
class VoiceService {
  constructor() {
    this.isListening = false;
    this.isSpeaking = false;
    this.webRecognition = null;
    this.hasInitialized = false;
    this.permissionsGranted = false;
    this.lastError = null;
    this.voiceEvents = [];
    
    // Initialize voice service
    this.initializeAsync();
  }

  async initializeAsync() {
    try {
      console.log('[Voice] Initializing voice service for platform:', Platform.OS);
      
      if (Platform.OS === 'web') {
        await this.initializeWebSpeech();
      } else {
        await this.initializeMobileSpeech();
      }
      
      this.hasInitialized = true;
      console.log('[Voice] Voice service initialized successfully');
    } catch (error) {
      console.error('[Voice] Initialization failed:', error);
      this.lastError = error.message || 'Initialization failed';
      this.hasInitialized = true;
    }
  }

  async initializeWebSpeech() {
    if (typeof window === 'undefined') return;
    
    try {
      const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
      
      if (!SpeechRecognition) {
        throw new Error('Speech recognition not supported in this browser');
      }
      
      this.webRecognition = new SpeechRecognition();
      this.webRecognition.continuous = false;
      this.webRecognition.interimResults = false;
      this.webRecognition.lang = 'en-US';
      
      console.log('[Voice] Web speech initialized');
    } catch (error) {
      console.error('[Voice] Web speech initialization failed:', error);
      throw error;
    }
  }

  async initializeMobileSpeech() {
    try {
      if (Voice) {
        console.log('[Voice] Initializing react-native-voice');
        
        // Set up event listeners
        Voice.onSpeechStart = () => {
          console.log('[Voice] Speech recognition started');
        };
        
        Voice.onSpeechResults = (e) => {
          console.log('[Voice] Speech results:', e.value);
          this.voiceEvents.push({ type: 'results', data: e.value });
        };
        
        Voice.onSpeechError = (e) => {
          console.error('[Voice] Speech error:', e.error);
          this.voiceEvents.push({ type: 'error', data: e.error });
        };
        
        Voice.onSpeechEnd = () => {
          console.log('[Voice] Speech recognition ended');
          this.voiceEvents.push({ type: 'end' });
        };
        
        console.log('[Voice] react-native-voice initialized');
      } else if (ExpoSpeechRecognition) {
        console.log('[Voice] Using expo-speech-recognition');
        
        // Check if speech recognition is available
        const isAvailable = await ExpoSpeechRecognition.getStateAsync();
        console.log('[Voice] Speech recognition state:', isAvailable);
        
      } else {
        console.log('[Voice] No mobile voice recognition available, using simulation');
      }
      
      // Initialize speech synthesis
      if (Speech && Speech.speak) {
        console.log('[Voice] Speech synthesis available');
      }
      
    } catch (error) {
      console.error('[Voice] Mobile speech initialization failed:', error);
      // Don't throw - we can fall back to simulation
    }
  }

  async requestPermissions() {
    try {
      console.log('[Voice] Requesting permissions for platform:', Platform.OS);
      
      if (Platform.OS === 'web') {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            this.permissionsGranted = true;
            console.log('[Voice] Web microphone permission granted');
            return { granted: true };
          } catch (error) {
            console.error('[Voice] Web microphone permission denied:', error);
            this.lastError = 'Microphone permission denied';
            return { granted: false, error: 'Microphone permission denied' };
          }
        } else {
          this.lastError = 'Microphone not available';
          return { granted: false, error: 'Microphone not available' };
        }
      } else {
        // Mobile permission handling
        if (Voice) {
          try {
            const isAvailable = await Voice.isAvailable();
            if (isAvailable) {
              this.permissionsGranted = true;
              console.log('[Voice] Mobile voice recognition available');
              return { granted: true };
            } else {
              this.lastError = 'Voice recognition not available on device';
              return { granted: false, error: 'Voice recognition not available' };
            }
          } catch (error) {
            console.error('[Voice] Voice permission check failed:', error);
            this.lastError = error.message || 'Permission check failed';
            return { granted: false, error: this.lastError };
          }
        } else if (ExpoSpeechRecognition) {
          try {
            const permissions = await ExpoSpeechRecognition.requestPermissionsAsync();
            this.permissionsGranted = permissions.granted;
            console.log('[Voice] Expo speech recognition permissions:', permissions);
            return { granted: permissions.granted, error: permissions.granted ? null : 'Permission denied' };
          } catch (error) {
            console.error('[Voice] Expo speech permission failed:', error);
            this.lastError = error.message || 'Permission request failed';
            return { granted: false, error: this.lastError };
          }
        } else {
          console.log('[Voice] No mobile voice recognition available');
          this.permissionsGranted = true; // Allow simulation mode
          return { granted: true, simulation: true };
        }
      }
    } catch (error) {
      console.error('[Voice] Permission request failed:', error);
      this.lastError = error.message || 'Permission request failed';
      return { granted: false, error: this.lastError };
    }
  }

  async startListening() {
    if (this.isListening) {
      console.log('[Voice] Already listening');
      return Promise.reject(new Error('Already listening'));
    }

    if (!this.hasInitialized) {
      console.log('[Voice] Service not initialized');
      return Promise.reject(new Error('Voice service not initialized'));
    }

    console.log('[Voice] Starting to listen...', { 
      platform: Platform.OS, 
      permissions: this.permissionsGranted,
      hasVoice: !!Voice,
      hasExpoSpeech: !!ExpoSpeechRecognition,
      webRecognition: !!this.webRecognition 
    });
    
    this.isListening = true;
    this.lastError = null;
    this.voiceEvents = []; // Clear previous events

    return new Promise(async (resolve, reject) => {
      try {
        if (Platform.OS === 'web' && this.webRecognition) {
          console.log('[Voice] Using web speech recognition');
          
          this.webRecognition.onstart = () => {
            console.log('[Voice] Web recognition started');
          };

          this.webRecognition.onresult = (event) => {
            this.isListening = false;
            const transcript = event.results[0][0].transcript;
            const confidence = event.results[0][0].confidence || 0.9;
            console.log('[Voice] Web recognition result:', transcript, 'confidence:', confidence);
            resolve({ transcript, confidence });
          };

          this.webRecognition.onerror = (event) => {
            this.isListening = false;
            console.error('[Voice] Web recognition error:', event.error);
            this.lastError = `Speech recognition error: ${event.error}`;
            reject(new Error(this.lastError));
          };

          this.webRecognition.onend = () => {
            this.isListening = false;
            console.log('[Voice] Web recognition ended');
          };

          this.webRecognition.start();
          
        } else if (Platform.OS !== 'web' && Voice) {
          console.log('[Voice] Using react-native-voice');
          
          // Set up one-time listeners for this session
          const cleanup = () => {
            Voice.removeAllListeners();
            this.isListening = false;
          };
          
          Voice.onSpeechResults = (e) => {
            cleanup();
            const transcript = e.value && e.value[0] ? e.value[0] : '';
            console.log('[Voice] Native recognition result:', transcript);
            if (transcript) {
              resolve({ transcript, confidence: 0.9 });
            } else {
              reject(new Error('No speech detected'));
            }
          };
          
          Voice.onSpeechError = (e) => {
            cleanup();
            console.error('[Voice] Native recognition error:', e.error);
            this.lastError = e.error?.message || e.error || 'Speech recognition failed';
            reject(new Error(this.lastError));
          };
          
          Voice.onSpeechEnd = () => {
            console.log('[Voice] Native recognition ended');
            // Don't cleanup here, wait for results or error
          };
          
          // Start recognition
          Voice.start('en-US');
          
          // Timeout after 10 seconds
          setTimeout(() => {
            if (this.isListening) {
              cleanup();
              reject(new Error('Speech recognition timeout'));
            }
          }, 10000);
          
        } else if (Platform.OS !== 'web' && ExpoSpeechRecognition) {
          console.log('[Voice] Using expo-speech-recognition');
          
          try {
            const result = await ExpoSpeechRecognition.startAsync({
              language: 'en-US',
              interimResults: false,
              maxAlternatives: 1,
              continuous: false,
            });
            
            this.isListening = false;
            
            if (result.transcripts && result.transcripts.length > 0) {
              const transcript = result.transcripts[0];
              console.log('[Voice] Expo recognition result:', transcript);
              resolve({ transcript, confidence: result.confidence || 0.9 });
            } else {
              reject(new Error('No speech detected'));
            }
          } catch (error) {
            this.isListening = false;
            console.error('[Voice] Expo recognition error:', error);
            this.lastError = error.message || 'Speech recognition failed';
            reject(new Error(this.lastError));
          }
          
        } else {
          // Fallback simulation for when no voice recognition is available
          console.log('[Voice] Using simulation mode - no voice recognition available');
          
          // Simulate listening process
          setTimeout(() => {
            this.isListening = false;
            
            // Instead of random commands, ask user to type
            reject(new Error('Voice recognition not available on this device. Please use the text input below.'));
          }, 1500);
        }
      } catch (error) {
        this.isListening = false;
        console.error('[Voice] Start listening failed:', error);
        this.lastError = error.message || 'Failed to start listening';
        reject(error);
      }
    });
  }

  async stopListening() {
    console.log('[Voice] Stopping listening');
    this.isListening = false;
    
    try {
      if (this.webRecognition && Platform.OS === 'web') {
        this.webRecognition.stop();
      } else if (Voice && Platform.OS !== 'web') {
        await Voice.stop();
        Voice.removeAllListeners();
      } else if (ExpoSpeechRecognition && Platform.OS !== 'web') {
        await ExpoSpeechRecognition.stop();
      }
    } catch (error) {
      console.warn('[Voice] Failed to stop listening:', error);
    }
  }

  async speak(text) {
    if (!text || typeof text !== 'string') {
      console.log('[Voice] No text to speak');
      return Promise.resolve();
    }
    
    console.log('[Voice] Speaking:', text.substring(0, 50) + (text.length > 50 ? '...' : ''));
    this.isSpeaking = true;
    
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.speechSynthesis) {
        return new Promise((resolve) => {
          try {
            window.speechSynthesis.cancel();
            
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 0.9;
            utterance.pitch = 1.0;
            utterance.volume = 0.8;
            utterance.lang = 'en-US';
            
            utterance.onend = () => {
              console.log('[Voice] Web speech completed');
              this.isSpeaking = false;
              resolve();
            };
            
            utterance.onerror = (error) => {
              console.warn('[Voice] Web speech error:', error);
              this.isSpeaking = false;
              resolve();
            };
            
            window.speechSynthesis.speak(utterance);
          } catch (error) {
            console.error('[Voice] Web speech synthesis error:', error);
            this.isSpeaking = false;
            resolve();
          }
        });
      } else if (Platform.OS !== 'web' && Speech && Speech.speak) {
        return new Promise((resolve) => {
          try {
            Speech.stop().catch(() => {});
            
            Speech.speak(text, {
              language: 'en-US',
              rate: 0.9,
              volume: 0.8,
              onDone: () => {
                console.log('[Voice] Mobile speech completed');
                this.isSpeaking = false;
                resolve();
              },
              onStopped: () => {
                console.log('[Voice] Mobile speech stopped');
                this.isSpeaking = false;
                resolve();
              },
              onError: (error) => {
                console.warn('[Voice] Mobile speech error:', error);
                this.isSpeaking = false;
                resolve();
              }
            });
          } catch (error) {
            console.error('[Voice] Mobile speech synthesis error:', error);
            this.isSpeaking = false;
            resolve();
          }
        });
      } else {
        console.log('[Voice] Speech synthesis not available');
        this.isSpeaking = false;
        return Promise.resolve();
      }
    } catch (error) {
      console.error('[Voice] Speech failed:', error);
      this.isSpeaking = false;
      return Promise.resolve();
    }
  }

  getListeningState() {
    return this.isListening;
  }

  getSpeakingState() {
    return this.isSpeaking;
  }

  getLastError() {
    return this.lastError;
  }

  isAvailable() {
    if (Platform.OS === 'web') {
      return !!(
        this.webRecognition || 
        (typeof window !== 'undefined' && (window.webkitSpeechRecognition || window.SpeechRecognition))
      );
    }
    // For mobile, check if we have real voice recognition
    return !!(Voice || ExpoSpeechRecognition);
  }

  hasRealVoiceRecognition() {
    if (Platform.OS === 'web') {
      return this.isAvailable();
    }
    return !!(Voice || ExpoSpeechRecognition);
  }

  async speakWelcomeMessage() {
    const welcomeMessage = 'Welcome to Smart Home by Nafisa Tabasum. You can control devices with your voice or ask me anything.';
    return this.speak(welcomeMessage);
  }

  destroy() {
    console.log('[Voice] Destroying voice service');
    this.isListening = false;
    this.isSpeaking = false;
    
    try {
      if (this.webRecognition && Platform.OS === 'web') {
        this.webRecognition.abort();
        this.webRecognition = null;
      } else if (Voice && Platform.OS !== 'web') {
        Voice.destroy();
        Voice.removeAllListeners();
      } else if (ExpoSpeechRecognition && Platform.OS !== 'web') {
        ExpoSpeechRecognition.stop().catch(() => {});
      }
    } catch (error) {
      console.warn('[Voice] Failed to destroy voice service:', error);
    }

    try {
      if (Platform.OS !== 'web' && Speech && Speech.stop) {
        Speech.stop();
      } else if (Platform.OS === 'web' && typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } catch (error) {
      console.warn('[Voice] Failed to stop speech:', error);
    }
  }

  getDebugInfo() {
    return {
      platform: Platform.OS,
      isListening: this.isListening,
      isSpeaking: this.isSpeaking,
      hasInitialized: this.hasInitialized,
      permissionsGranted: this.permissionsGranted,
      lastError: this.lastError,
      webRecognitionAvailable: !!this.webRecognition,
      speechSynthesisAvailable: Platform.OS === 'web' ? !!(typeof window !== 'undefined' && window.speechSynthesis) : !!(Speech && Speech.speak),
      hasVoiceLibrary: !!Voice,
      hasExpoSpeechRecognition: !!ExpoSpeechRecognition,
      hasRealVoiceRecognition: this.hasRealVoiceRecognition(),
      recentEvents: this.voiceEvents.slice(-5),
    };
  }
}

export const voiceService = new VoiceService();