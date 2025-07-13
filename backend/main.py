import cv2
import asyncio
import json
import time
import base64
import numpy as np
import warnings

# Suppress protobuf deprecation warnings from MediaPipe
warnings.filterwarnings("ignore", category=UserWarning, module="google.protobuf.symbol_database")

from camera_manager import CameraManager
from hand_tracker import HandTracker
from websocket_server import WebSocketServer

class GhostWheelSystem:
    def __init__(self):
        self.camera_manager = CameraManager()
        self.hand_tracker = None
        self.websocket_server = WebSocketServer()
        
        # Camera configuration
        self.hand_camera_id = None
        self.ar_camera_id = None
        self.ar_camera = None
        
        # System state
        self.running = False
        self.video_frame_skip = 2  # Send every nth frame to reduce bandwidth
        self.frame_counter = 0
        
    def setup_cameras(self):
        """Setup camera selection interface for both hand tracking and AR surface"""
        print("=== Ghost Wheel - Dual Camera Setup ===")
        
        # Discover available cameras
        available_cameras = self.camera_manager.discover_cameras()
        
        if not available_cameras:
            print("ERROR: No cameras found!")
            return False
            
        if len(available_cameras) < 2:
            print("ERROR: This system requires 2 cameras!")
            print("Found only:", len(available_cameras))
            print("You can use the same camera for both (not recommended)")
            
        print(f"\nFound {len(available_cameras)} camera(s):")
        for i, camera_info in enumerate(available_cameras):
            print(f"  {i}: {camera_info}")
            
        # Select hand tracking camera
        print("\n📱 HAND TRACKING CAMERA:")
        print("   - Should have good view of your hands")
        print("   - Usually the laptop built-in camera")
        
        while True:
            try:
                choice = input(f"Select camera for HAND TRACKING (0-{len(available_cameras)-1}): ")
                self.hand_camera_id = int(choice)
                if 0 <= self.hand_camera_id < len(available_cameras):
                    break
                print("Invalid selection!")
            except ValueError:
                print("Please enter a number!")
                
        # Select AR surface camera
        print("\n🎯 AR SURFACE CAMERA:")
        print("   - Should point at the AR marker surface")
        print("   - Usually an external USB camera or smartphone")
        print("   - Can be the same as hand tracking (but not optimal)")
        
        while True:
            try:
                choice = input(f"Select camera for AR SURFACE (0-{len(available_cameras)-1}): ")
                self.ar_camera_id = int(choice)
                if 0 <= self.ar_camera_id < len(available_cameras):
                    break
                print("Invalid selection!")
            except ValueError:
                print("Please enter a number!")
                
        print(f"\n✅ Configuration:")
        print(f"   Hand Tracking: Camera {self.hand_camera_id}")
        print(f"   AR Surface: Camera {self.ar_camera_id}")
        
        if self.hand_camera_id == self.ar_camera_id:
            print("⚠️  WARNING: Using same camera for both functions")
            print("   This may affect performance and usability")
        
        return True
        
    def initialize_hand_tracker(self):
        """Initialize MediaPipe hand tracker"""
        if self.hand_camera_id is None:
            print("ERROR: No camera selected for hand tracking!")
            return False
            
        print("🤲 Initializing hand tracker...")
        self.hand_tracker = HandTracker(camera_id=self.hand_camera_id)
        return self.hand_tracker.initialize()
        
    def initialize_ar_camera(self):
        """Initialize AR surface camera"""
        if self.ar_camera_id is None:
            print("ERROR: No camera selected for AR surface!")
            return False
            
        print("🎯 Initializing AR surface camera...")
        self.ar_camera = cv2.VideoCapture(self.ar_camera_id)
        
        if not self.ar_camera.isOpened():
            print(f"ERROR: Cannot open AR camera {self.ar_camera_id}")
            return False
            
        # Set camera properties for optimal AR performance
        self.ar_camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self.ar_camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        self.ar_camera.set(cv2.CAP_PROP_FPS, 30)
        
        # Test frame capture
        ret, test_frame = self.ar_camera.read()
        if not ret:
            print("ERROR: Cannot read from AR camera")
            return False
            
        print(f"✅ AR camera initialized: {test_frame.shape}")
        return True
        
    def capture_ar_frame(self):
        """Capture and encode AR frame for transmission"""
        if not self.ar_camera or not self.ar_camera.isOpened():
            return None
            
        ret, frame = self.ar_camera.read()
        if not ret:
            return None
            
        # Resize frame if needed (reduce bandwidth)
        height, width = frame.shape[:2]
        if width > 640:
            scale = 640 / width
            new_width = int(width * scale)
            new_height = int(height * scale)
            frame = cv2.resize(frame, (new_width, new_height))
            
        # Encode frame as JPEG for transmission
        encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), 80]  # Adjust quality vs bandwidth
        success, encoded_img = cv2.imencode('.jpg', frame, encode_param)
        
        if success:
            # Convert the encoded image (numpy array) to bytes for base64 encoding
            # encoded_img is a 1D numpy array containing JPEG file data
            jpeg_bytes = encoded_img.tobytes()
            img_base64 = base64.b64encode(jpeg_bytes).decode('utf-8')
            
            return {
                'frame_data': img_base64,
                'width': frame.shape[1],
                'height': frame.shape[0],
                'timestamp': time.time() * 1000,
                'format': 'jpeg'
            }
        
        return None
        
    async def main_loop(self):
        """Main processing loop - handles both cameras and data fusion"""
        print("🚀 Starting dual camera processing...")
        print("📱 Hand tracking camera active")
        print("🎯 AR surface camera streaming") 
        print("🔄 Data fusion and WebSocket broadcasting")
        print("\n" + "="*50)
        
        self.running = True
        frame_count = 0
        last_fps_time = time.time()
        last_client_count = 0
        
        while self.running:
            try:
                # Get hand tracking data
                hand_data = None
                if self.hand_tracker:
                    hand_data = self.hand_tracker.process_frame()
                    
                # Get AR frame (skip frames to reduce bandwidth)
                ar_frame_data = None
                self.frame_counter += 1
                if self.frame_counter % self.video_frame_skip == 0:
                    ar_frame_data = self.capture_ar_frame()
                
                # Prepare combined data packet
                combined_data = {
                    'timestamp': time.time() * 1000,
                    'type': 'ghost_wheel_data'
                }
                
                # Add hand tracking data
                if hand_data:
                    combined_data.update({
                        'hands_detected': hand_data.get('hands_detected', 0),
                        'steering_angle': hand_data.get('steering_angle', 0),
                        'confidence': hand_data.get('confidence', 0),
                        'left_hand': hand_data.get('left_hand'),
                        'right_hand': hand_data.get('right_hand')
                    })
                else:
                    combined_data.update({
                        'hands_detected': 0,
                        'steering_angle': 0,
                        'confidence': 0,
                        'left_hand': None,
                        'right_hand': None
                    })
                
                # Add AR frame data
                if ar_frame_data:
                    combined_data['ar_frame'] = ar_frame_data
                
                # Broadcast to all connected clients
                await self.websocket_server.broadcast(combined_data)
                
                # Status reporting
                frame_count += 1
                current_time = time.time()
                current_client_count = len(self.websocket_server.clients)
                
                if current_time - last_fps_time >= 5.0:  # Every 5 seconds
                    fps = frame_count / (current_time - last_fps_time)
                    
                    status_msg = f"📊 Status - FPS: {fps:.1f} | Clients: {current_client_count}"
                    if hand_data and hand_data.get('hands_detected', 0) >= 2:
                        angle = hand_data.get('steering_angle', 0)
                        confidence = hand_data.get('confidence', 0)
                        status_msg += f" | Steering: {angle:6.1f}° ({confidence:.2f})"
                    
                    print(status_msg)
                    frame_count = 0
                    last_fps_time = current_time
                
                # Client connection changes
                if current_client_count != last_client_count:
                    print(f"🔗 Clients connected: {current_client_count}")
                    last_client_count = current_client_count
                
                # Control loop timing
                await asyncio.sleep(0.016)  # ~60 FPS target
                
            except KeyboardInterrupt:
                print("\n🛑 Shutdown requested...")
                self.running = False
            except Exception as e:
                print(f"❌ Error in main loop: {e}")
                # Continue running on non-critical errors
                await asyncio.sleep(0.1)
                
    async def run(self):
        """Run the complete dual-camera system"""
        print("🎮" + "="*60)
        print("🎮 GHOST WHEEL - DUAL CAMERA AR SYSTEM")
        print("🎮" + "="*60)
        
        # Setup cameras
        if not self.setup_cameras():
            print("❌ Camera setup failed!")
            return
            
        # Initialize hand tracker
        if not self.initialize_hand_tracker():
            print("❌ Failed to initialize hand tracker!")
            return
            
        # Initialize AR camera
        if not self.initialize_ar_camera():
            print("❌ Failed to initialize AR camera!")
            return
            
        # Start WebSocket server
        print("🔌 Starting WebSocket server...")
        await self.websocket_server.start()
        
        print("\n" + "🎮" + "="*60)
        print("🎮 SYSTEM READY - DUAL CAMERA MODE")
        print("🎮" + "="*60)
        print("📱 Hand tracking: Camera", self.hand_camera_id)
        print("🎯 AR surface: Camera", self.ar_camera_id) 
        print("🔗 WebSocket: ws://localhost:8765")
        print("🌐 Frontend should connect to receive both data streams")
        print("🎮" + "="*60)
        print("📋 Instructions:")
        print("   1. Point AR camera at marker surface")
        print("   2. Position hands in view of hand tracking camera")
        print("   3. Open frontend web application")
        print("   4. Move hands up/down to steer virtual car")
        print("🎮" + "="*60 + "\n")
        
        # Run main processing loop
        await self.main_loop()
        
        # Cleanup
        print("🧹 Cleaning up...")
        if self.hand_tracker:
            self.hand_tracker.cleanup()
        if self.ar_camera:
            self.ar_camera.release()
        cv2.destroyAllWindows()
        await self.websocket_server.stop()
        print("✅ System stopped cleanly.")

if __name__ == "__main__":
    try:
        system = GhostWheelSystem()
        asyncio.run(system.run())
    except KeyboardInterrupt:
        print("\n🛑 Shutdown requested by user")
    except Exception as e:
        print(f"💥 System error: {e}")
        import traceback
        traceback.print_exc()