import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Speech from 'expo-speech';
let Voice;
try {
  // Optional: available only in dev client/native builds
  Voice = require('@react-native-voice/voice').default;
} catch (e) {
  Voice = undefined;
}

class VoiceService {
  constructor() {
    this.isListening = false;
    this.synthesis = null;
    this.recognition = null; // web
    this.sttAvailable = false;
    this.isExpoGo = (Constants?.appOwnership === 'expo');
    this.initializeServices();
  }

  initializeServices() {
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

    if (!this.isExpoGo && Voice && typeof Voice.start === 'function') {
      this.sttAvailable = true;
      Voice.onSpeechError = this.onSpeechError.bind(this);
      Voice.onSpeechResults = this.onSpeechResults.bind(this);
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

  async startListening() {
    return new Promise((resolve, reject) => {
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
        } else if (!this.isExpoGo && Voice && typeof Voice.start === 'function') {
          Voice.start('en-US');
        } else {
          this.isListening = false;
          reject(new Error('Speech recognition not available in Expo Go. Use dev client or web.'));
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
      else if (!this.isExpoGo && Voice && typeof Voice.stop === 'function') await Voice.stop();
    } catch (e) {
      console.error('Failed to stop speech recognition', e);
    }
  }

  async speak(text) {
    if (Platform.OS !== 'web' && Speech && Speech.speak) {
      return new Promise(resolve => {
        try {
          Speech.speak(text, { onDone: resolve, onStopped: resolve, language: 'en-US', rate: 0.95 });
        } catch (e) {
          resolve();
        }
      });
    } else if (Platform.OS === 'web' && this.synthesis) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 0.8;
      
      return new Promise((resolve) => {
        utterance.onend = () => resolve();
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
    const welcomeMessage = 'Welcome to your smart home. You can control devices with your voice. For example, say \'Turn on the lights in the kitchen\'. Visit the voice tab for a full conversational experience.';
    this.speak(welcomeMessage);
  }

  destroy() {
    if (!this.isExpoGo && Voice && typeof Voice.destroy === 'function') {
      Voice.destroy().then(Voice.removeAllListeners);
    }
  }

  isAvailable() {
    return !!this.sttAvailable;
  }
}

export const voiceService = new VoiceService();
