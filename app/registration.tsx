import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
let FaceDetector: any = null;
try {
  FaceDetector = require('expo-face-detector');
} catch (e) {
  FaceDetector = null;
}
import { router } from 'expo-router';
import { Camera, User, Save, CircleCheck as CheckCircle } from 'lucide-react-native';
import { db } from '../services/database';
import remoteApi from '../services/remote';

export default function RegistrationScreen() {
  const [step, setStep] = useState<'info' | 'capture' | 'success'>('info');
  const [userInfo, setUserInfo] = useState({ name: '', email: '' });
  const [isCapturing, setIsCapturing] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [statusText, setStatusText] = useState('Press scan when you are ready');
  const [createdUser, setCreatedUser] = useState<any>(null);

  const handleInfoSubmit = () => {
    console.log('[NafisaSmartHome] Registration info submit', userInfo);
    if (!userInfo.name.trim() || !userInfo.email.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setStep('capture');
  };

  function hashString(s: string) {
    let h = 5381; for (let i = 0; i < s.length; i++) { h = ((h << 5) + h) + s.charCodeAt(i); h |= 0; }
    return (Math.abs(h)).toString(36);
  }

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
    // Derived simple features
    const [lex,ley,rex,rey,nx,ny,lerx,lery,rerx,rery,lcx,lcy,rcx,rcy,mlx,mly,mrx,mry,bmx,bmy] = pts.concat(Array(20-pts.length).fill(0));
    const eyeDist = Math.hypot(rex-lex, rey-ley);
    const mouthWidth = Math.hypot(mrx-mlx, mry-mly);
    const noseToMouth = Math.hypot(nx-((mlx+mrx)/2), ny-((mly+mry)/2));
    const vec = [...pts, eyeDist, mouthWidth, noseToMouth];
    return { vec, meta: { w, h } };
  }

  const handleCapture = async () => {
    if (isCapturing) return;
    if (!permission?.granted) {
      const status = await requestPermission();
      if (!status?.granted) {
        Alert.alert('Camera', 'Camera access is required to scan faces.');
        return;
      }
    }
    console.log('[NafisaSmartHome] Registration manual capture start');
    try {
      setIsCapturing(true);
      setStatusText('Capturing...');
      const cam = cameraRef.current;
      if (!cam) { Alert.alert('Camera', 'Camera not ready'); return; }
      const photo: any = await cam.takePictureAsync?.({ base64: true, quality: 0.85 });
      const uri = photo?.uri;
      if (!uri) throw new Error('No image');

      let templateStr = '';
      let faceId = '';
      if (!FaceDetector) {
        const b64: string = photo?.base64 || '';
        templateStr = JSON.stringify({ hash: hashString(b64.slice(0, 1024)) });
        faceId = 'fid_' + hashString(templateStr);
      } else {
        const options: any = {
          mode: (FaceDetector as any).FaceDetectorMode?.accurate || 'accurate',
          detectLandmarks: (FaceDetector as any).FaceDetectorLandmarks?.all || 'all',
          runClassifications: (FaceDetector as any).FaceDetectorClassifications?.none || 'none',
        };
        const res: any = await (FaceDetector as any).detectFacesAsync(uri, options);
        const faces: any[] = res?.faces || res || [];
        if (faces.length !== 1) {
          Alert.alert('Face Not Detected', faces.length > 1 ? 'Make sure only one person is in frame.' : 'Please align your face within the frame.');
          setStatusText('Press scan when you are ready');
          return;
        }
        const tpl = buildTemplateFromFace(faces[0]);
        templateStr = JSON.stringify(tpl);
        faceId = 'fid_' + hashString(templateStr);
      }

      const dup = (db as any).matchFaceNoLogin?.(templateStr);
      if (dup?.success && dup.user) {
        Alert.alert('Already Registered', `${dup.user.name} is already registered on this device.`);
        setStatusText('Press scan when you are ready');
        return;
      }

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
        setStatusText('Press scan when you are ready');
      } else {
        Alert.alert('Registration Failed', result?.error || 'Please try again');
        setStatusText('Press scan when you are ready');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not capture face');
      setStatusText('Press scan when you are ready');
    } finally {
      setIsCapturing(false);
    }
  };

  const finishRegistration = () => {
    console.log('[NafisaSmartHome] Finish registration, navigate to tabs');
    // Set current user and login
    if (createdUser) {
      db.currentUser = createdUser;
    } else {
      const registeredUser = db.getAllUsers().find(u => u.email === userInfo.email);
      if (registeredUser) {
        db.currentUser = registeredUser;
      }
    }
    
    router.replace('/(tabs)');
  };

  const goBack = () => {
    if (step === 'capture') {
      setStep('info');
    } else {
      router.back();
    }
  };

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
          
          <TouchableOpacity style={styles.nextButton} onPress={handleInfoSubmit}>
            <Camera size={24} color="#FFFFFF" />
            <Text style={styles.nextButtonText}>Continue to Face Capture</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (step === 'success') {
    return (
      <View style={styles.container}>
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <CheckCircle size={64} color="#10B981" />
          </View>
          
          <Text style={styles.successTitle}>Registration Complete!</Text>
          <Text style={styles.successSubtitle}>
            Your account has been successfully created. You can now access your smart home.
          </Text>
          
          <View style={styles.userInfoDisplay}>
            <Text style={styles.userInfoLabel}>Registered User:</Text>
            <Text style={styles.userInfoText}>{userInfo.name}</Text>
            <Text style={styles.userInfoEmail}>{userInfo.email}</Text>
          </View>
          
          <TouchableOpacity style={styles.finishButton} onPress={finishRegistration}>
            <Text style={styles.finishButtonText}>Start Using App</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Capture step - Front camera preview with capture
  if (step === 'capture') {
    if (!permission) {
      return (
        <View style={styles.container}>
          <Text style={styles.loadingText}>Loading camera...</Text>
        </View>
      );
    }
    if (!permission.granted) {
      return (
        <View style={styles.container}>
          <View style={styles.permissionContainer}>
            <Camera size={64} color="#3B82F6" />
            <Text style={styles.title}>Camera Access Required</Text>
            <Text style={styles.subtitle}>We need the front camera to capture your face.</Text>
            <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
              <Text style={styles.permissionButtonText}>Grant Camera Access</Text>
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
          <CameraView ref={cameraRef} style={styles.camera} facing="front" photo />
          <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.overlay]}>
            <View style={[styles.faceFrame, isCapturing && styles.faceFrameCapturing]} />
            <View style={styles.capturingIndicator}>
              <Text style={styles.capturingText}>{isCapturing ? 'Capturing…' : statusText}</Text>
            </View>
          </View>
        </View>

        <View style={styles.controls}>
          <Text style={styles.instructions}>
            Align your face within the frame, then tap Scan to capture.
          </Text>
          <TouchableOpacity 
            style={[styles.captureButton, isCapturing && styles.captureButtonDisabled]} 
            onPress={handleCapture}
            disabled={isCapturing}
          >
            <Camera size={32} color="#FFFFFF" />
            <Text style={styles.captureButtonText}>{isCapturing ? 'Capturing…' : 'Scan Face'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Fallback (should not reach)
  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
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
  infoForm: {
    flex: 1,
    padding: 32,
    justifyContent: 'center',
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    padding: 16,
    color: '#FFFFFF',
    fontSize: 16,
  },
  nextButton: {
    backgroundColor: '#3B82F6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 32,
    gap: 12,
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  cameraContainer: {
    flex: 1,
    margin: 20,
    borderRadius: 20,
    overflow: 'hidden',
  },
  mockCamera: {
    flex: 1,
    backgroundColor: '#374151',
  },
  camera: { flex: 1 },
  loadingText: { color: '#FFFFFF', fontSize: 18, textAlign: 'center', marginTop: 100 },
  permissionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  permissionButton: { backgroundColor: '#3B82F6', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  permissionButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
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
  faceFrameCapturing: {
    borderColor: '#10B981',
    borderStyle: 'solid',
  },
  capturingIndicator: {
    position: 'absolute',
    bottom: 100,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  capturingText: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '600',
  },
  controls: {
    padding: 20,
    alignItems: 'center',
  },
  instructions: {
    color: '#9CA3AF',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  captureButton: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 12,
  },
  captureButtonDisabled: {
    backgroundColor: '#6B7280',
  },
  captureButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  successContainer: {
    flex: 1,
    padding: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successIcon: {
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  userInfoDisplay: {
    backgroundColor: '#1F2937',
    padding: 20,
    borderRadius: 12,
    marginBottom: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  userInfoLabel: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 8,
  },
  userInfoText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  userInfoEmail: {
    color: '#3B82F6',
    fontSize: 16,
  },
  finishButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  finishButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});
