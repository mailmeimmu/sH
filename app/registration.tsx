import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Platform, Alert } from 'react-native';
import { router } from 'expo-router';
import { Camera as CameraIcon, User, Save, CircleCheck as CheckCircle } from 'lucide-react-native';
import { db } from '../services/database';
import remoteApi from '../services/remote';
import { hashTemplateFromString } from '../utils/face-template';

// Platform-specific imports
let FaceRegistrationNative: any = null;
if (Platform.OS !== 'web') {
  try {
    FaceRegistrationNative = require('../components/FaceRegistrationNative').default;
  } catch (error) {
    console.warn('FaceRegistrationNative not available:', error);
  }
}

const INITIAL_STATUS = 'Press scan when you are ready';

export default function RegistrationScreen() {
  const [step, setStep] = useState<'info' | 'capture' | 'success'>('info');
  const [userInfo, setUserInfo] = useState({ name: '', email: '' });
  const [statusText, setStatusText] = useState(INITIAL_STATUS);
  const [isCapturing, setIsCapturing] = useState(false);
  const [createdUser, setCreatedUser] = useState<any>(null);

  const handleInfoSubmit = () => {
    if (!userInfo.name.trim() || !userInfo.email.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setStep('capture');
  };

  const finishRegistration = useCallback(() => {
    if (createdUser) {
      db.currentUser = createdUser;
    } else {
      const registeredUser = db.getAllUsers().find(u => u.email === userInfo.email);
      if (registeredUser) {
        db.currentUser = registeredUser;
      }
    }
    router.replace('/(tabs)');
  }, [createdUser, userInfo.email]);

  const completeRegistration = useCallback(async (templateStr: string) => {
    console.log('[Registration] Completing registration with template');
    const faceId = 'fid_' + hashTemplateFromString(templateStr);

    try {
      // Check for duplicates safely
      const duplicate = (db as any).matchFaceNoLogin?.(templateStr);
      if (duplicate?.success && duplicate.user) {
        Alert.alert('Already Registered', `${duplicate.user.name} is already registered on this device.`);
        setStatusText(INITIAL_STATUS);
        if (typeof resetCaptureState === 'function') resetCaptureState();
        return;
      }
    } catch (error) {
      console.warn('[Registration] Duplicate check failed:', error);
      // Continue with registration even if duplicate check fails
    }

    try {
      let result: any = { success: false };
      if (remoteApi.enabled) {
        try {
          result = await remoteApi.registerUser({ ...userInfo, faceId }, templateStr);
        } catch (error) {
          console.warn('[Registration] Remote registration failed, trying local:', error);
          result = await db.registerUser({ ...userInfo, faceId }, templateStr);
        }
      } else {
        result = await db.registerUser({ ...userInfo, faceId }, templateStr);
      }

      if (result.success) {
        const enrichedUser = { ...result.user, faceId };
        db.saveRemoteUser(enrichedUser, templateStr, faceId);
        setCreatedUser(enrichedUser);
        setStep('success');
        console.log('[Registration] Registration successful for:', enrichedUser.name);
      } else if (result.duplicate && result.user) {
        Alert.alert('Already Registered', `${result.user.name} is already registered on this device.`);
        setStatusText(INITIAL_STATUS);
      } else {
        const errorMsg = result?.error || 'Registration failed. Please try again.';
        console.warn('[Registration] Registration failed:', errorMsg);
        Alert.alert('Registration Failed', errorMsg);
        setStatusText(INITIAL_STATUS);
      }
    } catch (error) {
      console.error('[Registration] Registration error:', error);
      Alert.alert('Error', 'Could not complete registration. Please try again.');
      setStatusText(INITIAL_STATUS);
    } finally {
      setIsCapturing(false);
    }
  }, [userInfo]);

  const goBack = () => {
    if (step === 'capture') {
      setStep('info');
      setStatusText(INITIAL_STATUS);
      resetCaptureState();
    } else {
      router.back();
    }
  };

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={goBack}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>New Registration</Text>
        </View>
        <View style={styles.webNotSupportedContainer}>
          <CameraIcon size={64} color="#3B82F6" />
          <Text style={styles.webNotSupportedTitle}>Face registration is not available on web</Text>
          <Text style={styles.webNotSupportedText}>
            Face registration requires camera access and is only available on iOS and Android devices.
            Please use the mobile app to register with face recognition.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={goBack}>
            <Text style={styles.primaryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (step === 'info') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={goBack}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>New Registration</Text>
        </View>

        <View style={styles.infoForm}>
          <View style={styles.iconContainer}>
            <User size={64} color="#3B82F6" />
          </View>

          <Text style={styles.subtitle}>Let's set up your account</Text>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Full Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your full name"
              placeholderTextColor="#6B7280"
              value={userInfo.name}
              onChangeText={(text) => setUserInfo(prev => ({ ...prev, name: text }))}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Email Address</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              placeholderTextColor="#6B7280"
              keyboardType="email-address"
              autoCapitalize="none"
              value={userInfo.email}
              onChangeText={(text) => setUserInfo(prev => ({ ...prev, email: text }))}
            />
          </View>

          <TouchableOpacity style={styles.primaryButton} onPress={handleInfoSubmit}>
            <Text style={styles.primaryButtonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (step === 'capture') {
    if (!FaceRegistrationNative) {
      return (
        <View style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={goBack}>
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Face Capture</Text>
          </View>
          <View style={styles.webNotSupportedContainer}>
            <Text style={styles.loadingText}>Camera not available</Text>
          </View>
        </View>
      );
    }

    return (
      <FaceRegistrationNative
        userInfo={userInfo}
        onRegistrationComplete={completeRegistration}
        onGoBack={goBack}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={goBack}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Registration Complete</Text>
      </View>

      <View style={styles.successContainer}>
        <CheckCircle size={64} color="#10B981" />
        <Text style={styles.successTitle}>Welcome, {createdUser?.name || userInfo.name}!</Text>
        <Text style={styles.successSubtitle}>We saved your face scan for quick login.</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={finishRegistration}>
          <Text style={styles.primaryButtonText}>Go to Dashboard</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(148, 163, 184, 0.15)',
    borderRadius: 10,
    marginRight: 12,
  },
  backButtonText: {
    color: '#E5E7EB',
    fontWeight: '600',
  },
  title: {
    color: '#F9FAFB',
    fontSize: 22,
    fontWeight: '700',
  },
  infoForm: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1F2937',
    gap: 16,
  },
  iconContainer: {
    alignSelf: 'center',
    backgroundColor: 'rgba(37, 99, 235, 0.2)',
    padding: 18,
    borderRadius: 14,
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 15,
    textAlign: 'center',
  },
  inputContainer: {
    gap: 6,
  },
  inputLabel: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F9FAFB',
    fontSize: 16,
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: 'rgba(37, 99, 235, 0.5)',
  },
  primaryButtonText: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '600',
  },
  cameraContainer: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  faceFrame: {
    width: '70%',
    aspectRatio: 3 / 4,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(59, 130, 246, 0.4)',
    backgroundColor: 'transparent',
  },
  faceFrameActive: {
    borderColor: '#3B82F6',
  },
  scanningIndicator: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  scanningText: {
    color: '#E5E7EB',
    fontSize: 16,
    fontWeight: '600',
  },
  controls: {
    marginTop: 16,
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 24,
    gap: 16,
  },
  successContainer: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  successTitle: {
    color: '#F9FAFB',
    fontSize: 22,
    fontWeight: '700',
  },
  successSubtitle: {
    color: '#94A3B8',
    fontSize: 15,
    textAlign: 'center',
  },
  loadingText: {
    color: '#E5E7EB',
    fontSize: 16,
    textAlign: 'center',
  },
  webNotSupportedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 24,
    gap: 16,
  },
  webNotSupportedTitle: {
    color: '#F9FAFB',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  webNotSupportedText: {
    color: '#94A3B8',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
