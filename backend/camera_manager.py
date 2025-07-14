import cv2
import platform

class CameraManager:
    """Simplified camera manager for camera discovery"""
    
    def __init__(self):
        self.system = platform.system()
        
    def discover_cameras(self, max_cameras=10):
        """Discover available cameras with improved detection"""
        print("Scanning for available cameras...")
        available_cameras = []
        
        for camera_id in range(max_cameras):
            cap = cv2.VideoCapture(camera_id)
            
            # Test if camera is accessible
            if cap.isOpened():
                # Try to read a frame to verify camera works
                ret, frame = cap.read()
                if ret and frame is not None:
                    # Get camera properties
                    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                    fps = int(cap.get(cv2.CAP_PROP_FPS))
                    
                    camera_info = f"Camera {camera_id} - {width}x{height} @ {fps}fps"
                    available_cameras.append(camera_info)
                    print(f"  Found: {camera_info}")
                
                cap.release()
            
        if not available_cameras:
            print("  No cameras detected")
        else:
            print(f"  Total cameras found: {len(available_cameras)}")
            
        return available_cameras
    
    def test_camera_performance(self, camera_id):
        """Test camera performance and return basic stats"""
        try:
            cap = cv2.VideoCapture(camera_id)
            
            if not cap.isOpened():
                return None
                
            # Test frame capture speed
            import time
            start_time = time.time()
            frames_captured = 0
            
            for _ in range(30):  # Test 30 frames
                ret, frame = cap.read()
                if ret:
                    frames_captured += 1
                    
            elapsed_time = time.time() - start_time
            actual_fps = frames_captured / elapsed_time if elapsed_time > 0 else 0
            
            cap.release()
            
            return {
                'camera_id': camera_id,
                'actual_fps': actual_fps,
                'frames_captured': frames_captured
            }
            
        except Exception as e:
            print(f"Error testing camera {camera_id}: {e}")
            return None