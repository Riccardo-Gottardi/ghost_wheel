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
        self.running = False
        
    def setup_camera(self):
        """Setup camera selection interface - simplified for hand tracking only"""
        print("=== Ghost Wheel - Hand Detection Setup ===")
        
        # Discover available cameras
        available_cameras = self.camera_manager.discover_cameras()
        
        if not available_cameras:
            print("ERROR: No cameras found!")
            return False
            
        print(f"\nFound {len(available_cameras)} camera(s):")
        for i, camera_info in enumerate(available_cameras):
            print(f"  {i}: {camera_info}")
            
        # Auto-select if only one camera available
        if len(available_cameras) == 1:
            self.hand_camera_id = 0
            print(f"\nAuto-selected camera 0 for hand tracking")
        else:
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
                
        print(f"\nConfiguration:")
        print(f"  Hand Tracking Camera: {self.hand_camera_id}")
        
        return True
    def initialize_hand_tracker(self):
        """Initialize MediaPipe hand tracker"""
        if self.hand_camera_id is None:
            print("ERROR: No camera selected for hand tracking!")
            return False
            
        try:
            print("Initializing hand tracker...")
            self.hand_tracker = HandTracker(camera_id=self.hand_camera_id)
            
            if not self.hand_tracker.initialize():
                print("ERROR: Failed to initialize hand tracker!")
                self.hand_tracker = None
                return False
                
            print("Hand tracker initialized successfully")
            return True
            
        except Exception as e:
            print(f"Error initializing hand tracker: {e}")
            self.hand_tracker = None
            return False
            
    async def main_loop(self):
        """High-performance main loop with optimized logging"""
        print("\n=== Starting High-Performance Hand Detection ===")
        print("Move your hands in front of the camera to control the steering")
        print("Press Ctrl+C to stop")
        
        if not self.hand_tracker:
            print("ERROR: Hand tracker not initialized!")
            return
        
        self.running = True
        
        # Performance monitoring
        frame_count = 0
        start_time = time.time()
        last_print_time = start_time
        print_interval = 1.0  # Print stats every 1 second
        
        # Performance timing
        total_process_time = 0
        total_broadcast_time = 0
        
        try:
            while self.running:
                loop_start = time.time()
                
                # Process hand tracking frame
                process_start = time.time()
                hand_data = self.hand_tracker.process_frame()
                process_time = time.time() - process_start
                total_process_time += process_time
                
                if hand_data:
                    # Send data to connected clients
                    broadcast_start = time.time()
                    await self.websocket_server.broadcast(hand_data)
                    broadcast_time = time.time() - broadcast_start
                    total_broadcast_time += broadcast_time
                    
                    frame_count += 1
                    current_time = time.time()
                    
                    # Print performance stats (limited frequency)
                    if current_time - last_print_time >= print_interval:
                        elapsed = current_time - start_time
                        fps = frame_count / elapsed if elapsed > 0 else 0
                        avg_process = (total_process_time / frame_count * 1000) if frame_count > 0 else 0
                        avg_broadcast = (total_broadcast_time / frame_count * 1000) if frame_count > 0 else 0
                        
                        hands = hand_data.get('hands_detected', 0)
                        angle = hand_data.get('steering_angle', 0)
                        confidence = hand_data.get('confidence', 0)
                        
                        print(f"FPS: {fps:5.1f} | Hands: {hands} | Steering: {angle:6.1f}° | "
                              f"Process: {avg_process:4.1f}ms | Broadcast: {avg_broadcast:4.1f}ms")
                        
                        last_print_time = current_time
                else:
                    # Send empty data if frame processing fails
                    empty_data = {
                        'timestamp': int(time.time() * 1000),
                        'hands_detected': 0,
                        'steering_angle': 0,
                        'confidence': 0,
                        'left_hand': None,
                        'right_hand': None,
                        'status': 'no_frame'
                    }
                    await self.websocket_server.broadcast(empty_data)
                
                # Minimal delay for maximum performance
                # Remove or reduce this if you want maximum speed
                await asyncio.sleep(0.001)  # 1ms delay
                
        except KeyboardInterrupt:
            print("\nShutdown requested by user")
        except Exception as e:
            print(f"Error in main loop: {e}")
        finally:
            self.running = False
            
            # Final performance report
            total_time = time.time() - start_time
            if total_time > 0 and frame_count > 0:
                final_fps = frame_count / total_time
                print(f"\n=== Performance Summary ===")
                print(f"Total runtime: {total_time:.1f}s")
                print(f"Frames processed: {frame_count}")
                print(f"Average FPS: {final_fps:.1f}")
                print(f"Average processing time: {total_process_time/frame_count*1000:.1f}ms per frame")
                print(f"Average broadcast time: {total_broadcast_time/frame_count*1000:.1f}ms per frame")
            
    async def run(self):
        """Main entry point"""
        print("=== Ghost Wheel Backend - Hand Detection Service ===")
        
        # Setup camera
        if not self.setup_camera():
            print("ERROR: Camera setup failed!")
            return
            
        # Initialize hand tracker
        if not self.initialize_hand_tracker():
            print("ERROR: Failed to initialize hand tracker!")
            return
            
        print(f"\nStarting WebSocket server on ws://localhost:8765")
        
        try:
            # Start WebSocket server
            await self.websocket_server.start()
            
            # Run main loop
            await self.main_loop()
            
        except Exception as e:
            print(f"Error during execution: {e}")
        finally:
            # Cleanup
            print("\nCleaning up...")
            if self.hand_tracker:
                self.hand_tracker.cleanup()
            await self.websocket_server.stop()
            print("Shutdown complete")

if __name__ == "__main__":
    system = GhostWheelSystem()
    asyncio.run(system.run())