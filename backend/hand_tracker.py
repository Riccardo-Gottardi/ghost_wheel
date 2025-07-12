import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import numpy as np
import math
import time
import os
import urllib.request

class HandTracker:
    def __init__(self, camera_id=0):
        self.camera_id = camera_id
        self.cap = None
        
        # MediaPipe setup (NEW API)
        self.hand_landmarker = None
        
        # Model download and setup
        self.model_path = self._download_model()
        if self.model_path:
            self.base_options = python.BaseOptions(model_asset_path=self.model_path)
        else:
            self.base_options = None
        
        # Tracking data
        self.last_steering_angle = 0
        self.confidence_threshold = 0.8
        self.angle_history = []  # For smoothing
        self.smoothing_window = 5  # Number of frames to average
        
        # Steering configuration
        self.max_steering_angle = 45.0  # Maximum steering angle in degrees
        self.steering_sensitivity = 200.0  # Sensitivity multiplier (adjust as needed)
        # With sensitivity 200: 0.1 Y difference = 20° steering
        # With sensitivity 100: 0.1 Y difference = 10° steering
        
    def _download_model(self):
        """Download MediaPipe hand landmarker model"""
        model_dir = "models"
        model_filename = "hand_landmarker.task"
        model_path = os.path.join(model_dir, model_filename)
        
        # Create models directory if it doesn't exist
        os.makedirs(model_dir, exist_ok=True)
        
        # Check if model already exists
        if os.path.exists(model_path):
            print(f"Using cached model: {model_path}")
            return model_path
            
        # Download model
        model_url = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
        
        try:
            print(f"Downloading MediaPipe model (~6MB)...")
            print(f"From: {model_url}")
            print(f"To: {model_path}")
            
            # Download with progress indication
            def progress_hook(block_num, block_size, total_size):
                if total_size > 0:
                    percent = min(100, (block_num * block_size * 100) // total_size)
                    print(f"\rDownload progress: {percent}%", end="", flush=True)
            
            urllib.request.urlretrieve(model_url, model_path, progress_hook)
            print(f"\nModel downloaded successfully: {model_path}")
            return model_path
            
        except Exception as e:
            print(f"\nERROR: Failed to download model: {e}")
            print("Possible solutions:")
            print("  1. Check internet connection")
            print("  2. Check firewall/proxy settings")
            print("  3. Download manually and place in 'models/' folder")
            print(f"  4. Manual download URL: {model_url}")
            return None
        
    def initialize(self):
        """Initialize camera and MediaPipe"""
        try:
            # Check if model was downloaded successfully
            if not self.base_options:
                print("ERROR: MediaPipe model not available")
                return False
                
            # Initialize camera
            self.cap = cv2.VideoCapture(self.camera_id)
            
            if not self.cap.isOpened():
                print(f"ERROR: Cannot open camera {self.camera_id}")
                return False
                
            # Set camera properties for better performance
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            self.cap.set(cv2.CAP_PROP_FPS, 30)
            print(f"Camera {self.camera_id} opened successfully")
            
            # Initialize MediaPipe Hand Landmarker (NEW API)
            print("Initializing MediaPipe Hand Landmarker...")
            try:
                options = vision.HandLandmarkerOptions(
                    base_options=self.base_options,
                    running_mode=vision.RunningMode.VIDEO,
                    num_hands=2,
                    min_hand_detection_confidence=0.7,
                    min_hand_presence_confidence=0.5,
                    min_tracking_confidence=0.5
                )
                
                self.hand_landmarker = vision.HandLandmarker.create_from_options(options)
                print("MediaPipe Hand Landmarker initialized successfully")
                
            except Exception as mp_error:
                print(f"ERROR: Failed to initialize MediaPipe: {mp_error}")
                print("This might be due to:")
                print("  - Corrupted model file")
                print("  - MediaPipe version incompatibility")
                print("  - Insufficient permissions")
                return False
            
            print(f"Hand tracker initialized on camera {self.camera_id}")
            return True
            
        except Exception as e:
            print(f"Error initializing hand tracker: {e}")
            return False
            
    def calculate_steering_angle(self, left_landmarks, right_landmarks):
        """Calculate steering angle from hand Y-coordinate difference"""
        try:
            # Get wrist positions (landmark 0 = wrist)
            left_wrist = left_landmarks[0]
            right_wrist = right_landmarks[0]
            
            # Calculate Y difference between hands
            # When hands are level (same Y) → steering = 0 (straight)
            # When right hand is lower (higher Y value) → positive steering (right turn)
            # When left hand is lower (higher Y value) → negative steering (left turn)
            y_difference = right_wrist.y - left_wrist.y
            
            # Convert Y difference to steering angle
            raw_steering_angle = y_difference * self.steering_sensitivity
            
            # Clamp to maximum steering range
            steering_angle = np.clip(raw_steering_angle, -self.max_steering_angle, self.max_steering_angle)
            
            # Add to history for smoothing
            self.angle_history.append(steering_angle)
            if len(self.angle_history) > self.smoothing_window:
                self.angle_history.pop(0)
            
            # Calculate smoothed angle
            smoothed_angle = sum(self.angle_history) / len(self.angle_history)
            
            return smoothed_angle
            
        except Exception as e:
            print(f"Error calculating steering angle: {e}")
            return 0
            
    def process_frame(self):
        """Process a single frame and return hand tracking data"""
        if not self.cap or not self.cap.isOpened():
            return None
            
        if not self.hand_landmarker:
            return None
            
        ret, frame = self.cap.read()
        if not ret:
            return None
            
        # Flip frame horizontally for mirror effect
        frame = cv2.flip(frame, 1)
        
        # Convert BGR to RGB for MediaPipe
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Create MediaPipe Image
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
        
        # Get timestamp in milliseconds
        timestamp_ms = int(time.time() * 1000)
        
        # Process hands using NEW API
        result = self.hand_landmarker.detect_for_video(mp_image, timestamp_ms)
        
        # Prepare output data
        hand_data = {
            'timestamp': timestamp_ms,
            'hands_detected': 0,
            'steering_angle': 0,
            'confidence': 0,
            'left_hand': None,
            'right_hand': None
        }
        
        if result.hand_landmarks and result.handedness:
            detected_hands = []
            
            for hand_landmarks, handedness in zip(result.hand_landmarks, result.handedness):
                hand_label = handedness[0].category_name  # 'Left' or 'Right'
                hand_confidence = handedness[0].score
                
                if hand_confidence > self.confidence_threshold:
                    detected_hands.append({
                        'label': hand_label,
                        'landmarks': hand_landmarks,
                        'confidence': hand_confidence
                    })
                    
            hand_data['hands_detected'] = len(detected_hands)
            
            # Find left and right hands
            left_landmarks = None
            right_landmarks = None
            
            for hand in detected_hands:
                # NOTE: MediaPipe labels are from camera perspective (mirrored)
                # So we swap them to match user perspective
                if hand['label'] == 'Right':  # MediaPipe "Right" = User's Left hand
                    left_landmarks = hand['landmarks']
                    hand_data['left_hand'] = {
                        'confidence': hand['confidence'],
                        'wrist_x': hand['landmarks'][0].x,  # Wrist landmark
                        'wrist_y': hand['landmarks'][0].y
                    }
                elif hand['label'] == 'Left':  # MediaPipe "Left" = User's Right hand
                    right_landmarks = hand['landmarks']
                    hand_data['right_hand'] = {
                        'confidence': hand['confidence'],
                        'wrist_x': hand['landmarks'][0].x,  # Wrist landmark
                        'wrist_y': hand['landmarks'][0].y
                    }
                    
            # Calculate steering if both hands detected
            if left_landmarks and right_landmarks:
                steering_angle = self.calculate_steering_angle(left_landmarks, right_landmarks)
                min_confidence = min(
                    hand_data['left_hand']['confidence'],
                    hand_data['right_hand']['confidence']
                )
                
                hand_data['steering_angle'] = steering_angle
                hand_data['confidence'] = min_confidence
                self.last_steering_angle = steering_angle
            else:
                # Use last known angle if only one hand or no hands
                hand_data['steering_angle'] = self.last_steering_angle
                hand_data['confidence'] = 0
                
        return hand_data
        
    def cleanup(self):
        """Cleanup resources"""
        if self.cap:
            self.cap.release()
        cv2.destroyAllWindows()