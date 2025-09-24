import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

class BiometricService {
  async isAvailable() {
    try {
      if (Platform.OS === 'web') {
        // Web fallback - simulate availability
        return {
          available: true,
          biometryType: 'fingerprint',
          isSimulated: true
        };
      }

      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
      
      return {
        available: hasHardware && isEnrolled,
        biometryType: supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) 
          ? 'face' : 'fingerprint'
      };
    } catch (error) {
      return { available: false, error: error.message };
    }
  }

  async authenticate(reason = 'Authenticate to access your smart home') {
    try {
      if (Platform.OS === 'web') {
        // Web simulation
        await this.simulateDelay(1500);
        return Math.random() > 0.2 ? 
          { success: true, isSimulated: true } : 
          { success: false, error: 'Authentication failed' };
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: reason,
        cancelLabel: 'Cancel',
        fallbackLabel: 'Use Password'
      });

      return { success: result.success, error: result.error };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async simulateDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Store user biometric preference
  async storeBiometricPreference(userId, enabled) {
    try {
      await SecureStore.setItemAsync(`biometric_${userId}`, enabled.toString());
      return true;
    } catch (error) {
      console.log('Failed to store biometric preference:', error);
      return false;
    }
  }

  // Get user biometric preference
  async getBiometricPreference(userId) {
    try {
      const preference = await SecureStore.getItemAsync(`biometric_${userId}`);
      return preference === 'true';
    } catch (error) {
      return false;
    }
  }
}

export const biometricService = new BiometricService();