import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform, Animated } from 'react-native';
import { Camera as CameraIcon, CircleCheck as CheckCircle } from 'lucide-react-native';

// Safe imports with comprehensive error handling
let VisionCamera, useCameraPermission, useCameraDevice, useFrameProcessor;
let runOnJS, useSharedValue;

try {
  const visionCamera = require('react-native-vision-camera');
  VisionCamera = visionCamera.Camera;
  useCameraPermission = visionCamera.useCameraPermission;
  useCameraDevice = visionCamera.useCameraDevice;
  useFrameProcessor = visionCamera.useFrameProcessor;
} catch (error) {
  console.warn('[FaceRegistration] Vision Camera not available:', error?.message);
  VisionCamera = null;
  useCameraPermission = () => ({ hasPermission: false, requestPermission: () => Promise.resolve(false) });
  useCameraDevice = () => null;
  useFrameProcessor = () => null;
}

try {
  const reanimated = require('react-native-reanimated');
  runOnJS = reanimated.runOnJS;
  useSharedValue = reanimated.useSharedValue;
} catch (error) {
  console.warn('[FaceRegistration] Reanimated not available:', error?.message);
  runOnJS = (fn) => fn;
  useSharedValue = (value) => ({ value });
}

import { detectFacesInFrame } from '../utils/face-detection';
import { buildTemplateFromFace, normalizeVisionFace } from '../utils/face-template';

const INITIAL_STATUS = 'Press scan when you are ready';

type Props = {
  userInfo: { name: string; email: string };
  onRegistrationComplete: (template: string) => void;
  onGoBack: () => void;
};

export default function FaceRegistrationNative({ userInfo, onRegistrationComplete, onGoBack }: Props) {
  const [statusText, setStatusText] = useState(INITIAL_STATUS);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureSuccess, setCaptureSuccess] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const permission = useCameraPermission ? useCameraPermission() : { hasPermission: false, requestPermission: () => Promise.resolve(false) };
  const device = useCameraDevice ? useCameraDevice('front') : null;
  const scanning = useSharedValue ? useSharedValue(false) : { value: false };
  const scanningRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const frameCountRef = useRef(0);

  // Animation for capture effect
  const captureAnimation = useRef(new Animated.Value(0)).current;

  const isReady = useMemo(() => {
    if (Platform.OS === 'web') return true; // Web always uses simulation
    if (!VisionCamera) return false;
    return !!device && permission.hasPermission;
  }, [device, permission.hasPermission]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    
    if (!VisionCamera) {
      setCameraError('Camera functionality requires a development build. Please export your project and test on a device.');
      return;
    }

    if (!permission.hasPermission) {
      permission.requestPermission().catch((error) => {
        console.warn('[FaceRegistration] Permission request failed:', error);
        setCameraError('Camera permission required for face registration');
      });
    }
  }, [permission]);

  const clearCaptureTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const resetCaptureState = useCallback(() => {
    if (scanning.value !== undefined) {
      scanning.value = false;
    }
    scanningRef.current = false;
    frameCountRef.current = 0;
    setIsCapturing(false);
    clearCaptureTimeout();
    
    // Reset capture animation
    Animated.timing(captureAnimation, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [scanning, clearCaptureTimeout, captureAnimation]);

  const completeRegistration = useCallback(async (templateStr: string) => {
    try {
      console.log('[FaceRegistration] Completing registration...');
      setCaptureSuccess(true);
      setStatusText('Face captured successfully!');
      
      // Flash effect
      Animated.sequence([
        Animated.timing(captureAnimation, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(captureAnimation, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        })
      ]).start();
      
      setTimeout(() => {
        onRegistrationComplete(templateStr);
      }, 1500);
    } catch (error) {
      console.error('[FaceRegistration] Registration completion error:', error);
      Alert.alert('Error', 'Could not complete face registration');
      setStatusText(INITIAL_STATUS);
      setCaptureSuccess(false);
      resetCaptureState();
    }
  }, [resetCaptureState, onRegistrationComplete, captureAnimation]);

  const handleDetectedFace = useCallback((face: any) => {
    try {
      console.log('[FaceRegistration] Processing detected face...');
      const normalized = normalizeVisionFace(face);
      const templateStr = JSON.stringify(buildTemplateFromFace(normalized));
      completeRegistration(templateStr);
    } catch (error) {
      console.warn('[FaceRegistration] Face processing error:', error);
      setStatusText('Face processing failed. Please try again.');
      setTimeout(() => {
        setStatusText(INITIAL_STATUS);
        resetCaptureState();
      }, 2500);
    }
  }, [completeRegistration, resetCaptureState]);

  const handleFaces = useCallback((faces: any[]) => {
    if (!scanningRef.current) return;
    
    try {
      frameCountRef.current += 1;
      
      if (!faces || faces.length === 0) {
        if (frameCountRef.current > 5) { // Give user feedback after a few frames
          setStatusText('Position your face in the frame');
        }
        return;
      }
      
      if (faces.length > 1) {
        setStatusText('Multiple faces detected. Please ensure only one person is in frame.');
        return;
      }
      
      // Face detected successfully
      if (scanning.value !== undefined) {
        scanning.value = false;
      }
      scanningRef.current = false;
      setStatusText('Face detected! Capturing...');
      
      // Add small delay for better UX
      setTimeout(() => {
        if (faces[0]) {
          handleDetectedFace(faces[0]);
        }
      }, 500);
    } catch (error) {
      console.warn('[FaceRegistration] Face handling error:', error);
      resetCaptureState();
      setStatusText('Face detection error. Please try again.');
    }
  }, [handleDetectedFace, scanning, resetCaptureState]);

  const frameProcessor = useFrameProcessor ? useFrameProcessor((frame) => {
    'worklet';
    
    try {
      if (!scanning.value) return;
      
      // Use our reliable face detection
      const faces = detectFacesInFrame(frame);
      
      if (faces && faces.length >= 0) {
        if (runOnJS) {
          runOnJS(handleFaces)(faces);
        } else {
          handleFaces(faces);
        }
      }
    } catch (error) {
      console.warn('[FaceRegistration] Frame processor error:', error);
    }
  }, [handleFaces]) : null;

  const handleCapture = useCallback(async () => {
    if (isCapturing || captureSuccess) {
      console.log('[FaceRegistration] Already capturing or completed');
      return;
    }

    try {
      // For web or when camera isn't available, simulate the process
      if (Platform.OS === 'web' || !VisionCamera || !device) {
        console.log('[FaceRegistration] Using simulation mode');
        setStatusText('Simulating face capture...');
        setIsCapturing(true);
        
        // Start capture animation
        Animated.loop(
          Animated.timing(captureAnimation, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          })
        ).start();
        
        setTimeout(() => {
          // Create a mock template for simulation
          const mockTemplate = JSON.stringify({
            vec: Array.from({ length: 23 }, () => Math.random()),
            meta: { w: 200, h: 250 }
          });
          completeRegistration(mockTemplate);
        }, 2500);
        return;
      }

      // Check camera permission for native platforms
      if (!permission.hasPermission) {
        const granted = await permission.requestPermission();
        if (!granted) {
          Alert.alert('Camera Permission', 'Camera access is required to register your face. Please grant permission in device settings.');
          return;
        }
      }

      console.log('[FaceRegistration] Starting native face capture');
      setStatusText('Hold still and look straight at the camera...');
      setIsCapturing(true);
      scanningRef.current = true;
      frameCountRef.current = 0;
      
      if (scanning.value !== undefined) {
        scanning.value = true;
      }

      // Start capture animation
      Animated.loop(
        Animated.timing(captureAnimation, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        })
      ).start();

      // Auto-timeout after 12 seconds
      timeoutRef.current = setTimeout(() => {
        if (scanningRef.current) {
          console.log('[FaceRegistration] Capture timeout');
          resetCaptureState();
          setStatusText('Capture timeout. Please try again.');
          setTimeout(() => setStatusText(INITIAL_STATUS), 2500);
        }
      }, 12000);
    } catch (error) {
      console.error('[FaceRegistration] Capture failed:', error);
      Alert.alert('Capture Error', 'Failed to start face capture. Please try again.');
      resetCaptureState();
    }
  }, [device, permission, isCapturing, captureSuccess, scanning, resetCaptureState, completeRegistration, captureAnimation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearCaptureTimeout();
      resetCaptureState();
    };
  }, [clearCaptureTimeout, resetCaptureState]);

  if (cameraError) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onGoBack}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Face Registration</Text>
        </View>
        <View style={styles.permissionContainer}>
          <CameraIcon size={64} color="#EF4444" />
          <Text style={styles.errorTitle}>Camera Not Available</Text>
          <Text style={styles.subtitle}>{cameraError}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={onGoBack}>
            <Text style={styles.primaryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const captureAnimationStyle = {
    opacity: captureAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [0.3, 1],
    }),
    transform: [
      {
        scale: captureAnimation.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.05],
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
        <Text style={styles.title}>Face Registration</Text>
      </View>

      <View style={styles.cameraContainer}>
        {isReady && VisionCamera && device && frameProcessor && Platform.OS !== 'web' ? (
          <VisionCamera
            style={styles.camera}
            device={device}
            isActive
            frameProcessor={frameProcessor}
          />
        ) : (
          <View style={styles.mockCamera}>
            <View style={styles.mockCameraContent}>
              <CameraIcon size={48} color="#6B7280" />
              <Text style={styles.mockText}>Camera Preview</Text>
              <Text style={styles.userInfo}>Registering: {userInfo.name}</Text>
              {Platform.OS === 'web' && (
                <Text style={styles.simulationText}>Using simulation mode</Text>
              )}
            </View>
          </View>
        )}
        
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.overlay]}>
          <Animated.View 
            style={[
              styles.faceFrame,
              isCapturing && captureAnimationStyle,
              captureSuccess && styles.faceFrameSuccess,
            ]} 
          />

          <View style={styles.statusIndicator}>
            <Text style={[
              styles.statusText,
              captureSuccess && styles.statusSuccess,
            ]}>
              {statusText}
            </Text>
          </View>

          {captureSuccess && (
            <View style={styles.successIndicator}>
              <CheckCircle size={32} color="#10B981" />
              <Text style={styles.successText}>Face captured successfully!</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.primaryButton, (isCapturing || captureSuccess) && styles.primaryButtonDisabled]}
          onPress={handleCapture}
          disabled={isCapturing || captureSuccess}
        >
          <Text style={styles.primaryButtonText}>
            {captureSuccess ? 'Captured!' : isCapturing ? 'Capturing…' : 'Scan Face'}
          </Text>
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
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(148, 163, 184, 0.15)',
    borderRadius: 12,
    marginRight: 12,
  },
  backButtonText: {
    color: '#E5E7EB',
    fontWeight: '600',
    fontSize: 14,
  },
  title: {
    color: '#F9FAFB',
    fontSize: 24,
    fontWeight: '700',
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
  userInfo: {
    color: '#60A5FA',
    fontSize: 14,
    fontWeight: '600',
  },
  simulationText: {
    color: '#6B7280',
    fontSize: 12,
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
  statusIndicator: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
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
  controls: {
    marginTop: 20,
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
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E40AF',
  },
  primaryButtonDisabled: {
    backgroundColor: 'rgba(37, 99, 235, 0.5)',
    borderColor: 'rgba(30, 64, 175, 0.5)',
  },
  primaryButtonText: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '600',
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});