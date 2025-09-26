import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Speech from 'expo-speech';
import { Alert, PermissionsAndroid } from 'react-native';

// Safe imports with proper error handling
let ExpoSpeechRecognitionModule;
let addSpeechRecognitionListener;
let VoiceModule;

try {
  const speechRecognition = require('expo-speech-recognition');
  ExpoSpeechRecognitionModule = speechRecognition?.ExpoSpeechRecognitionModule;
  addSpeechRecognitionListener = speechRecognition?.addSpeechRecognitionListener;
} catch (error) {
  console.log('[Voice] expo-speech-recognition not available:', error?.message);
  ExpoSpeechRecognitionModule = undefined;
  addSpeechRecognitionListener = undefined;
}

// Fallback to react-native-voice if available
try {
  VoiceModule = require('@react-native-voice/voice').default;
} catch (error) {
  console.log('[Voice] @react-native-voice/voice not available:', error?.message);
  VoiceModule = undefined;
}

class VoiceService {
  constructor() {
    this.isListening = false;
    this.synthesis = null;
    this.recognition = null; // web
    this.sttAvailable = false;
    this.isExpoGo = (Constants?.appOwnership === 'expo');
    this.expoRecognition = null;
    this.expoSubscriptions = [];
    this.voiceModule = VoiceModule;
    this.resolvePromise = null;
    this.rejectPromise = null;
    
    // Bind methods to avoid context issues
    this.handleExpoResult = this.handleExpoResult.bind(this);
    this.handleExpoError = this.handleExpoError.bind(this);
    this.handleExpoSpeechEnd = this.handleExpoSpeechEnd.bind(this);
    this.onSpeechStart = this.onSpeechStart.bind(this);
    this.onSpeechResults = this.onSpeechResults.bind(this);
    this.onSpeechError = this.onSpeechError.bind(this);
    this.onSpeechEnd = this.onSpeechEnd.bind(this);
    
    // Initialize services with delay to avoid startup crashes
    setTimeout(() => {
      this.initializeServices();
    }, 500);
  }

  async initializeServices() {
    console.log('[Voice] Initializing services for platform:', Platform.OS);
    
    try {
      if (Platform.OS === 'web') {
        await this.initializeWebSpeech();
      } else {
        await this.initializeNativeSpeech();
      }
    } catch (error) {
      console.warn('[Voice] Failed to initialize voice services:', error?.message);
      this.sttAvailable = false;
    }
  }

  async initializeWebSpeech() {
    try {
      if ('speechSynthesis' in window) {
        this.synthesis = window.speechSynthesis;
      }
      
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = 'en-US';
        this.sttAvailable = true;
        console.log('[Voice] Web speech recognition initialized');
      }
    } catch (error) {
      console.warn('[Voice] Web speech initialization failed:', error);
    }
  }

  async initializeNativeSpeech() {
    try {
      // Try Expo Speech Recognition first
      if (ExpoSpeechRecognitionModule && typeof addSpeechRecognitionListener === 'function') {
        await this.setupExpoSpeechRecognition();
      } 
      // Fallback to react-native-voice
      else if (this.voiceModule) {
        await this.setupVoiceModule();
      }
    } catch (error) {
      console.warn('[Voice] Native speech setup failed:', error?.message);
      this.sttAvailable = false;
    }
  }

  async setupExpoSpeechRecognition() {
    try {
      if (!ExpoSpeechRecognitionModule?.requestPermissionsAsync) {
        throw new Error('ExpoSpeechRecognitionModule not available');
      }

      console.log('[Voice] Setting up Expo speech recognition');
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      
      if (!permission?.granted) {
        console.log('[Voice] Microphone permission not granted');
        return;
      }

      this.expoRecognition = ExpoSpeechRecognitionModule;
      this.sttAvailable = true;
      console.log('[Voice] Expo speech recognition initialized successfully');
    } catch (error) {
      console.warn('[Voice] Expo speech recognition setup failed:', error?.message);
      throw error;
    }
  }

  async setupVoiceModule() {
    try {
      if (!this.voiceModule) {
        throw new Error('Voice module not available');
      }

      console.log('[Voice] Setting up react-native-voice');
      
      // Set up event listeners
      this.voiceModule.onSpeechStart = this.onSpeechStart;
      this.voiceModule.onSpeechResults = this.onSpeechResults;
      this.voiceModule.onSpeechError = this.onSpeechError;
      this.voiceModule.onSpeechEnd = this.onSpeechEnd;

      this.sttAvailable = true;
      console.log('[Voice] react-native-voice initialized successfully');
    } catch (error) {
      console.warn('[Voice] Voice module setup failed:', error?.message);
      throw error;
    }
  }

  // Voice module event handlers
  onSpeechStart() {
    console.log('[Voice] Speech started');
  }

  onSpeechResults(event) {
    console.log('[Voice] Speech results:', event);
    this.isListening = false;
    
    if (this.resolvePromise && event?.value && event.value.length > 0) {
      const transcript = event.value[0];
      this.resolvePromise({ transcript, confidence: 1 });
    } else if (this.rejectPromise) {
      this.rejectPromise(new Error('No speech was recognized.'));
    }
    this.clearCallbacks();
  }

  onSpeechError(event) {
    console.warn('[Voice] Speech error:', event);
    this.isListening = false;
    
    if (this.rejectPromise) {
      const message = event?.error?.message || 'Speech recognition failed';
      this.rejectPromise(new Error(message));
    }
    this.clearCallbacks();
  }

  onSpeechEnd() {
    console.log('[Voice] Speech ended');
    this.isListening = false;
  }

  // Expo speech recognition event handlers
  handleExpoResult(event) {
    console.log('[Voice] Expo result:', event);
    if (!event || !event.results || !event.results.length) return;
    
    const transcript = event.results[0]?.transcript || '';
    const confidence = event.results[0]?.confidence ?? 1;
    
    if (event.isFinal) {
      this.isListening = false;
      if (this.resolvePromise && transcript) {
        this.resolvePromise({ transcript, confidence });
      } else if (this.rejectPromise) {
        this.rejectPromise(new Error('No speech recognized.'));
      }
      this.clearExpoCallbacks();
    }
  }

  handleExpoError(event) {
    console.warn('[Voice] Expo error:', event);
    const message = event?.message || 'Speech recognition failed';
    if (this.rejectPromise) {
      this.rejectPromise(new Error(message));
    }
    this.clearExpoCallbacks();
    this.isListening = false;
  }

  handleExpoSpeechEnd() {
    console.log('[Voice] Expo speech ended');
    this.isListening = false;
    this.clearExpoCallbacks();
  }

  clearCallbacks() {
    this.resolvePromise = null;
    this.rejectPromise = null;
  }

  clearExpoCallbacks() {
    this.resolvePromise = null;
    this.rejectPromise = null;
    
    // Clean up subscriptions
    if (this.expoSubscriptions.length) {
      this.expoSubscriptions.forEach((sub) => {
        try {
          if (sub && typeof sub.remove === 'function') {
            sub.remove();
          }
        } catch (e) {
          console.warn('[Voice] Failed to remove subscription:', e);
        }
      });
      this.expoSubscriptions = [];
    }
  }

  async requestPermissions() {
    try {
      if (Platform.OS === 'web') {
        // Check for microphone permission on web
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          await navigator.mediaDevices.getUserMedia({ audio: true });
          return { granted: true };
        }
        return { granted: false };
      }
      
      // Android permission handling
      if (Platform.OS === 'android') {
        try {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
            {
              title: 'Smart Home Voice Control',
              message: 'This app needs access to your microphone for voice commands',
              buttonNeutral: 'Ask Me Later',
              buttonNegative: 'Cancel',
              buttonPositive: 'OK',
            }
          );
          return { granted: granted === PermissionsAndroid.RESULTS.GRANTED };
        } catch (error) {
          console.warn('[Voice] Android permission error:', error);
          return { granted: false };
        }
      }
      
      // iOS and Expo modules
      if (this.expoRecognition && this.expoRecognition.requestPermissionsAsync) {
        return await this.expoRecognition.requestPermissionsAsync();
      }
      
      return { granted: false };
    } catch (error) {
      console.warn('[Voice] Permission request failed:', error);
      return { granted: false };
    }
  }

  async startListening() {
    if (this.isListening) {
      console.log('[Voice] Already listening, ignoring request');
      return Promise.reject(new Error('Already listening'));
    }

    console.log('[Voice] Starting to listen...', { 
      platform: Platform.OS, 
      available: this.sttAvailable,
      hasExpo: !!this.expoRecognition,
      hasVoiceModule: !!this.voiceModule,
      hasWebRecognition: !!this.recognition
    });

    return new Promise((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
      this.isListening = true;

      try {
        if (Platform.OS === 'web' && this.recognition) {
          console.log('[Voice] Using web speech recognition');
          this.startWebRecognition();
        } else if (Platform.OS !== 'web' && this.expoRecognition) {
          console.log('[Voice] Using Expo speech recognition');
          this.startExpoRecognition();
        } else if (Platform.OS !== 'web' && this.voiceModule) {
          console.log('[Voice] Using react-native-voice');
          this.startVoiceModule();
        } else {
          console.log('[Voice] No speech recognition available');
          this.isListening = false;
          reject(new Error('Speech recognition not available on this device'));
        }
      } catch (error) {
        console.error('[Voice] Failed to start listening:', error);
        this.isListening = false;
        reject(error);
      }
    });
  }

  startWebRecognition() {
    if (!this.recognition) {
      throw new Error('Web recognition not available');
    }

    this.recognition.onresult = (event) => {
      this.isListening = false;
      console.log('[Voice] Web recognition result:', event.results[0][0].transcript);
      const transcript = event.results[0][0].transcript;
      const confidence = event.results[0][0].confidence;
      if (this.resolvePromise) {
        this.resolvePromise({ transcript, confidence });
      }
      this.clearCallbacks();
    };

    this.recognition.onerror = (event) => {
      this.isListening = false;
      console.warn('[Voice] Web recognition error:', event.error);
      if (this.rejectPromise) {
        this.rejectPromise(new Error(`Speech recognition error: ${event.error}`));
      }
      this.clearCallbacks();
    };

    this.recognition.onend = () => {
      this.isListening = false;
    };

    this.recognition.start();
  }

  startExpoRecognition() {
    if (!this.expoRecognition || typeof addSpeechRecognitionListener !== 'function') {
      throw new Error('Expo recognition not available');
    }

    // Clear previous subscriptions
    this.clearExpoCallbacks();

    // Set up new subscriptions
    this.expoSubscriptions = [
      addSpeechRecognitionListener('result', this.handleExpoResult),
      addSpeechRecognitionListener('error', this.handleExpoError),
      addSpeechRecognitionListener('speechend', this.handleExpoSpeechEnd),
      addSpeechRecognitionListener('nomatch', this.handleExpoSpeechEnd)
    ];

    try {
      const startResult = this.expoRecognition.start({ 
        lang: 'en-US', 
        interimResults: false, 
        addsPunctuation: true 
      });
      
      if (startResult && typeof startResult.then === 'function') {
        startResult.catch((error) => {
          console.warn('[Voice] Expo start failed:', error);
          this.isListening = false;
          if (this.rejectPromise) {
            this.rejectPromise(error instanceof Error ? error : new Error(String(error)));
          }
          this.clearExpoCallbacks();
        });
      }
    } catch (error) {
      console.warn('[Voice] Expo speech start exception:', error);
      this.isListening = false;
      this.clearExpoCallbacks();
      throw error;
    }
  }

  async startVoiceModule() {
    if (!this.voiceModule) {
      throw new Error('Voice module not available');
    }

    try {
      // Stop any previous session
      await this.voiceModule.stop();
      await this.voiceModule.destroy();
      
      // Start new session
      await this.voiceModule.start('en-US');
    } catch (error) {
      console.warn('[Voice] Voice module start failed:', error);
      throw error;
    }
  }

  async stopListening() {
    console.log('[Voice] Stopping listening');
    this.isListening = false;
    
    try {
      if (this.recognition) {
        this.recognition.stop();
      } else if (this.expoRecognition && typeof this.expoRecognition.stop === 'function') {
        this.expoRecognition.stop();
      } else if (this.voiceModule && typeof this.voiceModule.stop === 'function') {
        await this.voiceModule.stop();
      }
    } catch (error) {
      console.warn('[Voice] Failed to stop listening:', error);
    }

    this.clearCallbacks();
    this.clearExpoCallbacks();
  }

  async speak(text) {
    if (!text || typeof text !== 'string') {
      console.log('[Voice] No text to speak');
      return;
    }
    
    console.log('[Voice] Speaking:', text);
    
    try {
      // Cancel any ongoing speech before starting new one
      if (Platform.OS === 'web' && this.synthesis) {
        this.synthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.85;
        utterance.pitch = 1;
        utterance.volume = 0.8;
        utterance.lang = 'en-US';
        
        return new Promise((resolve) => {
          utterance.onend = () => {
            console.log('[Voice] Web speech completed');
            resolve();
          };
          utterance.onerror = (error) => {
            console.warn('[Voice] Web speech error:', error);
            resolve();
          };
          this.synthesis.speak(utterance);
        });
      } else if (Platform.OS !== 'web' && Speech && Speech.speak) {
        // Stop any current speech on native platforms
        try {
          Speech.stop();
        } catch (e) {
          // Ignore stop errors
        }
        
        return new Promise(resolve => {
          try {
            Speech.speak(text, { 
              onDone: resolve, 
              onStopped: resolve, 
              onError: (error) => {
                console.warn('[Voice] Native speech error:', error);
                resolve();
              },
              language: 'en-US', 
              rate: 0.85,
              volume: 0.8
            });
          } catch (error) {
            console.warn('[Voice] Speech error:', error);
            resolve();
          }
        });
      } else {
        console.log('[Voice] Speech synthesis not available');
        return Promise.resolve();
      }
    } catch (error) {
      console.warn('[Voice] Speech failed:', error);
      return Promise.resolve();
    }
  }

  getListeningState() {
    return this.isListening;
  }

  async speakWelcomeMessage() {
    const welcomeMessage = 'Welcome to Smart Home by Nafisa Tabasum. You can control devices with your voice.';
    return this.speak(welcomeMessage);
  }

  destroy() {
    console.log('[Voice] Destroying voice service');
    this.isListening = false;
    
    try {
      if (this.expoRecognition && typeof this.expoRecognition.abort === 'function') {
        this.expoRecognition.abort();
      }
    } catch (error) {
      console.warn('[Voice] Failed to abort expo recognition:', error);
    }

    try {
      if (this.voiceModule && typeof this.voiceModule.destroy === 'function') {
        this.voiceModule.destroy();
      }
    } catch (error) {
      console.warn('[Voice] Failed to destroy voice module:', error);
    }

    this.clearExpoCallbacks();
    this.clearCallbacks();
  }

  isAvailable() {
    if (Platform.OS === 'web') {
      return !!(this.recognition || window.webkitSpeechRecognition || window.SpeechRecognition);
    }
    return this.sttAvailable || !!(this.expoRecognition || this.voiceModule);
  }
}

export const voiceService = new VoiceService();