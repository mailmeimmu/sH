import { Platform } from 'react-native';

// Mock face detection that works reliably across all platforms
export function createMockFace() {
  const baseX = 100 + Math.random() * 50; // Add some randomness
  const baseY = 150 + Math.random() * 30;
  
  return {
    bounds: {
      origin: { x: baseX, y: baseY },
      size: { width: 200, height: 250 }
    },
    landmarks: {
      leftEye: { x: baseX + 50, y: baseY + 50 },
      rightEye: { x: baseX + 150, y: baseY + 50 },
      noseBase: { x: baseX + 100, y: baseY + 100 },
      leftEar: { x: baseX + 20, y: baseY + 70 },
      rightEar: { x: baseX + 180, y: baseY + 70 },
      leftCheek: { x: baseX + 60, y: baseY + 130 },
      rightCheek: { x: baseX + 140, y: baseY + 130 },
      mouthLeft: { x: baseX + 80, y: baseY + 170 },
      mouthRight: { x: baseX + 120, y: baseY + 170 },
      bottomMouth: { x: baseX + 100, y: baseY + 190 }
    }
  };
}

// Reliable face detection with proper simulation
export function scanFaces(frame: any) {
  'worklet';
  
  // Always use simulation for stability and cross-platform compatibility
  // In a real app, you would integrate with a more stable face detection library
  const shouldDetectFace = Math.random() > 0.3; // 70% chance of detecting a face
  
  if (shouldDetectFace) {
    return [createMockFace()];
  }
  
  return [];
}

// Enhanced face detection with better simulation
export function detectFacesInFrame(frame: any): any[] {
  'worklet';
  
  try {
    // Simulate realistic face detection behavior
    const detectionChance = Math.random();
    
    if (detectionChance > 0.25) { // 75% success rate
      const faceCount = detectionChance > 0.9 ? 2 : 1; // Occasionally detect multiple faces
      const faces = [];
      
      for (let i = 0; i < faceCount; i++) {
        faces.push(createMockFace());
      }
      
      return faces;
    }
    
    return [];
  } catch (error) {
    console.warn('[FaceDetection] Frame processing error:', error);
    return [];
  }
}

export default { scanFaces, createMockFace, detectFacesInFrame };