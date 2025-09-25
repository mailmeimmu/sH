import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import {
  Camera as VisionCamera,
  useCameraPermission,
  useCameraDevice,
  useFrameProcessor,
} from 'react-native-vision-camera';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import { scanFaces } from 'vision-camera-face-detector';
import { Camera as CameraIcon, Save, CircleCheck as CheckCircle } from 'lucide-react-native';
import { buildTemplateFromFace, normalizeVisionFace, hashTemplateFromString } from '../utils/face-template';

const INITIAL_STATUS = 'Press scan when you are ready';

type Props = {
  userInfo: { name: string; email: string };
  onRegistrationComplete: (template: string) => void;
  onGoBack: () => void;
};

export default function FaceRegistrationNative({ userInfo, onRegistrationComplete, onGoBack }: Props) {
  const [statusText, setStatusText] = useState(INITIAL_STATUS);
  const [isCapturing, setIsCapturing] = useState(false);

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

  const isReady = useMemo(() => !!device && permission.hasPermission, [device, permission.hasPermission]);

  const ensurePermission = useCallback(async () => {
    if (permission.hasPermission) return true;
    const granted = await permission.requestPermission();
    return granted;
  }, [permission]);

  const resetCaptureState = useCallback(() => {
    scanning.value = false;
    scanningRef.current = false;
    setIsCapturing(false);
  }, [scanning]);

  const completeRegistration = useCallback(async (templateStr: string) => {
    try {
      onRegistrationComplete(templateStr);
    } catch (error) {
      Alert.alert('Error', 'Could not capture face');
      setStatusText(INITIAL_STATUS);
    } finally {
      resetCaptureState();
    }
  }, [resetCaptureState, onRegistrationComplete]);

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

  if (!permission.hasPermission) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onGoBack}>
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

  if (!isReady) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading camera...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onGoBack}>
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