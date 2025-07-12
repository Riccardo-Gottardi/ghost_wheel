import cv2
import asyncio
import json
import time
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
        self.running = False
        
    def setup_cameras(self):
        """Setup camera selection interface"""
        print("=== Ghost Wheel - Camera Setup ===")
        
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
                
        # Select AR surface camera (for future sprints)
        while True:
            try:
                choice = input(f"Select camera for AR SURFACE (0-{len(available_cameras)-1}): ")
                self.ar_camera_id = int(choice)
                if 0 <= self.ar_camera_id < len(available_cameras):
                    break
                print("Invalid selection!")
            except ValueError:
                print("Please enter a number!")
                
        print(f"\nConfiguration:")
        print(f"  Hand Tracking: Camera {self.hand_camera_id}")
        print(f"  AR Surface: Camera {self.ar_camera_id}")
        
        # Validate that cameras were properly selected
        if self.hand_camera_id is None or self.ar_camera_id is None:
            print("ERROR: Camera selection incomplete!")
            return False
        
        return True
        
    def initialize_hand_tracker(self):
        """Initialize MediaPipe hand tracker"""
        if self.hand_camera_id is None:
            print("ERROR: No camera selected for hand tracking!")
            return False
            
        print("Initializing hand tracker...")
        self.hand_tracker = HandTracker(camera_id=self.hand_camera_id)
        return self.hand_tracker.initialize()
        
    async def main_loop(self):
        """Main processing loop"""
        print("Starting main processing loop...")
        print("🎮 Move your hands up/down to steer - level hands = straight")
        self.running = True
        
        while self.running:
            try:
                # Process hand tracking only if initialized
                if self.hand_tracker:
                    hand_data = self.hand_tracker.process_frame()
                    
                    if hand_data:
                        # Send data via WebSocket
                        await self.websocket_server.broadcast(hand_data)
                        
                        # Debug output
                        if hand_data.get('hands_detected', 0) >= 2:
                            angle = hand_data.get('steering_angle', 0)
                            confidence = hand_data.get('confidence', 0)
                            print(f"Steering: {angle:6.1f}° | Confidence: {confidence:.2f}")
                else:
                    # If hand tracker not initialized, send empty data
                    empty_data = {
                        'timestamp': time.time() * 1000,
                        'hands_detected': 0,
                        'steering_angle': 0,
                        'confidence': 0,
                        'left_hand': None,
                        'right_hand': None
                    }
                    await self.websocket_server.broadcast(empty_data)
                
                # Small delay to prevent excessive CPU usage
                await asyncio.sleep(0.016)  # ~60 FPS
                
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
            
        # Start WebSocket server
        await self.websocket_server.start()
        
        # Run main loop
        await self.main_loop()
        
        # Cleanup
        if self.hand_tracker:
            self.hand_tracker.cleanup()
        await self.websocket_server.stop()

if __name__ == "__main__":
    system = GhostWheelSystem()
    asyncio.run(system.run())