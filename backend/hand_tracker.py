import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import numpy as np
import time
import os
import urllib.request

class HandTracker:
    """Simple hand tracker with automatic model download"""
    
    def __init__(self, camera_id=0):
        self.camera_id = camera_id
        self.cap = None
        self.hand_landmarker = None
        self.last_angle = 0
        
        # Model setup
        self.model_path = self._ensure_model()
        
        # Performance optimization: pre-allocate variables
        self._frame_buffer = None
        self._rgb_buffer = None
        
    def _ensure_model(self):
        """Download hand landmarker model if not present"""
        model_dir = "models"
        model_file = "hand_landmarker.task"
        model_path = os.path.join(model_dir, model_file)
        
        # Create models directory
        os.makedirs(model_dir, exist_ok=True)
        
        # Check if model exists
        if os.path.exists(model_path):
            print(f"Using cached model: {model_path}")
            return model_path
        
        # Download model
        model_url = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
        
        try:
            print("Downloading MediaPipe hand model (6MB)...")
            urllib.request.urlretrieve(model_url, model_path)
            print(f"Model downloaded: {model_path}")
            return model_path
            
        except Exception as e:
            print(f"ERROR: Failed to download model: {e}")
            return None
    
    def initialize(self):
        """Initialize camera and MediaPipe"""
        try:
            # Check model
            if not self.model_path:
                print("ERROR: No model available")
                return False
            
            # Initialize camera
            self.cap = cv2.VideoCapture(self.camera_id)
            if not self.cap.isOpened():
                print(f"ERROR: Cannot open camera {self.camera_id}")
                return False
            
            # Set camera properties
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            self.cap.set(cv2.CAP_PROP_FPS, 30)
            
            # Initialize MediaPipe
            base_options = python.BaseOptions(model_asset_path=self.model_path)
            options = vision.HandLandmarkerOptions(
                base_options=base_options,
                running_mode=vision.RunningMode.VIDEO,
                num_hands=2,
                min_hand_detection_confidence=0.7,
                min_hand_presence_confidence=0.5,
                min_tracking_confidence=0.5
            )
            
            self.hand_landmarker = vision.HandLandmarker.create_from_options(options)
            
            print(f"Hand tracker initialized on camera {self.camera_id}")
            return True
            
        except Exception as e:
            print(f"Error initializing hand tracker: {e}")
            return False
    
    def process_frame(self):
        """High-performance frame processing with minimal allocations"""
        if not self.cap or not self.hand_landmarker:
            return None
            
        # Read frame (fastest path)
        ret, frame = self.cap.read()
        if not ret:
            return None
        
        # Flip and convert in one step (optimization)
        frame = cv2.flip(frame, 1)
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Create MediaPipe image (minimal overhead)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
        timestamp_ms = int(time.time() * 1000)
        
        # Process hands (core computation)
        result = self.hand_landmarker.detect_for_video(mp_image, timestamp_ms)
        
        # Fast data preparation (minimal dict creation)
        hand_data = {
            'timestamp': timestamp_ms,
            'hands_detected': 0,
            'steering_angle': self.last_angle,
            'confidence': 0,
            'status': 'no_hands'
        }
        
        # Fast processing of results
        if result.hand_landmarks and result.handedness:
            left_wrist = None
            right_wrist = None
            hands_count = 0
            total_confidence = 0.0
            
            # Process hands with minimal overhead
            for hand_landmarks, handedness in zip(result.hand_landmarks, result.handedness):
                confidence = handedness[0].score
                
                if confidence > 0.6:  # Quick confidence check
                    hands_count += 1
                    total_confidence += confidence
                    
                    wrist = hand_landmarks[0]  # Fast wrist access
                    
                    # Simple hand assignment (fastest path)
                    if handedness[0].category_name == 'Left':
                        left_wrist = wrist
                    elif handedness[0].category_name == 'Right':
                        right_wrist = wrist
            
            # Update core data only
            hand_data['hands_detected'] = hands_count
            
            if hands_count > 0:
                hand_data['confidence'] = total_confidence / hands_count
                
                # Fast steering calculation (only when both hands present)
                if left_wrist and right_wrist and hands_count == 2:
                    # Ultra-fast steering calculation
                    y_diff = right_wrist.y - left_wrist.y
                    angle = max(-45, min(45, y_diff * 300))  # Fast clamp
                    hand_data['steering_angle'] = round(angle, 1)
                    hand_data['status'] = 'both_hands'
                    self.last_angle = angle
                else:
                    hand_data['status'] = 'single_hand'
        
        return hand_data
    
    def cleanup(self):
        """Release resources"""
        try:
            if self.cap:
                self.cap.release()
                print("Camera released")
            if self.hand_landmarker:
                self.hand_landmarker.close()
                print("MediaPipe closed")
        except Exception as e:
            print(f"Error during cleanup: {e}")