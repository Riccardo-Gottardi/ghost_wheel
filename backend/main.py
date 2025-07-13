import cv2
import asyncio
import json
import time
import base64
import numpy as np
from camera_manager import CameraManager
from hand_tracker import HandTracker
from websocket_server import WebSocketServer

class GhostWheelSystem:
    def __init__(self):
        self.camera_manager = CameraManager()
        self.hand_tracker = None
        self.websocket_server = WebSocketServer()
        self.hand_camera_id = None
        self.ar_camera_id = None
        self.ar_camera = None
        self.running = False
        
    def setup_cameras(self):
        """Setup camera selection interface"""
        print("=== Ghost Wheel - Sprint 2 Camera Setup ===")
        
        # Discover available cameras
        available_cameras = self.camera_manager.discover_cameras()
        
        if not available_cameras:
            print("ERROR: No cameras found!")
            return False
            
        print(f"\nFound {len(available_cameras)} camera(s):")
        for i, camera_info in enumerate(available_cameras):
            print(f"  {i}: {camera_info}")
            
        # Select hand tracking camera
        while True:
            try:
                choice = input(f"\nSelect camera for HAND TRACKING (0-{len(available_cameras)-1}): ")
                self.hand_camera_id = int(choice)
                if 0 <= self.hand_camera_id < len(available_cameras):
                    break
                print("Invalid selection!")
            except ValueError:
                print("Please enter a number!")
                
        # Select AR surface camera
        while True:
            try:
                choice = input(f"Select camera for AR SURFACE STREAMING (0-{len(available_cameras)-1}): ")
                self.ar_camera_id = int(choice)
                if 0 <= self.ar_camera_id < len(available_cameras):
                    break
                print("Invalid selection!")
            except ValueError:
                print("Please enter a number!")
                
        print(f"\nConfiguration:")
        print(f"  Hand Tracking: Camera {self.hand_camera_id}")
        print(f"  AR Surface Stream: Camera {self.ar_camera_id}")
        
        return True
        
    def initialize_hand_tracker(self):
        """Initialize MediaPipe hand tracker"""
        if self.hand_camera_id is None:
            print("ERROR: No camera selected for hand tracking!")
            return False
            
        print("Initializing hand tracker...")
        self.hand_tracker = HandTracker(camera_id=self.hand_camera_id)
        return self.hand_tracker.initialize()
        
    def initialize_ar_camera(self):
        """Initialize AR surface camera for streaming"""
        if self.ar_camera_id is None:
            print("ERROR: No camera selected for AR surface!")
            return False
            
        print("Initializing AR surface camera...")
        self.ar_camera = cv2.VideoCapture(self.ar_camera_id)
        
        if not self.ar_camera.isOpened():
            print(f"ERROR: Cannot open AR camera {self.ar_camera_id}")
            return False
            
        # Set camera properties for better performance
        self.ar_camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self.ar_camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        self.ar_camera.set(cv2.CAP_PROP_FPS, 30)
        print(f"AR camera {self.ar_camera_id} initialized successfully")
        
        return True
        
    def capture_ar_frame(self):
        """Capture frame from AR camera and encode to base64"""
        if not self.ar_camera or not self.ar_camera.isOpened():
            return None
            
        ret, frame = self.ar_camera.read()
        if not ret:
            return None
            
        # Encode frame to JPEG
        ret_encode, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if not ret_encode:
            return None
            
        # Convert numpy array to bytes, then to base64
        frame_base64 = base64.b64encode(buffer.tobytes()).decode('utf-8')
        
        return frame_base64
        
    async def main_loop(self):
        """Main processing loop"""
        print("Starting main processing loop...")
        print("🎮 Move your hands up/down to steer - level hands = straight")
        print("📹 AR camera stream active for marker detection")
        self.running = True
        
        while self.running:
            try:
                # Prepare message data
                message_data = {
                    'timestamp': time.time() * 1000,
                    'type': 'system_data'
                }
                
                # Process hand tracking
                if self.hand_tracker:
                    hand_data = self.hand_tracker.process_frame()
                    if hand_data:
                        message_data.update({
                            'hands_detected': hand_data.get('hands_detected', 0),
                            'steering_angle': hand_data.get('steering_angle', 0),
                            'confidence': hand_data.get('confidence', 0),
                            'left_hand': hand_data.get('left_hand'),
                            'right_hand': hand_data.get('right_hand')
                        })
                    else:
                        # No hand data available
                        message_data.update({
                            'hands_detected': 0,
                            'steering_angle': 0,
                            'confidence': 0,
                            'left_hand': None,
                            'right_hand': None
                        })
                else:
                    # Hand tracker not initialized
                    message_data.update({
                        'hands_detected': 0,
                        'steering_angle': 0,
                        'confidence': 0,
                        'left_hand': None,
                        'right_hand': None
                    })
                
                # Capture AR camera frame
                ar_frame = self.capture_ar_frame()
                if ar_frame:
                    message_data['ar_frame'] = ar_frame
                    message_data['ar_frame_available'] = True
                else:
                    message_data['ar_frame_available'] = False
                
                # Send combined data via WebSocket
                await self.websocket_server.broadcast(message_data)
                
                # Debug output for steering
                if message_data.get('hands_detected', 0) >= 2:
                    angle = message_data.get('steering_angle', 0)
                    confidence = message_data.get('confidence', 0)
                    ar_status = "AR OK" if ar_frame else "AR FAIL"
                    print(f"Steering: {angle:6.1f}° | Confidence: {confidence:.2f} | {ar_status}")
                
                # Small delay to prevent excessive CPU usage
                await asyncio.sleep(0.033)  # ~30 FPS
                
            except KeyboardInterrupt:
                print("\nShutting down...")
                self.running = False
            except Exception as e:
                print(f"Error in main loop: {e}")
                
    async def run(self):
        """Run the complete system"""
        # Setup cameras
        if not self.setup_cameras():
            print("ERROR: Camera setup failed!")
            return
            
        # Initialize hand tracker
        if not self.initialize_hand_tracker():
            print("ERROR: Failed to initialize hand tracker!")
            return
            
        # Initialize AR camera
        if not self.initialize_ar_camera():
            print("ERROR: Failed to initialize AR camera!")
            return
            
        # Start WebSocket server
        await self.websocket_server.start()
        
        # Run main loop
        await self.main_loop()
        
        # Cleanup
        if self.hand_tracker:
            self.hand_tracker.cleanup()
        if self.ar_camera:
            self.ar_camera.release()
        cv2.destroyAllWindows()
        await self.websocket_server.stop()

if __name__ == "__main__":
    system = GhostWheelSystem()
    asyncio.run(system.run())