import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert } from 'react-native';
import { router } from 'expo-router';
import { Camera as CameraIcon, RotateCcw, CircleCheck as CheckCircle } from 'lucide-react-native';
import { db } from '../services/database';
import remoteApi from '../services/remote';
import * as SecureStore from 'expo-secure-store';

// Platform-specific imports
let FaceRecognitionNative: any = null;
if (Platform.OS !== 'web') {
  try {
    FaceRecognitionNative = require('../components/FaceRecognitionNative').default;
  } catch (error) {
    console.warn('FaceRecognitionNative not available:', error);
  }
}

const FACE_STATUS_IDLE = 'Tap scan when you are ready';

export default function FaceRecognitionScreen() {
  const handleAuthenticationResult = useCallback(async (success: boolean, data?: any) => {
    if (!success) {
      return;
    }
    
    const templateStr = data?.template;
    if (!templateStr) return;
    
    try {
      let result: any = { success: false };
      if (remoteApi.enabled) {
        result = await remoteApi.authByFace(templateStr);
      } else {
        try { await (db as any).readyPromise; } catch {}
        result = await db.authenticateByFace(templateStr);
      }

      if (result?.success && result.user) {
        db.currentUser = result.user;
        try { await SecureStore.setItemAsync('last_user_id', result.user.id); } catch {}
        setTimeout(() => router.replace('/(tabs)'), 900);
      } else {
        // Handle failure in the component
      }
    } catch (error) {
      console.log('[NafisaSmartHome] Face match error', error);
    }
  }, []);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Face Recognition</Text>
        </View>
        <View style={styles.webNotSupportedContainer}>
          <CameraIcon size={64} color="#3B82F6" />
          <Text style={styles.webNotSupportedTitle}>Face recognition is not available on web</Text>
          <Text style={styles.webNotSupportedText}>
            Face recognition requires camera access and is only available on iOS and Android devices.
            Please use another login method.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.back()}>
            <Text style={styles.primaryButtonText}>Use Another Method</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!FaceRecognitionNative) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Camera not available</Text>
      </View>
    );
  }

  return (
    <FaceRecognitionNative
      onAuthenticationComplete={handleAuthenticationResult}
      onGoBack={() => router.back()}
    />
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
  webNotSupportedContainer: {
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
  webNotSupportedTitle: {
    color: '#F9FAFB',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  webNotSupportedText: {
    color: '#94A3B8',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
