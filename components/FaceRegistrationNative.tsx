import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { Camera as CameraIcon, CircleCheck as CheckCircle } from 'lucide-react-native';

// Safe imports with error handling
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

import { scanFaces } from '../utils/face-detection';
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
  const permissionRequestedRef = useRef(false);

  const isReady = useMemo(() => {
    if (!VisionCamera) return false;
    return !!device && permission.hasPermission;
  }, [device, permission.hasPermission]);

  useEffect(() => {
    if (!VisionCamera) {
      setCameraError('Camera not available on this device');
      return;
    }

    if (!permission.hasPermission && !permissionRequestedRef.current) {
      permissionRequestedRef.current = true;
      permission.requestPermission().catch((error) => {
        console.warn('[FaceRegistration] Permission request failed:', error);
        setCameraError('Camera permission required');
      });
    }
  }, [permission.hasPermission, permission]);

  const ensurePermission = useCallback(async () => {
    if (permission.hasPermission) return true;
    try {
      const granted = await permission.requestPermission();
      return granted;
    } catch (error) {
      console.warn('[FaceRegistration] Permission error:', error);
      return false;
    }
  }, [permission]);

  const resetCaptureState = useCallback(() => {
    if (scanning.value !== undefined) {
      scanning.value = false;
    }
    scanningRef.current = false;
    setIsCapturing(false);
  }, [scanning]);

  const completeRegistration = useCallback(async (templateStr: string) => {
    try {
      setCaptureSuccess(true);
      setStatusText('Face captured successfully! Completing registration...');
      
      setTimeout(() => {
        onRegistrationComplete(templateStr);
      }, 1500);
    } catch (error) {
      console.error('[FaceRegistration] Registration completion error:', error);
      Alert.alert('Error', 'Could not complete face registration');
      setStatusText(INITIAL_STATUS);
      setCaptureSuccess(false);
    } finally {
      resetCaptureState();
    }
  }, [resetCaptureState, onRegistrationComplete]);

  const handleDetectedFace = useCallback((face: any) => {
    try {
      const normalized = normalizeVisionFace(face);
      const templateStr = JSON.stringify(buildTemplateFromFace(normalized));
      completeRegistration(templateStr);
    } catch (error) {
      console.warn('[FaceRegistration] Face processing error:', error);
      setStatusText('Face processing failed. Try again.');
      setTimeout(() => setStatusText(INITIAL_STATUS), 2000);
      resetCaptureState();
    }
  }, [completeRegistration, resetCaptureState]);

  const handleFaces = useCallback((faces: any[]) => {
    if (!scanningRef.current) return;
    
    try {
      if (!faces || faces.length === 0) {
        setStatusText('Position your face in the frame');
        return;
      }
      
      if (faces.length !== 1) {
        setStatusText(faces.length > 1 ? 'Only one face should be in frame.' : 'Align your face within the frame.');
        return;
      }
      
      if (scanning.value !== undefined) {
        scanning.value = false;
      }
      scanningRef.current = false;
      setStatusText('Processing face...');
      
      if (faces[0]) {
        handleDetectedFace(faces[0]);
      }
    } catch (error) {
      console.warn('[FaceRegistration] Face handling error:', error);
      resetCaptureState();
      setStatusText('Face detection error. Try again.');
    }
  }, [handleDetectedFace, scanning, resetCaptureState]);

  const frameProcessor = useFrameProcessor ? useFrameProcessor((frame) => {
    'worklet';
    
    try {
      if (!scanning.value) return;
      
      const faces = scanFaces(frame);
      if (faces && faces.length > 0) {
        if (runOnJS) {
          runOnJS(handleFaces)(faces);
        } else {
          handleFaces(faces);
        }
      }
    } catch (error) {
      console.warn('[FaceRegistration] Frame processor error:', error);
    }
  }, [handleFaces]) : undefined;

  const handleCapture = useCallback(async () => {
    if (isCapturing || captureSuccess) {
      console.log('[FaceRegistration] Already capturing or completed');
      return;
    }

    try {
      const granted = await ensurePermission();
      if (!granted) {
        Alert.alert('Camera Permission', 'Camera access is required to register your face. Please grant permission in settings.');
        return;
      }

      if (!device) {
        Alert.alert('Camera Error', 'Camera is not ready. Please try again.');
        return;
      }

      setStatusText('Hold still and look straight at the camera.');
      setIsCapturing(true);
      scanningRef.current = true;
      
      if (scanning.value !== undefined) {
        scanning.value = true;
      }

      // Auto-timeout after 10 seconds
      setTimeout(() => {
        if (scanningRef.current) {
          console.log('[FaceRegistration] Capture timeout');
          resetCaptureState();
          setStatusText('Capture timeout. Try again.');
          setTimeout(() => setStatusText(INITIAL_STATUS), 2000);
        }
      }, 10000);
    } catch (error) {
      console.error('[FaceRegistration] Capture failed:', error);
      Alert.alert('Capture Error', 'Failed to start face capture. Please try again.');
      resetCaptureState();
    }
  }, [device, ensurePermission, isCapturing, captureSuccess, scanning, resetCaptureState]);

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
          <Text style={styles.title}>Camera Not Available</Text>
          <Text style={styles.subtitle}>{cameraError}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={onGoBack}>
            <Text style={styles.primaryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!permission.hasPermission) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onGoBack}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Face Registration</Text>
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

  if (!isReady) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onGoBack}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Face Registration</Text>
        </View>
        <View style={styles.permissionContainer}>
          <Text style={styles.loadingText}>Loading camera...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onGoBack}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Face Registration</Text>
      </View>

      <View style={styles.cameraContainer}>
        {VisionCamera && device && frameProcessor ? (
          <VisionCamera
            style={styles.camera}
            device={device}
            isActive
            frameProcessor={frameProcessor}
          />
        ) : (
          <View style={styles.mockCamera}>
            <Text style={styles.mockText}>Camera Preview</Text>
          </View>
        )}
        
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.overlay]}>
          <View style={[styles.faceFrame,
            isCapturing && styles.faceFrameActive,
            captureSuccess && styles.faceFrameSuccess,
          ]} />

          <View style={styles.scanningIndicator}>
            <Text style={styles.scanningText}>{statusText}</Text>
          </View>

          {captureSuccess && (
            <View style={styles.successIndicator}>
              <CheckCircle size={32} color="#10B981" />
              <Text style={styles.successText}>Face captured!</Text>
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
            {captureSuccess ? 'Captured!' : isCapturing ? 'Scanning…' : 'Scan Face'}
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
  mockCamera: {
    flex: 1,
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mockText: {
    color: '#9CA3AF',
    fontSize: 16,
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
  faceFrameSuccess: {
    borderColor: '#10B981',
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
  successIndicator: {
    position: 'absolute',
    top: 32,
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  successText: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
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
  subtitle: {
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