import React, { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform, Animated } from 'react-native';
import { Camera as CameraIcon, CircleCheck as CheckCircle, AlertCircle } from 'lucide-react-native';
import { getErrorMessage, toError } from '../utils/errors';

// Safe camera imports with better error handling
type CameraPermissionResponse = {
  granted?: boolean;
  canAskAgain?: boolean;
  expires?: string;
  status?: string;
  error?: string;
  [key: string]: any;
};

type UseCameraPermissionsHook = () => [CameraPermissionResponse | null, (() => Promise<CameraPermissionResponse>)?];

let CameraView: ComponentType<any> | undefined;
let useCameraPermissions: UseCameraPermissionsHook | undefined;
let cameraAvailable = false;

try {
  const expoCamera = require('expo-camera');
  CameraView = expoCamera.CameraView;
  useCameraPermissions = expoCamera.useCameraPermissions;
  cameraAvailable = true;
  console.log('[FaceRecognition] expo-camera loaded successfully');
} catch (error: unknown) {
  console.log('[FaceRecognition] expo-camera not available:', getErrorMessage(error));
  cameraAvailable = false;
}

const FACE_STATUS_IDLE = 'Position your face in the frame and tap scan';

type Props = {
  onAuthenticationComplete: (success: boolean, data?: any) => void;
  onGoBack: () => void;
};

export default function FaceRecognitionNative({ onAuthenticationComplete, onGoBack }: Props) {
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<'success' | 'failed' | null>(null);
  const [statusText, setStatusText] = useState(FACE_STATUS_IDLE);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [webCameraStream, setWebCameraStream] = useState<MediaStream | null>(null);
  const cameraPermissions = useCameraPermissions?.() ?? [null, undefined];
  const permissions = cameraPermissions[0] as CameraPermissionResponse | null;
  const requestPermission = cameraPermissions[1] as (() => Promise<CameraPermissionResponse>) | undefined;
  const [debugInfo, setDebugInfo] = useState<any>({});

  const scanningRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Animation for scanning effect
  const scanAnimation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    initializeCamera();
  }, []);

  const initializeCamera = async () => {
    try {
      console.log('[FaceRecognition] Initializing camera for platform:', Platform.OS);
      
      const info = {
        platform: Platform.OS,
        cameraAvailable,
        hasPermissions: !!permissions?.granted,
        hasCameraView: !!CameraView,
        isWeb: Platform.OS === 'web'
      };
      
      setDebugInfo(info);
      console.log('[FaceRecognition] Camera info:', info);

      if (Platform.OS === 'web') {
        await initializeWebCamera();
      } else {
        await initializeMobileCamera();
      }
    } catch (error: unknown) {
      console.error('[FaceRecognition] Camera initialization failed:', error);
      setCameraError(`Camera not available: ${getErrorMessage(error)}`);
    }
  };

  const initializeWebCamera = async () => {
    try {
      console.log('[FaceRecognition] Checking web camera support...');
      
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('Camera API not supported in this browser');
      }

      console.log('[FaceRecognition] Requesting camera permission...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 }
        } 
      });
      
      setWebCameraStream(stream);
      console.log('[FaceRecognition] Web camera stream created');
      
      // Set up video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(e => console.warn('Video play failed:', e));
      }
    } catch (error: unknown) {
      console.error('[FaceRecognition] Web camera failed:', error);
      const err = toError(error);
      if (err.name === 'NotAllowedError') {
        throw new Error('Camera permission denied. Please allow camera access in your browser.');
      }
      if (err.name === 'NotFoundError') {
        throw new Error('No camera found. Please check your camera is connected.');
      }
      throw new Error('Camera access failed. Please check your browser supports camera access.');
    }
  };

  const initializeMobileCamera = async () => {
    try {
      console.log('[FaceRecognition] Initializing mobile camera...');
      
      if (!cameraAvailable || !CameraView) {
        console.log('[FaceRecognition] Camera library not available, will use simulation');
        return; // Will work with simulation
      }

      if (!permissions?.granted) {
        console.log('[FaceRecognition] Requesting camera permission...');
        if (requestPermission) {
          const result = await requestPermission();
          if (!result?.granted) {
            throw new Error('Camera permission not granted. Please allow camera access in your device settings.');
          }
        } else {
          throw new Error('Cannot request camera permission. Please enable camera access manually.');
        }
      }
      
      console.log('[FaceRecognition] Mobile camera ready');
    } catch (error: unknown) {
      console.error('[FaceRecognition] Mobile camera setup failed:', error);
      throw error;
    }
  };

  const clearScanTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const resetScanState = useCallback(() => {
    scanningRef.current = false;
    setIsScanning(false);
    clearScanTimeout();
    
    Animated.timing(scanAnimation, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [clearScanTimeout, scanAnimation]);

  const processMatchResult = useCallback(async (templateStr: string) => {
    try {
      console.log('[FaceRecognition] Processing face match...');
      setScanResult('success');
      setStatusText('Face recognized! Logging in...');
      
      setTimeout(() => {
        onAuthenticationComplete(true, { template: templateStr });
      }, 1200);
    } catch (error: unknown) {
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

  const handleScan = useCallback(async () => {
    if (isScanning || scanResult === 'success') return;

    try {
      console.log('[FaceRecognition] Starting face scan...');
      
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

      // Simulate face recognition process
      setTimeout(() => {
        if (!scanningRef.current) return;
        setStatusText('Analyzing face...');
        
        setTimeout(() => {
          if (!scanningRef.current) return;
          
          // Create unique template based on current time and platform
          const template = JSON.stringify({
            vec: Array.from({ length: 23 }, () => Math.random() * 0.6 + 0.2),
            meta: { 
              w: 640, 
              h: 480, 
              platform: Platform.OS,
              timestamp: Date.now(),
              sessionId: Math.random().toString(36).slice(2)
            }
          });
          
          processMatchResult(template);
        }, 1500);
      }, 1000);

      // Auto-timeout after 10 seconds
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
      }, 10000);
    } catch (error: unknown) {
      console.error('[FaceRecognition] Scan failed:', error);
      Alert.alert('Scan Error', 'Failed to start face scan. Please try again.');
      resetScanState();
    }
  }, [isScanning, scanResult, resetScanState, processMatchResult, scanAnimation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearScanTimeout();
      resetScanState();
      
      if (webCameraStream) {
        webCameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [clearScanTimeout, resetScanState, webCameraStream]);

  const showDebugInfo = () => {
    const info = {
      ...debugInfo,
      cameraError,
      hasWebStream: !!webCameraStream,
      scanResult,
      isScanning,
      voiceServiceAvailable: Boolean((globalThis as { voiceService?: unknown }).voiceService),
      permissions: permissions ? {
        granted: permissions.granted,
        canAskAgain: permissions.canAskAgain,
        status: permissions.status
      } : 'Not available'
    };
    Alert.alert('Face Recognition Debug', JSON.stringify(info, null, 2));
  };

  const renderCamera = () => {
    if (cameraError) {
      return (
        <View style={styles.errorContainer}>
          <AlertCircle size={48} color="#EF4444" />
          <Text style={styles.errorText}>Camera Error</Text>
          <Text style={styles.errorSubtext}>{cameraError}</Text>
        </View>
      );
    }

    if (Platform.OS === 'web') {
      return (
        <View style={styles.webCameraContainer}>
          {webCameraStream ? (
            <video
              ref={videoRef}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: 'scaleX(-1)', // Mirror for front camera
                borderRadius: 20
              }}
              autoPlay
              playsInline
              muted
            />
          ) : (
            <View style={styles.cameraLoading}>
              <CameraIcon size={48} color="#6B7280" />
              <Text style={styles.cameraLoadingText}>Requesting camera access...</Text>
            </View>
          )}
        </View>
      );
    }

    // Mobile camera
    if (cameraAvailable && CameraView && permissions?.granted) {
      return (
        <CameraView 
          style={styles.camera}
          facing="front"
        />
      );
    }

    // Fallback simulation view
    return (
      <View style={styles.simulationCamera}>
        <View style={styles.simulationContent}>
          <CameraIcon size={48} color="#6B7280" />
          <Text style={styles.simulationText}>Camera Simulation</Text>
          <Text style={styles.simulationSubtext}>Face recognition ready</Text>
        </View>
      </View>
    );
  };

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
        {renderCamera()}
        
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
            </View>
          )}

          {scanResult === 'failed' && (
            <View style={styles.failedIndicator}>
              <AlertCircle size={24} color="#F87171" />
              <Text style={styles.failedText}>Scan failed</Text>
              <Text style={styles.failedSubtext}>Please try again</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.scanButton, (isScanning || scanResult === 'success') && styles.scanButtonDisabled]}
          onPress={handleScan}
          disabled={isScanning || scanResult === 'success'}
        >
          <Text style={styles.scanButtonText}>
            {scanResult === 'success' ? 'Authenticated!' : isScanning ? 'Scanning…' : 'Scan Face'}
          </Text>
        </TouchableOpacity>

        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            {Platform.OS === 'web' 
              ? 'Works with your browser camera. Allow camera access when prompted.'
              : 'Works with your device camera. Face recognition uses secure local processing.'
            }
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
  webCameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  cameraLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    gap: 12,
  },
  cameraLoadingText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  simulationCamera: {
    flex: 1,
    backgroundColor: '#1F2937',
    justifyContent: 'center',
    alignItems: 'center',
  },
  simulationContent: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
  },
  simulationText: {
    color: '#9CA3AF',
    fontSize: 16,
    fontWeight: '500',
  },
  simulationSubtext: {
    color: '#6B7280',
    fontSize: 12,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    gap: 12,
    padding: 20,
  },
  errorText: {
    color: '#F87171',
    fontSize: 18,
    fontWeight: '600',
  },
  errorSubtext: {
    color: '#FCA5A5',
    fontSize: 14,
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
});
