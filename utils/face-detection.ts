import { Platform } from 'react-native';

// Mock face detection for platforms where it's not available
export function createMockFace() {
  return {
    bounds: {
      origin: { x: 100, y: 150 },
      size: { width: 200, height: 250 }
    },
    landmarks: {
      leftEye: { x: 150, y: 200 },
      rightEye: { x: 250, y: 200 },
      noseBase: { x: 200, y: 250 },
      leftEar: { x: 120, y: 220 },
      rightEar: { x: 280, y: 220 },
      leftCheek: { x: 160, y: 280 },
      rightCheek: { x: 240, y: 280 },
      mouthLeft: { x: 180, y: 320 },
      mouthRight: { x: 220, y: 320 },
      bottomMouth: { x: 200, y: 340 }
    }
  };
}

// Face detection function that works across platforms
export function scanFaces(frame: any) {
  'worklet';
  
  if (Platform.OS === 'web') {
    // Return mock face for web (simulation)
    return Math.random() > 0.7 ? [createMockFace()] : [];
  }
  
  // For native platforms, try to use actual face detection
  try {
    // Try to import and use the real face detector
    const faceDetector = require('vision-camera-face-detector');
    if (faceDetector && faceDetector.scanFaces) {
      return faceDetector.scanFaces(frame);
    }
  } catch (error) {
    console.warn('[FaceDetection] Native face detection not available, using mock');
  }
  
  // Fallback to simulation
  return Math.random() > 0.8 ? [createMockFace()] : [];
}

export default { scanFaces, createMockFace };