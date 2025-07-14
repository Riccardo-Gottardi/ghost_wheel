// Ghost Wheel - WASD Controls
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Global variables for camera management
let currentStream = null;
let availableCameras = [];
let isProcessingStarted = false;
let isEnumerating = false;

// Global variables for car control system
let carSystem = {
    // Car physics
    position: { x: 0, z: 0 }, // Virtual position on infinite plane
    velocity: { x: 0, z: 0 },
    rotation: 0, // Car rotation in radians
    speed: 0,
    
    // Control parameters
    acceleration: 0.012,
    maxSpeed: 0.40,
    turnSpeed: 0.05,
    friction: 0.95,
    brakeForce: 0.85,
    
    // Input state
    keys: {
        forward: false,
        backward: false,
        left: false,
        right: false,
        brake: false
    }
};

// AR system variables
let arSystem = {
    markerDetected: false,
    lastDetectionTime: 0,
    planeMatrix: new THREE.Matrix4(),
    planePosition: new THREE.Vector3(),
    planeRotation: new THREE.Euler(),
    initialized: false,
    planeEstablished: false,  // Plane established, stop AR processing
    searchingForMarker: true  // Currently searching for marker
};

// Three.js objects
let scene, camera, renderer, container, carModel, gridPlane;
let arController, arLoaded = false;

// Performance optimization
let lastProcessTime = 0;
const processingInterval = 1000 / 30; // 30fps AR processing

// Initialize the application
window.onload = function() {
    console.log('🚗 Ghost Wheel starting...');
    
    // Check for required files
    checkRequiredFiles().then(() => {
        initializeCameraSelection();
    }).catch((error) => {
        console.warn('Some files missing, starting in fallback mode:', error);
        initializeCameraSelection();
    });
}

// Check if required files exist
async function checkRequiredFiles() {
    const requiredFiles = [
        'camera_para.dat',
        'artoolkit.min.js'
    ];
    
    const results = await Promise.allSettled(
        requiredFiles.map(file => 
            fetch(file, { method: 'HEAD' })
                .then(response => {
                    if (!response.ok) throw new Error(`${file} not found`);
                    console.log(`✅ Found: ${file}`);
                    return file;
                })
        )
    );
    
    const missing = results
        .filter(result => result.status === 'rejected')
        .map(result => result.reason.message);
    
    if (missing.length > 0) {
        console.warn('❌ Missing files:', missing.join(', '));
        throw new Error(`Missing: ${missing.join(', ')}`);
    }
    
    console.log('✅ All required files found');
    return true;
}

// Initialize camera selection interface
function initializeCameraSelection() {
    const video = document.getElementById("myvideo");
    const cameraSelect = document.getElementById('camera-select');
    const refreshButton = document.getElementById('refresh-cameras');
    
    // Set up video metadata handler
    video.onloadedmetadata = () => {
        if (!isProcessingStarted) {
            // Add small delay to ensure video is fully ready
            setTimeout(() => {
                start_processing();
                isProcessingStarted = true;
            }, 100);
        }
    };
    
    // Debounced camera selection change handler
    let changeTimeout;
    cameraSelect.addEventListener('change', async (event) => {
        const selectedDeviceId = event.target.value;
        if (selectedDeviceId && !isEnumerating) {
            // Clear any pending change
            clearTimeout(changeTimeout);
            // Debounce the change to prevent rapid switching
            changeTimeout = setTimeout(async () => {
                cameraSelect.disabled = true;
                await startCameraStream(selectedDeviceId);
                cameraSelect.disabled = false;
            }, 200);
        }
    });
    
    // Debounced refresh button handler
    let refreshTimeout;
    refreshButton.addEventListener('click', async () => {
        clearTimeout(refreshTimeout);
        refreshTimeout = setTimeout(async () => {
            refreshButton.disabled = true;
            refreshButton.textContent = 'Refreshing...';
            await enumerateAndPopulateCameras();
            refreshButton.disabled = false;
            refreshButton.textContent = 'Refresh';
        }, 300);
    });
    
    // Defer initial camera enumeration to not block UI
    setTimeout(() => {
        enumerateAndPopulateCameras();
    }, 500);
}

// Enumerate and populate available cameras
async function enumerateAndPopulateCameras() {
    if (isEnumerating) return; // prevent multiple simultaneous enumerations
    isEnumerating = true;
    
    const cameraSelect = document.getElementById('camera-select');
    
    try {
        // Show loading state
        cameraSelect.innerHTML = '<option value="">Detecting cameras...</option>';
        
        // Request minimal permission first
        const tempStream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 320, height: 240 }, 
            audio: false 
        });
        tempStream.getTracks().forEach(track => track.stop()); // immediately stop
        
        // Enumerate devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        availableCameras = devices.filter(device => device.kind === 'videoinput');
        
        cameraSelect.innerHTML = '';
        
        if (availableCameras.length === 0) {
            cameraSelect.innerHTML = '<option value="">No cameras found</option>';
            return;
        }
        
        // Add default option
        cameraSelect.innerHTML = '<option value="">Select a camera...</option>';
        
        // Populate dropdown with available cameras
        availableCameras.forEach((camera, index) => {
            const option = document.createElement('option');
            option.value = camera.deviceId;
            option.textContent = camera.label || `Camera ${index + 1}`;
            cameraSelect.appendChild(option);
        });
        
        // Auto-select and start first camera if only one available
        if (availableCameras.length === 1) {
            cameraSelect.value = availableCameras[0].deviceId;
            await startCameraStream(availableCameras[0].deviceId);
        } else if (availableCameras.length > 1) {
            // Auto-select first camera but don't start it yet
            cameraSelect.selectedIndex = 1; // skip "Select a camera..." option
        }
        
    } catch (error) {
        console.error('Error enumerating cameras:', error);
        cameraSelect.innerHTML = '<option value="">Camera access denied</option>';
    } finally {
        isEnumerating = false;
    }
}

// Start camera stream with specific device ID
async function startCameraStream(deviceId) {
    const video = document.getElementById("myvideo");
    
    try {
        // Stop current stream if exists
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
        }
        
        // Optimized constraints for better performance
        const constraints = {
            audio: false,
            video: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                width: { ideal: 640, max: 1280 },
                height: { ideal: 480, max: 720 },
                frameRate: { ideal: 30, max: 30 }
            }
        };
        
        // Get user media with specific device
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        currentStream = stream;
        video.srcObject = stream;
        
        // Log actual stream settings for debugging
        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings();
        console.log('✅ Camera stream started:', {
            resolution: `${settings.width}x${settings.height}`,
            frameRate: settings.frameRate,
            deviceId: settings.deviceId
        });
        
    } catch (error) {
        console.error('Error starting camera stream:', error);
        
        // Fallback with even lower resolution
        try {
            const fallbackConstraints = { 
                audio: false, 
                video: { 
                    width: { ideal: 640 }, 
                    height: { ideal: 480 },
                    frameRate: { ideal: 30 }
                } 
            };
            const fallbackStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
            currentStream = fallbackStream;
            video.srcObject = fallbackStream;
            console.log('Using fallback camera settings');
        } catch (fallbackError) {
            console.error('Fallback also failed, using video file:', fallbackError);
            video.src = "marker.webm";
        }
    }
}

// Main initialization function
function start_processing() {
    const video = document.getElementById("myvideo");
    const canvas = document.getElementById("mycanvas");
    
    // Setup canvas
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    video.width = video.height = 0; // Hide video element
    
    // Initialize Three.js
    setupThreeJS(canvas, video);
    
    // Initialize AR tracking
    setupARTracking(video);
    
    // Setup keyboard controls
    setupKeyboardControls();
    
    // Start render loop
    renderLoop();
    
    console.log('🚗 Ghost Wheel initialized - Use WASD to control the car!');
}

// Three.js setup
function setupThreeJS(canvas, video) {
    // Renderer
    renderer = new THREE.WebGLRenderer({ 
        canvas: canvas,
        antialias: true,
        alpha: false
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Scene
    scene = new THREE.Scene();
    
    // Camera - will be set by ARToolKit
    camera = new THREE.Camera();
    scene.add(camera);
    
    // Video background
    const videoTexture = new THREE.VideoTexture(video);
    videoTexture.colorSpace = THREE.SRGBColorSpace;
    videoTexture.generateMipmaps = false;
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    scene.background = videoTexture;
    
    // Container for AR content
    container = new THREE.Object3D();
    container.matrixAutoUpdate = false;
    scene.add(container);
    
    // Create infinite grid plane
    createInfiniteGrid();
    
    // Load car model
    loadCarModel();
    
    // Lighting
    setupLighting();
}

// Create infinite grid visualization
function createInfiniteGrid() {
    const gridSize = 20;
    const gridDivisions = 40;
    
    // Create grid geometry
    const gridGeometry = new THREE.BufferGeometry();
    const vertices = [];
    const colors = [];
    
    const gridColor = new THREE.Color(0x4CAF50);
    const centerColor = new THREE.Color(0xFF5722);
    
    // Create grid lines
    for (let i = 0; i <= gridDivisions; i++) {
        const position = (i / gridDivisions - 0.5) * gridSize;
        
        // Vertical lines
        vertices.push(-gridSize/2, 0, position, gridSize/2, 0, position);
        // Horizontal lines  
        vertices.push(position, 0, -gridSize/2, position, 0, gridSize/2);
        
        // Colors - highlight center lines
        const isCenter = i === gridDivisions / 2;
        const color = isCenter ? centerColor : gridColor;
        
        colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
        colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }
    
    gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    gridGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    // Grid material
    const gridMaterial = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        depthWrite: false
    });
    
    gridPlane = new THREE.LineSegments(gridGeometry, gridMaterial);
    gridPlane.position.y = 0.01; // Slightly above plane to avoid z-fighting
    container.add(gridPlane);
}

// Load 3D car model
function loadCarModel() {
    const loader = new GLTFLoader();
    
    // Try to load the GLTF model first
    loader.load('retro_cartoon_car.glb', 
        // Success callback
        (gltf) => {
            carModel = gltf.scene;
            
            // Setup car properties - DOUBLE SIZE (was 0.3, now 0.6)
            carModel.scale.set(1.7, 1.7, 1.7);
            carModel.position.set(0, 0.1, 0); // Slightly higher due to larger size
            
            // Enable shadows
            carModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            
            container.add(carModel);
            console.log('✅ Car model loaded successfully (2x size)');
        }, 
        // Progress callback
        undefined, 
        // Error callback
        (error) => {
            console.warn('GLTF model not found, using fallback car:', error.message);
            createFallbackCar();
        }
    );
}

// Create simple fallback car if GLTF fails to load
function createFallbackCar() {
    carModel = new THREE.Group();
    
    // Car body - DOUBLE SIZE (was 0.4x0.15x0.8, now 0.8x0.3x1.6)
    const bodyGeometry = new THREE.BoxGeometry(0.8, 0.3, 1.6);
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0xff0000 });
    const carBody = new THREE.Mesh(bodyGeometry, bodyMaterial);
    carBody.position.y = 0.2; // Higher due to larger size
    carBody.castShadow = true;
    carModel.add(carBody);
    
    // Car wheels - DOUBLE SIZE (was 0.08, now 0.16)
    const wheelGeometry = new THREE.CylinderGeometry(0.16, 0.16, 0.1);
    const wheelMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
    
    // Wheel positions adjusted for larger car
    const wheelPositions = [
        [-0.3, 0.1, 0.5],   // Front left
        [0.3, 0.1, 0.5],    // Front right
        [-0.3, 0.1, -0.5],  // Rear left
        [0.3, 0.1, -0.5]    // Rear right
    ];
    
    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.position.set(...pos);
        wheel.rotation.z = Math.PI / 2;
        wheel.castShadow = true;
        carModel.add(wheel);
    });
    
    carModel.position.set(0, 0.04, 0); // Slightly higher due to larger size
    container.add(carModel);
    
    console.log('✅ Fallback car created (2x size)');
}

// Setup lighting system
function setupLighting() {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    container.add(ambientLight);
    
    // Directional light with shadows
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(2, 4, 2);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 10;
    directionalLight.shadow.camera.left = -5;
    directionalLight.shadow.camera.right = 5;
    directionalLight.shadow.camera.top = 5;
    directionalLight.shadow.camera.bottom = -5;
    container.add(directionalLight);
}

// Setup AR marker tracking
function setupARTracking(video) {
    console.log('🎯 Initializing AR tracking...');
    
    // Check if ARController is available
    if (typeof ARController === 'undefined') {
        console.error('❌ ARController not found - artoolkit.min.js missing?');
        setupFallbackCamera();
        return;
    }
    
    try {
        arController = new ARController(video, 'camera_para.dat');
        
        arController.onload = () => {
            try {
                console.log('✅ AR Controller loaded');
                
                // Set camera projection matrix
                const cameraMatrix = arController.getCameraMatrix();
                if (cameraMatrix && cameraMatrix.length === 16) {
                    camera.projectionMatrix.fromArray(cameraMatrix);
                    console.log('✅ Camera matrix applied');
                } else {
                    console.error('❌ Invalid camera matrix');
                    setupFallbackCamera();
                    return;
                }
                
                // Configure marker detection for Matrix Code markers
                arController.setPatternDetectionMode(artoolkit.AR_MATRIX_CODE_DETECTION);
                console.log('✅ Matrix code detection enabled');
                
                // Handle marker detection
                arController.addEventListener('getMarker', handleMarkerDetection);
                
                arLoaded = true;
                
                // Update UI to show AR is active
                document.getElementById('marker-status').textContent = 'Searching...';
                document.getElementById('marker-status').className = 'status-warning';
                
                console.log('🎯 AR System ready - Show matrix marker to camera');
                
            } catch (error) {
                console.error('❌ Error in AR controller setup:', error);
                setupFallbackCamera();
            }
        };
        
        arController.onerror = (error) => {
            console.error('❌ AR Controller failed to load:', error);
            setupFallbackCamera();
        };
        
    } catch (error) {
        console.error('❌ Failed to create AR Controller:', error);
        setupFallbackCamera();
    }
}

// Fallback camera setup if AR fails
function setupFallbackCamera() {
    console.log('⚠️ Setting up fallback camera (AR disabled)');
    
    // Create a basic perspective camera
    const canvas = document.getElementById("mycanvas");
    const aspect = canvas.width / canvas.height;
    
    // Replace the generic camera with a perspective camera
    scene.remove(camera);
    camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    camera.position.set(0, 2, 3);
    camera.lookAt(0, 0, 0);
    scene.add(camera);
    
    // Set container visible immediately in fallback mode
    arSystem.initialized = true;
    arSystem.markerDetected = false; // No marker detection in fallback
    
    console.log('✅ Fallback camera initialized - Controls work without AR');
    
    // Show warning in UI
    document.getElementById('marker-status').textContent = 'AR Disabled (Files Missing)';
    document.getElementById('marker-status').className = 'status-error';
}

// Handle marker detection events
function handleMarkerDetection(event) {
    if (event.data.marker.idMatrix !== -1 && arSystem.searchingForMarker) {
        console.log(`🎯 Marker detected! ID: ${event.data.marker.idMatrix}`);
        
        // Update plane reference from marker
        updatePlaneReference(event.data.matrixGL_RH);
        
        arSystem.markerDetected = true;
        arSystem.lastDetectionTime = performance.now();
        arSystem.planeEstablished = true;  // PLANE ESTABLISHED!
        arSystem.searchingForMarker = false; // STOP SEARCHING!
        
        // Update UI
        document.getElementById('marker-status').textContent = `Plane Set (ID: ${event.data.marker.idMatrix}) - Marker Removed`;
        document.getElementById('marker-status').className = 'status-good';
        
        // Log success
        console.log('🎉 AR Plane established! You can now:');
        console.log('   1. Remove the marker from camera view');
        console.log('   2. Use WASD to drive on the virtual infinite plane');
        console.log('   3. Press R to reset and search for marker again');
        
        // Show instructions in UI briefly
        showInstructions('✅ Plane Set! Remove marker, use WASD to drive. Press R to reset.');
    }
}

// Show temporary instruction message
function showInstructions(message) {
    // Create or update instruction overlay
    let overlay = document.getElementById('instruction-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'instruction-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(76, 175, 80, 0.95);
            color: white;
            padding: 20px 30px;
            border-radius: 10px;
            font-size: 16px;
            font-weight: bold;
            z-index: 2000;
            text-align: center;
            backdrop-filter: blur(5px);
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        `;
        document.body.appendChild(overlay);
    }
    
    overlay.textContent = message;
    overlay.style.display = 'block';
    
    // Auto-hide after 4 seconds
    setTimeout(() => {
        if (overlay) overlay.style.display = 'none';
    }, 4000);
}

// Update the virtual plane reference from marker matrix
function updatePlaneReference(markerMatrix) {
    // Store the plane transformation matrix
    fixMatrix(arSystem.planeMatrix, markerMatrix);
    
    // Extract position and rotation for reference
    arSystem.planePosition.setFromMatrixPosition(arSystem.planeMatrix);
    arSystem.planeRotation.setFromRotationMatrix(arSystem.planeMatrix);
    
    // Mark as initialized
    if (!arSystem.initialized) {
        arSystem.initialized = true;
        console.log('Virtual plane initialized');
    }
}

// Fix marker matrix orientation
function fixMatrix(three_mat, m) {
    three_mat.set(
        m[0], m[8], -m[4], m[12],
        m[1], m[9], -m[5], m[13],
        m[2], m[10], -m[6], m[14],
        m[3], m[11], -m[7], m[15]
    );
}

// Setup keyboard controls
function setupKeyboardControls() {
    // Key mappings
    const keyMap = {
        'KeyW': 'forward',
        'KeyS': 'backward', 
        'KeyA': 'left',
        'KeyD': 'right',
        'Space': 'brake'
    };
    
    // Key down events
    document.addEventListener('keydown', (event) => {
        if (keyMap[event.code]) {
            event.preventDefault();
            carSystem.keys[keyMap[event.code]] = true;
        }
        
        // Special keys
        switch(event.code) {
            case 'KeyR':
                event.preventDefault();
                resetCarPosition();
                break;
            case 'KeyG':
                event.preventDefault();
                toggleGrid();
                break;
        }
    });
    
    // Key up events
    document.addEventListener('keyup', (event) => {
        if (keyMap[event.code]) {
            event.preventDefault();
            carSystem.keys[keyMap[event.code]] = false;
        }
    });
    
    console.log('Keyboard controls initialized');
}

// Reset car to center position
function resetCarPosition() {
    console.log('🔄 Resetting system - searching for marker...');
    
    // Reset car physics
    carSystem.position.x = 0;
    carSystem.position.z = 0;
    carSystem.velocity.x = 0;
    carSystem.velocity.z = 0;
    carSystem.rotation = 0;
    carSystem.speed = 0;
    
    // Reset AR system to search for marker again
    arSystem.planeEstablished = false;
    arSystem.searchingForMarker = true;
    arSystem.markerDetected = false;
    arSystem.initialized = false;
    
    // Update UI
    document.getElementById('marker-status').textContent = 'Searching for Marker...';
    document.getElementById('marker-status').className = 'status-warning';
    
    // Show instructions
    showInstructions('🔍 Place matrix marker in front of camera to set new plane');
    
    console.log('🎯 Ready for new marker detection');
}

// Toggle grid visibility
function toggleGrid() {
    if (gridPlane) {
        gridPlane.visible = !gridPlane.visible;
        document.getElementById('grid-status').textContent = gridPlane.visible ? 'Visible' : 'Hidden';
        console.log('Grid toggled:', gridPlane.visible ? 'visible' : 'hidden');
    }
}

// Update car physics and movement
function updateCarPhysics() {
    const keys = carSystem.keys;
    
    // Calculate acceleration based on input
    let acceleration = 0;
    
    if (keys.forward) {
        acceleration = carSystem.acceleration;
    } else if (keys.backward) {
        acceleration = -carSystem.acceleration;
    }
    
    // Apply braking
    if (keys.brake) {
        carSystem.velocity.x *= carSystem.brakeForce;
        carSystem.velocity.z *= carSystem.brakeForce;
    }
    
    // Update rotation based on turning input and current speed
    if (keys.left && Math.abs(carSystem.speed) > 0.01) {
        carSystem.rotation += carSystem.turnSpeed * Math.sign(carSystem.speed);
    }
    if (keys.right && Math.abs(carSystem.speed) > 0.01) {
        carSystem.rotation -= carSystem.turnSpeed * Math.sign(carSystem.speed);
    }
    
    // Calculate velocity based on acceleration and rotation
    const cos = Math.cos(carSystem.rotation);
    const sin = Math.sin(carSystem.rotation);
    
    // Apply acceleration in car's forward direction
    carSystem.velocity.x += acceleration * sin;
    carSystem.velocity.z += acceleration * cos;
    
    // Apply friction
    carSystem.velocity.x *= carSystem.friction;
    carSystem.velocity.z *= carSystem.friction;
    
    // Calculate speed and limit maximum
    carSystem.speed = Math.sqrt(carSystem.velocity.x ** 2 + carSystem.velocity.z ** 2);
    
    if (carSystem.speed > carSystem.maxSpeed) {
        const ratio = carSystem.maxSpeed / carSystem.speed;
        carSystem.velocity.x *= ratio;
        carSystem.velocity.z *= ratio;
        carSystem.speed = carSystem.maxSpeed;
    }
    
    // Update position
    carSystem.position.x += carSystem.velocity.x;
    carSystem.position.z += carSystem.velocity.z;
    
    // Update car model transform if it exists
    if (carModel && arSystem.initialized) {
        updateCarVisualPosition();
    }
    
    // Update UI
    updateUI();
}

// Update car visual position in 3D space
function updateCarVisualPosition() {
    if (!carModel) return;
    
    // Set car position and rotation
    carModel.position.x = carSystem.position.x;
    carModel.position.z = carSystem.position.z;
    carModel.rotation.y = carSystem.rotation;
    
    // Keep car slightly above ground (higher due to larger size)
    carModel.position.y = 0.1;
}

// Update UI status information
function updateUI() {
    document.getElementById('speed-value').textContent = carSystem.speed.toFixed(2);
    document.getElementById('position-value').textContent = 
        `${carSystem.position.x.toFixed(1)}, ${carSystem.position.z.toFixed(1)}`;
    
    // Update marker status based on current state
    if (arSystem.planeEstablished) {
        // Plane is established, marker can be removed
        document.getElementById('marker-status').textContent = 'Plane Active (Marker Removed)';
        document.getElementById('marker-status').className = 'status-good';
    } else if (arSystem.searchingForMarker) {
        // Currently searching for marker
        document.getElementById('marker-status').textContent = 'Searching for Marker...';
        document.getElementById('marker-status').className = 'status-warning';
    } else if (!arLoaded) {
        // AR disabled
        document.getElementById('marker-status').textContent = 'AR Disabled (Files Missing)';
        document.getElementById('marker-status').className = 'status-error';
    }
}

// Main render loop
function renderLoop(currentTime) {
    requestAnimationFrame(renderLoop);
    
    // Process AR tracking ONLY if searching for marker and not yet established
    const shouldProcessAR = arLoaded && 
                           arController && 
                           arSystem.searchingForMarker && 
                           !arSystem.planeEstablished &&
                           (currentTime - lastProcessTime >= processingInterval);
    
    if (shouldProcessAR) {
        try {
            arController.process(document.getElementById("myvideo"));
            lastProcessTime = currentTime;
        } catch (error) {
            console.warn('AR processing error:', error);
        }
    }
    
    // Update car physics every frame (this runs at full 60fps)
    updateCarPhysics();
    
    // Update container visibility and position
    updateContainerTransform();
    
    // Render the scene
    renderer.render(scene, camera);
}

// Update container transform based on AR state
function updateContainerTransform() {
    // Show container if plane is established OR we're in fallback mode
    if (arSystem.planeEstablished || (!arLoaded && arSystem.initialized)) {
        container.visible = true;
        
        // Apply the stored plane transformation matrix
        if (arSystem.planeMatrix) {
            container.matrix.copy(arSystem.planeMatrix);
        }
    } else {
        // Hide container while searching for marker
        container.visible = false;
    }
}

// Cleanup function for camera streams
function cleanup() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => {
            track.stop();
            track.enabled = false;
        });
        currentStream = null;
        console.log('🧹 Camera streams cleaned up');
    }
}

// Enhanced cleanup with performance considerations
window.addEventListener('beforeunload', cleanup);
window.addEventListener('pagehide', cleanup);