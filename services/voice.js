import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Speech from 'expo-speech';
import { Alert } from 'react-native';

let ExpoSpeechRecognitionModule;
let addSpeechRecognitionListener;
try {
  const speechRecognition = require('expo-speech-recognition');
  ExpoSpeechRecognitionModule = speechRecognition?.ExpoSpeechRecognitionModule;
  addSpeechRecognitionListener = speechRecognition?.addSpeechRecognitionListener;
} catch (error) {
  ExpoSpeechRecognitionModule = undefined;
  addSpeechRecognitionListener = undefined;
}

class VoiceService {
  constructor() {
    this.isListening = false;
    this.synthesis = null;
    this.recognition = null; // web
    this.sttAvailable = Platform.OS === 'web';
    this.isExpoGo = (Constants?.appOwnership === 'expo');
    this.expoRecognition = null;
    this.expoSubscriptions = [];
    this.handleExpoResult = this.handleExpoResult.bind(this);
    this.handleExpoError = this.handleExpoError.bind(this);
    this.handleExpoSpeechEnd = this.handleExpoSpeechEnd.bind(this);
    
    // Initialize after a brief delay to avoid initialization errors
    setTimeout(() => {
      this.initializeServices();
    }, 100);
  }

  initializeServices() {
    console.log('[Voice] Initializing services for platform:', Platform.OS);
    
    if (Platform.OS === 'web') {
      if ('speechSynthesis' in window) this.synthesis = window.speechSynthesis;
      if ('webkitSpeechRecognition' in window) {
        this.recognition = new window.webkitSpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = 'en-US';
        this.sttAvailable = true;
      }
    }

    // For native platforms, try to set up Expo speech recognition
    if (Platform.OS !== 'web' && ExpoSpeechRecognitionModule && typeof addSpeechRecognitionListener === 'function') {
      this.setupExpoSpeechRecognition().catch((error) => {
        console.warn('[voice] expo speech recognition unavailable', error?.message || error);
      });
    } else if (Platform.OS !== 'web') {
      console.log('[voice] Speech recognition not available in current environment');
      // For Android, we can still enable basic functionality
      this.sttAvailable = false;
    }
  }

  onSpeechError(e) {
    this.isListening = false;
    console.error('Speech recognition error', e);
    if (this.rejectPromise) {
      this.rejectPromise(new Error(e.error?.message || 'Speech recognition failed'));
    }
  }

  onSpeechResults(e) {
    this.isListening = false;
    if (this.resolvePromise && e.value && e.value.length > 0) {
      this.resolvePromise({ transcript: e.value[0], confidence: 1 });
    } else if (this.rejectPromise) {
      this.rejectPromise(new Error('No speech was recognized.'));
    }
  }

  async setupExpoSpeechRecognition() {
    if (this.expoRecognition || !ExpoSpeechRecognitionModule?.requestPermissionsAsync || Platform.OS === 'web') {
      return;
    }
    if (typeof addSpeechRecognitionListener !== 'function') {
      return;
    }
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission?.granted) {
        console.log('[voice] Microphone permission not granted');
        return;
      }
      this.expoRecognition = ExpoSpeechRecognitionModule;
      this.sttAvailable = true;
      console.log('[voice] Expo speech recognition initialized successfully');
    } catch (error) {
      console.log('[voice] Failed to setup expo speech recognition:', error);
      throw error;
    }
  }

  handleExpoResult(event) {
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
    const message = event?.message || 'Speech recognition failed';
    if (this.rejectPromise) this.rejectPromise(new Error(message));
    this.clearExpoCallbacks();
    this.isListening = false;
  }

  handleExpoSpeechEnd() {
    this.isListening = false;
    this.clearExpoCallbacks();
  }

  clearExpoCallbacks() {
    this.resolvePromise = null;
    this.rejectPromise = null;
  }

  async startListening() {
    return new Promise((resolve, reject) => {
      if (Platform.OS !== 'web' && !this.sttAvailable && !this.expoRecognition) {
        reject(new Error('Speech recognition not available. Please use the text input instead.'));
        return;
      }
      
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
      this.isListening = true;
      try {
        if (this.recognition) {
          this.recognition.onresult = (event) => {
            this.isListening = false;
            const transcript = event.results[0][0].transcript;
            resolve({ transcript, confidence: event.results[0][0].confidence });
          };
          this.recognition.onerror = (event) => {
            this.isListening = false;
            reject(new Error(event.error || 'Speech error'));
          };
          this.recognition.onend = () => { this.isListening = false; };
          this.recognition.start();
        } else if (this.expoRecognition) {
          if (typeof addSpeechRecognitionListener === 'function') {
            this.expoSubscriptions.push(
              addSpeechRecognitionListener('result', this.handleExpoResult),
              addSpeechRecognitionListener('error', this.handleExpoError),
              addSpeechRecognitionListener('speechend', this.handleExpoSpeechEnd),
              addSpeechRecognitionListener('nomatch', this.handleExpoSpeechEnd)
            );
          }
          try {
            const startResult = this.expoRecognition.start({ lang: 'en-US', interimResults: false, addsPunctuation: true });
            if (startResult && typeof startResult.then === 'function') {
              startResult.catch((error) => {
                this.isListening = false;
                if (this.rejectPromise) this.rejectPromise(error instanceof Error ? error : new Error(String(error)));
              });
            }
          } catch (error) {
            console.log('[voice] expo speech start failed', error?.message || error);
            this.isListening = false;
            reject(error);
          }
        } else {
          this.isListening = false;
          reject(new Error('Speech recognition not available. Please use text input instead.'));
        }
      } catch (e) {
        this.isListening = false;
        console.error('Failed to start speech recognition', e);
        reject(e);
      }
    });
  }

  async stopListening() {
    this.isListening = false;
    try {
      if (this.recognition) this.recognition.stop();
      else if (this.expoRecognition && typeof this.expoRecognition.stop === 'function') this.expoRecognition.stop();
    } catch (e) {
      console.error('Failed to stop speech recognition', e);
    }
  }

  async requestPermissions() {
    if (Platform.OS === 'web') return { granted: true };
    
    try {
      if (this.expoRecognition && this.expoRecognition.requestPermissionsAsync) {
        return await this.expoRecognition.requestPermissionsAsync();
      }
      return { granted: false };
    } catch (error) {
      console.log('[voice] Permission request failed:', error);
      return { granted: false };
    }
  }

  async speak(text) {
    if (!text || typeof text !== 'string') return;
    
    if (Platform.OS !== 'web' && Speech && Speech.speak) {
      return new Promise(resolve => {
        try {
          Speech.speak(text, { 
            onDone: resolve, 
            onStopped: resolve, 
            onError: resolve,
            language: 'en-US', 
            rate: 0.95,
            volume: 0.8
          });
        } catch (e) {
          console.log('[voice] Speech error:', e);
          resolve();
        }
      });
    } else if (Platform.OS === 'web' && this.synthesis) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 0.8;
      
      return new Promise((resolve) => {
        utterance.onend = resolve;
        utterance.onerror = resolve;
        this.synthesis.speak(utterance);
      });
    } else {
      // Fallback for unsupported platforms
      return Promise.resolve();
    }
  }

  getListeningState() {
    return this.isListening;
  }

  async speakWelcomeMessage() {
    const welcomeMessage = 'Welcome to Smart Home by Nafisa Tabasum. You can control devices with your voice or use the text interface.';
    this.speak(welcomeMessage);
  }

  destroy() {
    if (this.expoRecognition) {
      try {
        this.expoRecognition.abort();
      } catch (e) {
        console.error('Failed to abort speech recognition', e);
      }
    }
    if (this.expoSubscriptions.length) {
      this.expoSubscriptions.forEach((sub) => {
        try {
          sub.remove();
        } catch (e) {
          console.error('Failed to remove subscription', e);
        }
      });
      this.expoSubscriptions = [];
    }
  }

  isAvailable() {
    return Platform.OS === 'web' ? !!this.sttAvailable : (!!this.sttAvailable || !!this.expoRecognition);
  }
}

export const voiceService = new VoiceService();
