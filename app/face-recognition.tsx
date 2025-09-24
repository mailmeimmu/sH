import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
let FaceDetector: any = null;
try {
  // Optional native module; requires a Dev Client or EAS build
  FaceDetector = require('expo-face-detector');
} catch (e) {
  FaceDetector = null;
}
import { router } from 'expo-router';
import { Camera, RotateCcw, CircleCheck as CheckCircle } from 'lucide-react-native';
import { db } from '../services/database';
import remoteApi from '../services/remote';
import * as SecureStore from 'expo-secure-store';

export default function FaceRecognitionScreen() {
  const [facing, setFacing] = useState<CameraType>('front');
  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<'success' | 'failed' | null>(null);
  const [recognizedUser, setRecognizedUser] = useState<any>(null);
  const [statusText, setStatusText] = useState('Tap scan when you are ready');
  const cameraRef = useRef<CameraView>(null);

  function buildTemplateFromFace(face: any) {
    const bounds = face.bounds || face.boundingBox || {};
    const origin = bounds.origin || { x: bounds.x || 0, y: bounds.y || 0 };
    const size = bounds.size || { width: bounds.width || 1, height: bounds.height || 1 };
    const w = size.width || 1; const h = size.height || 1;
    const lm = face.landmarks || {};
    const pick = (name: string) => {
      const p = lm[name] || lm?.[name + 'Position'] || lm[name + 'Position'];
      if (!p) return [0, 0];
      const x = (p.x - origin.x) / w; const y = (p.y - origin.y) / h;
      return [Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0];
    };
    const keys = ['leftEye','rightEye','noseBase','leftEar','rightEar','leftCheek','rightCheek','mouthLeft','mouthRight','bottomMouth'];
    const pts = keys.map(k => pick(k)).flat();
    const [lex,ley,rex,rey,nx,ny,lerx,lery,rerx,rery,lcx,lcy,rcx,rcy,mlx,mly,mrx,mry,bmx,bmy] = pts.concat(Array(20-pts.length).fill(0));
    const eyeDist = Math.hypot(rex-lex, rey-ley);
    const mouthWidth = Math.hypot(mrx-mlx, mry-mly);
    const noseToMouth = Math.hypot(nx-((mlx+mrx)/2), ny-((mly+mry)/2));
    const vec = [...pts, eyeDist, mouthWidth, noseToMouth];
    return { vec, meta: { w, h } };
  }

  const attemptMatch = async () => {
    if (isScanning) return;
    if (!permission?.granted) {
      const status = await requestPermission();
      if (!status?.granted) {
        Alert.alert('Camera', 'Camera access is required for face login.');
        return;
      }
    }
    try {
      setIsScanning(true);
      setStatusText('Scanning...');
      const cam = cameraRef.current;
      if (!cam) { Alert.alert('Camera', 'Camera not ready'); return; }
      const photo: any = await cam.takePictureAsync?.({ quality: 0.85, base64: true });
      const uri = photo?.uri;
      if (!uri) throw new Error('No image');

      let templateStr = '';
      if (FaceDetector) {
        const options: any = {
          mode: (FaceDetector as any).FaceDetectorMode?.accurate || 'accurate',
          detectLandmarks: (FaceDetector as any).FaceDetectorLandmarks?.all || 'all',
          runClassifications: (FaceDetector as any).FaceDetectorClassifications?.none || 'none',
        };
        const res: any = await (FaceDetector as any).detectFacesAsync(uri, options);
        const faces: any[] = res?.faces || res || [];
        if (faces.length !== 1) {
          Alert.alert('Face Not Detected', faces.length > 1 ? 'Only one face should be in the frame.' : 'Please align your face and try again.');
          setStatusText('Tap scan when you are ready');
          return;
        }
        const tpl = buildTemplateFromFace(faces[0]);
        templateStr = JSON.stringify(tpl);
      } else {
        const hashString = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) { h = ((h << 5) + h) + s.charCodeAt(i); h |= 0; } return (Math.abs(h)).toString(36); };
        const b64: string = photo?.base64 || '';
        templateStr = JSON.stringify({ hash: hashString(b64.slice(0, 1024)) });
      }

      let result: any = { success: false };
      if (remoteApi.enabled) {
        result = await remoteApi.authByFace(templateStr);
      } else {
        try { await (db as any).readyPromise; } catch {}
        result = await db.authenticateByFace(templateStr);
      }

      if (result?.success && result.user) {
        db.currentUser = result.user;
        setRecognizedUser(result.user);
        setScanResult('success');
        setStatusText(`Welcome back, ${result.user.name}`);
        try { await SecureStore.setItemAsync('last_user_id', result.user.id); } catch {}
        setTimeout(() => router.replace('/(tabs)'), 900);
      } else {
        setScanResult('failed');
        setStatusText('Face not recognized. Try again.');
        setTimeout(() => setStatusText('Tap scan when you are ready'), 1500);
      }
    } catch (e) {
      console.log('[NafisaSmartHome] Face scan error', e);
      setScanResult('failed');
      setStatusText('Unable to scan. Try again.');
      setTimeout(() => setStatusText('Tap scan when you are ready'), 1500);
    } finally {
      setIsScanning(false);
    }
  };

  if (!permission) {
    console.log('[NafisaSmartHome] Camera permission loading');
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading camera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    console.log('[NafisaSmartHome] Camera permission not granted');
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Camera size={64} color="#3B82F6" />
          <Text style={styles.title}>Camera Access Required</Text>
          <Text style={styles.subtitle}>
            We need camera access for face recognition authentication
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Grant Camera Access</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const simulateFaceRecognition = () => {};

  const toggleCameraFacing = () => {
    console.log('[NafisaSmartHome] Toggle camera');
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  };

  const goBack = () => {
    console.log('[NafisaSmartHome] Back from face-recognition');
    router.back();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={goBack}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Face Recognition</Text>
      </View>

      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing={facing} photo />
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.overlay]}>
          {/* Face detection frame */}
          <View style={[styles.faceFrame, 
            isScanning && styles.faceFrameScanning,
            scanResult === 'success' && styles.faceFrameSuccess,
            scanResult === 'failed' && styles.faceFrameFailed
          ]} />
          
          {/* Status indicator */}
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
        <Text style={styles.instructions}>
          Align your face within the frame, then tap Scan to authenticate.
        </Text>
        <View style={[styles.controlButtons, { justifyContent: 'space-between' }] }>
          <TouchableOpacity style={styles.flipButton} onPress={toggleCameraFacing}>
            <RotateCcw size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.scanButton, isScanning && styles.scanButtonDisabled]} 
            onPress={() => attemptMatch()}
            disabled={isScanning || scanResult === 'success'}
          >
            <Camera size={28} color="#FFFFFF" />
            <Text style={styles.scanButtonText}>{isScanning ? 'Scanning…' : 'Scan Now'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 100,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
  },
  backButton: {
    marginRight: 16,
  },
  backButtonText: {
    color: '#3B82F6',
    fontSize: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  permissionButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  cameraContainer: {
    flex: 1,
    margin: 20,
    borderRadius: 20,
    overflow: 'hidden',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  faceFrame: {
    width: 250,
    height: 300,
    borderWidth: 3,
    borderColor: '#3B82F6',
    borderRadius: 150,
    borderStyle: 'dashed',
  },
  faceFrameScanning: {
    borderColor: '#F59E0B',
  },
  faceFrameSuccess: {
    borderColor: '#10B981',
    borderStyle: 'solid',
  },
  faceFrameFailed: {
    borderColor: '#EF4444',
    borderStyle: 'solid',
  },
  scanningIndicator: {
    position: 'absolute',
    bottom: 100,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  scanningText: {
    color: '#F59E0B',
    fontSize: 16,
    fontWeight: '600',
  },
  successIndicator: {
    position: 'absolute',
    bottom: 100,
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 20,
  },
  successText: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  userNameText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  failedIndicator: {
    position: 'absolute',
    bottom: 100,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  failedText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '600',
  },
  failedSubtext: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  controls: {
    padding: 20,
  },
  instructions: {
    color: '#9CA3AF',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  controlButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  flipButton: {
    backgroundColor: '#374151',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanButton: {
    backgroundColor: '#3B82F6',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 12,
  },
  scanButtonDisabled: {
    backgroundColor: '#6B7280',
  },
  scanButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});
