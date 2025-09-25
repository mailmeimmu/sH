import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Alert, Platform } from 'react-native';
import {
  Camera as VisionCamera,
  useCameraPermission,
  useCameraDevice,
  useFrameProcessor,
} from 'react-native-vision-camera';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import { scanFaces } from 'vision-camera-face-detector';
import { router } from 'expo-router';
import { Camera as CameraIcon, User, Save, CircleCheck as CheckCircle } from 'lucide-react-native';
import { db } from '../services/database';
import remoteApi from '../services/remote';
import { buildTemplateFromFace, normalizeVisionFace, hashTemplateFromString } from '../utils/face-template';

const INITIAL_STATUS = 'Press scan when you are ready';

export default function RegistrationScreen() {
  const [step, setStep] = useState<'info' | 'capture' | 'success'>('info');
  const [userInfo, setUserInfo] = useState({ name: '', email: '' });
  const [statusText, setStatusText] = useState(INITIAL_STATUS);
  const [isCapturing, setIsCapturing] = useState(false);
  const [createdUser, setCreatedUser] = useState<any>(null);

  const permission = useCameraPermission();
  const device = useCameraDevice('front');
  const scanning = useSharedValue(false);
  const scanningRef = useRef(false);
  const permissionRequestedRef = useRef(false);

  useEffect(() => {
    if (!permission.hasPermission && !permissionRequestedRef.current) {
      permissionRequestedRef.current = true;
      permission.requestPermission().catch(() => {});
    }
  }, [permission.hasPermission, permission]);

  const isReady = useMemo(() => step !== 'capture' || (!!device && permission.hasPermission), [device, permission.hasPermission, step]);

  const handleInfoSubmit = () => {
    if (!userInfo.name.trim() || !userInfo.email.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setStep('capture');
  };

  const ensurePermission = useCallback(async () => {
    if (permission.hasPermission) return true;
    const granted = await permission.requestPermission();
    return granted;
  }, [permission]);

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

  const resetCaptureState = useCallback(() => {
    scanning.value = false;
    scanningRef.current = false;
    setIsCapturing(false);
  }, [scanning]);

  const completeRegistration = useCallback(async (templateStr: string) => {
    const faceId = 'fid_' + hashTemplateFromString(templateStr);

    const duplicate = (db as any).matchFaceNoLogin?.(templateStr);
    if (duplicate?.success && duplicate.user) {
      Alert.alert('Already Registered', `${duplicate.user.name} is already registered on this device.`);
      setStatusText(INITIAL_STATUS);
      resetCaptureState();
      return;
    }

    try {
      let result: any = { success: false };
      if (remoteApi.enabled) {
        result = await remoteApi.registerUser({ ...userInfo, faceId }, templateStr);
      } else {
        result = await db.registerUser({ ...userInfo, faceId }, templateStr);
      }

      if (result.success) {
        const enrichedUser = { ...result.user, faceId };
        db.saveRemoteUser(enrichedUser, templateStr, faceId);
        setCreatedUser(enrichedUser);
        setStep('success');
      } else if (result.duplicate && result.user) {
        Alert.alert('Already Registered', `${result.user.name} is already registered on this device.`);
        setStatusText(INITIAL_STATUS);
      } else {
        Alert.alert('Registration Failed', result?.error || 'Please try again');
        setStatusText(INITIAL_STATUS);
      }
    } catch (error) {
      Alert.alert('Error', 'Could not capture face');
      setStatusText(INITIAL_STATUS);
    } finally {
      resetCaptureState();
    }
  }, [resetCaptureState, userInfo, router]);

  const handleDetectedFace = useCallback((face: any) => {
    const normalized = normalizeVisionFace(face);
    const templateStr = JSON.stringify(buildTemplateFromFace(normalized));
    completeRegistration(templateStr);
  }, [completeRegistration]);

  const handleFaces = useCallback((faces: any[]) => {
    if (!scanningRef.current) return;
    if (!faces || faces.length === 0) {
      return;
    }
    if (faces.length !== 1) {
      setStatusText(faces.length > 1 ? 'Only one face should be in frame.' : 'Align your face within the frame.');
      return;
    }
    scanning.value = false;
    scanningRef.current = false;
    setStatusText('Processing face...');
    handleDetectedFace(faces[0]);
  }, [handleDetectedFace, scanning]);

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    if (!scanning.value) return;
    const faces = scanFaces(frame);
    if (faces && faces.length > 0) {
      runOnJS(handleFaces)(faces);
    }
  }, [handleFaces]);

  const handleCapture = useCallback(async () => {
    if (isCapturing) return;
    const granted = await ensurePermission();
    if (!granted) {
      Alert.alert('Camera', 'Camera access is required to scan faces.');
      return;
    }
    if (!device) {
      Alert.alert('Camera', 'Camera not ready yet.');
      return;
    }
    setStatusText('Hold still and look straight at the camera.');
    setIsCapturing(true);
    scanningRef.current = true;
    scanning.value = true;
  }, [device, ensurePermission, isCapturing, scanning]);

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
        <Text style={styles.loadingText}>Face registration is available on iOS and Android devices.</Text>
      </View>
    );
  }

  if (!isReady) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading camera...</Text>
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
    if (!permission.hasPermission) {
      return (
        <View style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={goBack}>
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Face Capture</Text>
          </View>
          <View style={styles.permissionContainer}>
            <CameraIcon size={64} color="#3B82F6" />
            <Text style={styles.title}>Camera Access Required</Text>
            <Text style={styles.subtitle}>
              We need camera access to enroll your face for authentication
            </Text>
            <TouchableOpacity style={styles.primaryButton} onPress={permission.requestPermission}>
              <Text style={styles.primaryButtonText}>Grant Camera Access</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={goBack}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Face Capture</Text>
        </View>

        <View style={styles.cameraContainer}>
          <VisionCamera
            style={styles.camera}
            device={device!}
            isActive
            frameProcessor={frameProcessor}
          />
          <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.overlay]}>
            <View style={[styles.faceFrame,
              isCapturing && styles.faceFrameActive,
            ]} />

            <View style={styles.scanningIndicator}>
              <Text style={styles.scanningText}>{isCapturing ? 'Scanning…' : statusText}</Text>
            </View>
          </View>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.primaryButton, isCapturing && styles.primaryButtonDisabled]}
            onPress={handleCapture}
            disabled={isCapturing}
          >
            <Text style={styles.primaryButtonText}>{isCapturing ? 'Scanning…' : 'Scan Face'}</Text>
          </TouchableOpacity>
        </View>
      </View>
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
});
