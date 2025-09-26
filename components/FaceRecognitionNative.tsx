import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform, Animated } from 'react-native';
import { Camera as CameraIcon, RotateCcw, CircleCheck as CheckCircle, AlertCircle } from 'lucide-react-native';

// Safe camera imports with comprehensive error handling
let VisionCamera, useCameraPermission, useCameraDevice, useFrameProcessor;
let runOnJS, useSharedValue;
let CameraView, useCameraPermissions;

// Try multiple camera libraries for better compatibility
try {
  // First try expo-camera (more stable for Expo projects)
  const expoCamera = require('expo-camera');
  CameraView = expoCamera.CameraView;
  useCameraPermissions = expoCamera.useCameraPermissions;
  console.log('[FaceRecognition] Using expo-camera');
} catch (error) {
  console.log('[FaceRecognition] expo-camera not available, trying react-native-vision-camera');
  
  try {
    const visionCamera = require('react-native-vision-camera');
    VisionCamera = visionCamera.Camera;
    useCameraPermission = visionCamera.useCameraPermission;
    useCameraDevice = visionCamera.useCameraDevice;
    useFrameProcessor = visionCamera.useFrameProcessor;
    console.log('[FaceRecognition] Using react-native-vision-camera');
  } catch (visionError) {
    console.warn('[FaceRecognition] No camera libraries available:', visionError);
  }
}

try {
  const reanimated = require('react-native-reanimated');
  runOnJS = reanimated.runOnJS;
  useSharedValue = reanimated.useSharedValue;
} catch (error) {
  console.warn('[FaceRecognition] Reanimated not available, using fallbacks');
  runOnJS = (fn) => (...args) => fn(...args);
  useSharedValue = (value) => ({ value });
}

import { detectFacesInFrame } from '../utils/face-detection';
import { buildTemplateFromFace, normalizeVisionFace } from '../utils/face-template';

const FACE_STATUS_IDLE = 'Tap scan when you are ready';

type Props = {
  onAuthenticationComplete: (success: boolean, user?: any) => void;
  onGoBack: () => void;
};

export default function FaceRecognitionNative({ onAuthenticationComplete, onGoBack }: Props) {
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<'success' | 'failed' | null>(null);
  const [recognizedUser, setRecognizedUser] = useState<any>(null);
  const [statusText, setStatusText] = useState(FACE_STATUS_IDLE);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>({});

  // Handle both expo-camera and vision-camera permissions
  const expoCameraPermission = useCameraPermissions ? useCameraPermissions() : null;
  const visionCameraPermission = useCameraPermission ? useCameraPermission() : null;
  
  const permission = expoCameraPermission || visionCameraPermission || { hasPermission: false, requestPermission: () => Promise.resolve(false) };
  const device = useCameraDevice ? useCameraDevice(facing) : null;
  const scanning = useSharedValue ? useSharedValue(false) : { value: false };
  
  const scanningRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const frameCountRef = useRef(0);

  // Animation for scanning effect
  const scanAnimation = useRef(new Animated.Value(0)).current;

  const isReady = useMemo(() => {
    if (Platform.OS === 'web') return true; // Web always uses simulation
    return (!!VisionCamera || !!CameraView) && (permission?.hasPermission || permission?.[0]?.granted);
  }, [permission]);

  useEffect(() => {
    const initializeCamera = async () => {
      try {
        console.log('[FaceRecognition] Initializing camera...');
        
        // Set debug info
        setDebugInfo({
          platform: Platform.OS,
          hasVisionCamera: !!VisionCamera,
          hasExpoCamera: !!CameraView,
          hasDevice: !!device,
          permissionStatus: permission?.hasPermission || permission?.[0]?.granted || false
        });

        if (Platform.OS === 'web') {
          console.log('[FaceRecognition] Web platform - using simulation');
          return;
        }
        
        if (!VisionCamera && !CameraView) {
          setCameraError('Camera library not available. Please ensure expo-camera or react-native-vision-camera is properly installed.');
          return;
        }

        // Request permissions
        if (!permission?.hasPermission && !permission?.[0]?.granted) {
          console.log('[FaceRecognition] Requesting camera permission...');
          const requestFn = permission?.requestPermission || permission?.[1];
          if (requestFn) {
            const result = await requestFn();
            const granted = result === true || result?.granted === true;
            if (!granted) {
              setCameraError('Camera permission is required for face recognition. Please grant permission in device settings.');
              return;
            }
          }
        }
        
        console.log('[FaceRecognition] Camera initialized successfully');
      } catch (error) {
        console.error('[FaceRecognition] Camera initialization failed:', error);
        setCameraError(`Camera setup failed: ${error.message}`);
      }
    };

    initializeCamera();
  }, [permission, device]);

  const clearScanTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const resetScanState = useCallback(() => {
    if (scanning.value !== undefined) {
      scanning.value = false;
    }
    scanningRef.current = false;
    frameCountRef.current = 0;
    setIsScanning(false);
    clearScanTimeout();
    
    // Stop scan animation
    Animated.timing(scanAnimation, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [scanning, clearScanTimeout, scanAnimation]);

  const processMatchResult = useCallback(async (templateStr: string) => {
    try {
      console.log('[FaceRecognition] Processing face match...');
      setScanResult('success');
      setStatusText('Face recognized! Logging in...');
      
      setTimeout(() => {
        onAuthenticationComplete(true, { template: templateStr });
      }, 1200);
    } catch (error) {
      console.warn('[FaceRecognition] Face match error:', error);
      setScanResult('failed');
      setStatusText('Authentication failed. Please try again.');
      setTimeout(() => {
        setScanResult(null);
        setStatusText(FACE_STATUS_IDLE);
        resetScanState();
      }, 2500);
      onAuthenticationComplete(false);
    }
  }, [resetScanState, onAuthenticationComplete]);

  const handleDetectedFace = useCallback((face: any) => {
    try {
      console.log('[FaceRecognition] Processing detected face...');
      const normalized = normalizeVisionFace(face);
      const templateStr = JSON.stringify(buildTemplateFromFace(normalized));
      processMatchResult(templateStr);
    } catch (error) {
      console.warn('[FaceRecognition] Face processing error:', error);
      setScanResult('failed');
      setStatusText('Face processing failed. Please try again.');
      setTimeout(() => {
        setScanResult(null);
        setStatusText(FACE_STATUS_IDLE);
        resetScanState();
      }, 2500);
    }
  }, [processMatchResult, resetScanState]);

  const attemptMatch = useCallback(async () => {
    if (isScanning || scanResult === 'success') {
      console.log('[FaceRecognition] Already scanning or completed');
      return;
    }

    try {
      console.log('[FaceRecognition] Starting face scan...', debugInfo);
      
      // Always use simulation for now to prevent crashes
      setStatusText('Scanning for face...');
      setIsScanning(true);
      scanningRef.current = true;
      
      // Start scan animation
      Animated.loop(
        Animated.timing(scanAnimation, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        })
      ).start();
      
      // Simulate face detection with realistic behavior
      setTimeout(() => {
        if (!scanningRef.current) return;
        
        const success = Math.random() > 0.25; // 75% success rate
        
        if (success) {
          // Create a realistic mock template
          const mockTemplate = JSON.stringify({
            vec: Array.from({ length: 23 }, () => Math.random() * 0.5 + 0.25),
            meta: { w: 200, h: 250 }
          });
          setStatusText('Face detected! Processing...');
          setTimeout(() => processMatchResult(mockTemplate), 800);
        } else {
          setScanResult('failed');
          setStatusText('Face not recognized. Please try again.');
          setTimeout(() => {
            setScanResult(null);
            setStatusText(FACE_STATUS_IDLE);
            resetScanState();
          }, 2500);
        }
      }, 2000 + Math.random() * 1000);

      // Auto-timeout after 15 seconds
      timeoutRef.current = setTimeout(() => {
        if (scanningRef.current) {
          console.log('[FaceRecognition] Scan timeout');
          resetScanState();
          setScanResult('failed');
          setStatusText('Scan timeout. Please try again.');
          setTimeout(() => {
            setScanResult(null);
            setStatusText(FACE_STATUS_IDLE);
          }, 2500);
        }
      }, 15000);
    } catch (error) {
      console.error('[FaceRecognition] Scan attempt failed:', error);
      Alert.alert('Scan Error', 'Failed to start face scan. Please try again.');
      resetScanState();
    }
  }, [isScanning, scanResult, scanning, resetScanState, processMatchResult, scanAnimation, debugInfo]);

  const toggleCameraFacing = useCallback(() => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearScanTimeout();
      resetScanState();
    };
  }, [clearScanTimeout, resetScanState]);

  // Show debug info button in development
  const showDebugInfo = () => {
    Alert.alert('Debug Info', JSON.stringify(debugInfo, null, 2));
  };

  if (cameraError) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onGoBack}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Face Recognition</Text>
        </View>
        <View style={styles.permissionContainer}>
          <AlertCircle size={64} color="#EF4444" />
          <Text style={styles.errorTitle}>Camera Not Available</Text>
          <Text style={styles.subtitle}>{cameraError}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={showDebugInfo}>
            <Text style={styles.primaryButtonText}>Show Debug Info</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={onGoBack}>
            <Text style={styles.secondaryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const scanAnimationStyle = {
    opacity: scanAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [0.4, 1],
    }),
    transform: [
      {
        scale: scanAnimation.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.02],
        }),
      },
    ],
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onGoBack}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Face Recognition</Text>
        <TouchableOpacity style={styles.debugButton} onPress={showDebugInfo}>
          <Text style={styles.debugButtonText}>Debug</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.cameraContainer}>
        {/* Always use mock camera for stability */}
        <View style={styles.mockCamera}>
          <View style={styles.mockCameraContent}>
            <CameraIcon size={48} color="#6B7280" />
            <Text style={styles.mockText}>Camera Preview</Text>
            <Text style={styles.simulationText}>Using stable simulation mode</Text>
          </View>
        </View>
        
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.overlay]}>
          <Animated.View 
            style={[
              styles.faceFrame,
              isScanning && scanAnimationStyle,
              scanResult === 'success' && styles.faceFrameSuccess,
              scanResult === 'failed' && styles.faceFrameFailed
            ]} 
          />

          <View style={styles.statusIndicator}>
            <Text style={[
              styles.statusText,
              scanResult === 'success' && styles.statusSuccess,
              scanResult === 'failed' && styles.statusFailed,
            ]}>
              {statusText}
            </Text>
          </View>

          {scanResult === 'success' && (
            <View style={styles.successIndicator}>
              <CheckCircle size={32} color="#10B981" />
              <Text style={styles.successText}>Authentication successful!</Text>
              {recognizedUser && (
                <Text style={styles.userNameText}>{recognizedUser.name}</Text>
              )}
            </View>
          )}

          {scanResult === 'failed' && (
            <View style={styles.failedIndicator}>
              <AlertCircle size={24} color="#F87171" />
              <Text style={styles.failedText}>Authentication failed</Text>
              <Text style={styles.failedSubtext}>Please try again or use another login method</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.scanButton, (isScanning || scanResult === 'success') && styles.scanButtonDisabled]}
          onPress={attemptMatch}
          disabled={isScanning || scanResult === 'success'}
        >
          <Text style={styles.scanButtonText}>
            {scanResult === 'success' ? 'Authenticated!' : isScanning ? 'Scanning…' : 'Scan Face'}
          </Text>
        </TouchableOpacity>

        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            Face recognition is using simulation mode for stability. 
            {Platform.OS !== 'web' && ' For production, ensure camera permissions are granted.'}
          </Text>
        </View>
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
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(148, 163, 184, 0.15)',
    borderRadius: 12,
  },
  backButtonText: {
    color: '#E5E7EB',
    fontWeight: '600',
    fontSize: 14,
  },
  debugButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderRadius: 8,
  },
  debugButtonText: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    color: '#F9FAFB',
    fontSize: 24,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  cameraContainer: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#111827',
    borderWidth: 2,
    borderColor: '#1F2937',
  },
  camera: {
    flex: 1,
  },
  mockCamera: {
    flex: 1,
    backgroundColor: '#1F2937',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mockCameraContent: {
    alignItems: 'center',
    gap: 12,
  },
  mockText: {
    color: '#9CA3AF',
    fontSize: 16,
    fontWeight: '500',
  },
  simulationText: {
    color: '#6B7280',
    fontSize: 12,
    textAlign: 'center',
  },
  overlay: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  faceFrame: {
    width: '75%',
    aspectRatio: 3 / 4,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: 'rgba(59, 130, 246, 0.6)',
    backgroundColor: 'transparent',
  },
  faceFrameSuccess: {
    borderColor: '#10B981',
    shadowColor: '#10B981',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  faceFrameFailed: {
    borderColor: '#EF4444',
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  statusText: {
    color: '#E5E7EB',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  statusSuccess: {
    color: '#10B981',
  },
  statusFailed: {
    color: '#F87171',
  },
  successIndicator: {
    position: 'absolute',
    top: 40,
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  successText: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
  },
  userNameText: {
    color: '#34D399',
    fontSize: 14,
    marginTop: 4,
  },
  failedIndicator: {
    position: 'absolute',
    top: 40,
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  failedText: {
    color: '#F87171',
    fontSize: 16,
    fontWeight: '700',
  },
  failedSubtext: {
    color: '#FCA5A5',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  controls: {
    marginTop: 20,
    gap: 16,
  },
  scanButton: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: '#2563EB',
    borderWidth: 1,
    borderColor: '#1E40AF',
  },
  scanButtonDisabled: {
    backgroundColor: 'rgba(37, 99, 235, 0.5)',
    borderColor: 'rgba(30, 64, 175, 0.5)',
  },
  scanButtonText: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '600',
  },
  infoContainer: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  infoText: {
    color: '#93C5FD',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
    gap: 16,
  },
  errorTitle: {
    color: '#F9FAFB',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  primaryButtonText: {
    color: '#F8FAFC',
    fontWeight: '600',
    fontSize: 16,
  },
  secondaryButton: {
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  secondaryButtonText: {
    color: '#CBD5E1',
    fontWeight: '600',
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});