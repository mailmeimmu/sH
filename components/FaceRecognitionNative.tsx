import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import {
  Camera as VisionCamera,
  useCameraPermission,
  useCameraDevice,
  useFrameProcessor,
} from 'react-native-vision-camera';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import { scanFaces } from '../utils/face-detection';
import { Camera as CameraIcon, RotateCcw, CircleCheck as CheckCircle } from 'lucide-react-native';
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

  const permission = useCameraPermission();
  const device = useCameraDevice(facing);
  const scanning = useSharedValue(false);
  const scanningRef = useRef(false);
  const permissionRequestedRef = useRef(false);

  const isReady = useMemo(() => !!device && permission.hasPermission, [device, permission.hasPermission]);

  useEffect(() => {
    if (!permission.hasPermission && !permissionRequestedRef.current) {
      permissionRequestedRef.current = true;
      permission.requestPermission().catch(() => {});
    }
  }, [permission.hasPermission, permission]);

  const ensurePermission = useCallback(async () => {
    if (permission.hasPermission) return true;
    const granted = await permission.requestPermission();
    return granted;
  }, [permission]);

  const resetScanState = useCallback(() => {
    scanning.value = false;
    scanningRef.current = false;
    setIsScanning(false);
  }, [scanning]);

  const processMatchResult = useCallback(async (templateStr: string) => {
    try {
      // This will be passed back to parent to handle auth logic
      onAuthenticationComplete(true, { template: templateStr });
    } catch (error) {
      console.log('Face match error', error);
      setScanResult('failed');
      setStatusText('Unable to scan. Try again.');
      setTimeout(() => setStatusText(FACE_STATUS_IDLE), 1500);
      onAuthenticationComplete(false);
    } finally {
      resetScanState();
    }
  }, [resetScanState, onAuthenticationComplete]);

  const handleDetectedFace = useCallback((face: any) => {
    const normalized = normalizeVisionFace(face);
    const templateStr = JSON.stringify(buildTemplateFromFace(normalized));
    processMatchResult(templateStr);
  }, [processMatchResult]);

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

  const attemptMatch = useCallback(async () => {
    if (isScanning) return;
    const granted = await ensurePermission();
    if (!granted) {
      Alert.alert('Camera', 'Camera access is required for face recognition.');
      return;
    }
    if (!device) {
      Alert.alert('Camera', 'Camera not ready yet.');
      return;
    }
    setRecognizedUser(null);
    setScanResult(null);
    setStatusText('Hold still and look at the camera.');
    setIsScanning(true);
    scanningRef.current = true;
    scanning.value = true;
  }, [device, ensurePermission, isScanning, scanning]);

  if (!permission.hasPermission) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <CameraIcon size={64} color="#3B82F6" />
          <Text style={styles.title}>Camera Access Required</Text>
          <Text style={styles.subtitle}>
            We need camera access for face recognition authentication
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={permission.requestPermission}>
            <Text style={styles.permissionButtonText}>Grant Camera Access</Text>
          </TouchableOpacity>
        </View>
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

  const toggleCameraFacing = () => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  };

  return (
    <View style={styles.container}>
      <View style={styles.cameraContainer}>
        <VisionCamera
          style={styles.camera}
          device={device!}
          isActive
          frameProcessor={frameProcessor}
        />
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.overlay]}>
          <View style={[styles.faceFrame,
            isScanning && styles.faceFrameScanning,
            scanResult === 'success' && styles.faceFrameSuccess,
            scanResult === 'failed' && styles.faceFrameFailed
          ]} />

          <View style={styles.scanningIndicator}>
            <Text style={styles.scanningText}>{isScanning ? 'Scanning…' : statusText}</Text>
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
    alignItems: 'center',
    backgroundColor: '#111827',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  permissionButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#2563EB',
    borderRadius: 12,
  },
  permissionButtonText: {
    color: '#F8FAFC',
    fontWeight: '600',
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  loadingText: {
    color: '#E5E7EB',
    fontSize: 16,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#F9FAFB',
    fontSize: 22,
    fontWeight: '700',
  },
});