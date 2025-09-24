import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Camera, RotateCcw, CircleCheck as CheckCircle } from 'lucide-react-native';
import { db } from '../services/database';

export default function ChangeFaceScreen() {
  const user = db.getCurrentUser() || db.getAllUsers()[0];
  const [isCapturing, setIsCapturing] = useState(false);
  const [done, setDone] = useState(false);

  const onBack = () => {
    if (done) {
      router.replace('/profile');
    } else {
      router.back();
    }
  };

  const simulateCapture = async () => {
    setIsCapturing(true);
    setDone(false);
    setTimeout(async () => {
      const faceTemplate = `face_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      await db.updateUserFaceTemplate(user?.id, faceTemplate);
      setIsCapturing(false);
      setDone(true);
      setTimeout(() => router.replace('/profile'), 1200);
    }, 1800);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Change Face</Text>
      </View>

      <View style={styles.cameraContainer}>
        <View style={styles.mockCamera}>
          <View style={styles.overlay}>
            <View style={[styles.faceFrame, isCapturing && styles.faceFrameCapturing]} />
            {done && (
              <View style={styles.successIndicator}>
                <CheckCircle size={40} color="#10B981" />
                <Text style={styles.successText}>Updated</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      <View style={styles.controls}>
        <Text style={styles.instructions}>
          Center your face and tap capture to update your template
        </Text>
        <TouchableOpacity
          style={[styles.captureButton, isCapturing && styles.captureButtonDisabled]}
          onPress={simulateCapture}
          disabled={isCapturing}
        >
          <Camera size={32} color="#FFFFFF" />
          <Text style={styles.captureButtonText}>
            {isCapturing ? 'Capturing...' : 'Capture Face'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
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
});

