import cv2
import platform

class CameraManager:
    def __init__(self):
        self.max_cameras_to_check = 10
        
    def discover_cameras(self):
        """Discover all available cameras"""
        available_cameras = []
        
        print("Scanning for cameras...")
        
        for i in range(self.max_cameras_to_check):
            cap = cv2.VideoCapture(i)
            
            if cap.isOpened():
                # Try to read a frame to confirm camera works
                ret, frame = cap.read()
                if ret:
                    # Get camera info
                    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                    fps = cap.get(cv2.CAP_PROP_FPS)
                    
                    camera_info = f"Camera {i} - {width}x{height} @ {fps:.1f}fps"
                    available_cameras.append(camera_info)
                    print(f"  Found: {camera_info}")
                    
            cap.release()
            
        return available_cameras
        
    def test_camera(self, camera_id):
        """Test if a specific camera works"""
        cap = cv2.VideoCapture(camera_id)
        
        if not cap.isOpened():
            return False
            
        ret, frame = cap.read()
        cap.release()
        
        return ret and frame is not None