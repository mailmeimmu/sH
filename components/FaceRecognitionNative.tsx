import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { Camera as CameraIcon, RotateCcw, CircleCheck as CheckCircle } from 'lucide-react-native';

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
  console.warn('[FaceRecognition] Vision Camera not available:', error?.message);
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
  console.warn('[FaceRecognition] Reanimated not available:', error?.message);
  runOnJS = (fn) => fn;
  useSharedValue = (value) => ({ value });
}

import { scanFaces } from '../utils/face-detection';
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

  const permission = useCameraPermission ? useCameraPermission() : { hasPermission: false, requestPermission: () => Promise.resolve(false) };
  const device = useCameraDevice ? useCameraDevice(facing) : null;
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
        console.warn('[FaceRecognition] Permission request failed:', error);
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
      console.warn('[FaceRecognition] Permission error:', error);
      return false;
    }
  }, [permission]);

  const resetScanState = useCallback(() => {
    if (scanning.value !== undefined) {
      scanning.value = false;
    }
    scanningRef.current = false;
    setIsScanning(false);
  }, [scanning]);

  const processMatchResult = useCallback(async (templateStr: string) => {
    try {
      // This will be passed back to parent to handle auth logic
      setScanResult('success');
      setStatusText('Face recognized! Logging in...');
      setTimeout(() => {
        onAuthenticationComplete(true, { template: templateStr });
      }, 1000);
    } catch (error) {
      console.warn('[FaceRecognition] Face match error:', error);
      setScanResult('failed');
      setStatusText('Unable to recognize face. Try again.');
      setTimeout(() => {
        setScanResult(null);
        setStatusText(FACE_STATUS_IDLE);
      }, 2000);
      onAuthenticationComplete(false);
    } finally {
      resetScanState();
    }
  }, [resetScanState, onAuthenticationComplete]);

  const handleDetectedFace = useCallback((face: any) => {
    try {
      const normalized = normalizeVisionFace(face);
      const templateStr = JSON.stringify(buildTemplateFromFace(normalized));
      processMatchResult(templateStr);
    } catch (error) {
      console.warn('[FaceRecognition] Face processing error:', error);
      setScanResult('failed');
      setStatusText('Face processing failed. Try again.');
      setTimeout(() => {
        setScanResult(null);
        setStatusText(FACE_STATUS_IDLE);
      }, 2000);
      resetScanState();
    }
  }, [processMatchResult, resetScanState]);

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
      console.warn('[FaceRecognition] Face handling error:', error);
      resetScanState();
      setStatusText('Face detection error. Try again.');
    }
  }, [handleDetectedFace, scanning, resetScanState]);

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
      console.warn('[FaceRecognition] Frame processor error:', error);
    }
  }, [handleFaces]) : undefined;

  const attemptMatch = useCallback(async () => {
    if (isScanning) {
      console.log('[FaceRecognition] Already scanning, ignoring request');
      return;
    }

    try {
      const granted = await ensurePermission();
      if (!granted) {
        Alert.alert('Camera Permission', 'Camera access is required for face recognition. Please grant permission in settings.');
        return;
      }

      if (!device) {
        Alert.alert('Camera Error', 'Camera is not ready. Please try again.');
        return;
      }

      setRecognizedUser(null);
      setScanResult(null);
      setStatusText('Hold still and look at the camera.');
      setIsScanning(true);
      scanningRef.current = true;
      
      if (scanning.value !== undefined) {
        scanning.value = true;
      }

      // Auto-timeout after 10 seconds
      setTimeout(() => {
        if (scanningRef.current) {
          console.log('[FaceRecognition] Scan timeout');
          resetScanState();
          setStatusText('Scan timeout. Try again.');
          setTimeout(() => setStatusText(FACE_STATUS_IDLE), 2000);
        }
      }, 10000);
    } catch (error) {
      console.error('[FaceRecognition] Scan attempt failed:', error);
      Alert.alert('Scan Error', 'Failed to start face scan. Please try again.');
      resetScanState();
    }
  }, [device, ensurePermission, isScanning, scanning, resetScanState]);

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
          <Text style={styles.title}>Face Recognition</Text>
        </View>
        <View style={styles.permissionContainer}>
          <CameraIcon size={64} color="#3B82F6" />
          <Text style={styles.title}>Camera Access Required</Text>
          <Text style={styles.subtitle}>
            We need camera access for face recognition authentication
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
          <Text style={styles.title}>Face Recognition</Text>
        </View>
        <View style={styles.permissionContainer}>
          <Text style={styles.loadingText}>Loading camera...</Text>
        </View>
      </View>
    );
  }

  const toggleCameraFacing = () => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onGoBack}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Face Recognition</Text>
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
            isScanning && styles.faceFrameScanning,
            scanResult === 'success' && styles.faceFrameSuccess,
            scanResult === 'failed' && styles.faceFrameFailed
          ]} />

          <View style={styles.scanningIndicator}>
            <Text style={styles.scanningText}>{statusText}</Text>
          </View>

          {scanResult === 'success' && (
            <View style={styles.successIndicator}>
              <CheckCircle size={32} color="#10B981" />
              <Text style={styles.successText}>Welcome back!</Text>
              {recognizedUser && (
                <Text style={styles.userNameText}>{recognizedUser.name}</Text>
              )}
            </View>
          )}

          {scanResult === 'failed' && (
            <View style={styles.failedIndicator}>
              <Text style={styles.failedText}>Face not recognized</Text>
              <Text style={styles.failedSubtext}>Please try again or use another login method.</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.scanButton, isScanning && styles.scanButtonDisabled]}
          onPress={attemptMatch}
          disabled={isScanning}
        >
          <Text style={styles.scanButtonText}>{isScanning ? 'Scanning…' : 'Scan Face'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.rotateButton} onPress={toggleCameraFacing}>
          <RotateCcw size={20} color="#E5E7EB" />
          <Text style={styles.rotateButtonText}>Switch Camera</Text>
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
  faceFrameScanning: {
    borderColor: '#3B82F6',
  },
  faceFrameSuccess: {
    borderColor: '#10B981',
  },
  faceFrameFailed: {
    borderColor: '#EF4444',
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
  userNameText: {
    color: '#34D399',
    fontSize: 14,
    marginTop: 2,
  },
  failedIndicator: {
    position: 'absolute',
    top: 32,
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
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
  },
  controls: {
    marginTop: 16,
    gap: 12,
  },
  scanButton: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#2563EB',
  },
  scanButtonDisabled: {
    backgroundColor: 'rgba(37, 99, 235, 0.5)',
  },
  scanButtonText: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '600',
  },
  rotateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
  },
  rotateButtonText: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '600',
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
  subtitle: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  loadingText: {
    color: '#E5E7EB',
    fontSize: 16,
    textAlign: 'center',
  },
});