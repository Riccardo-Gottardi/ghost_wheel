import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

class GhostWheelAR {
    constructor() {
        // Core components
        this.video = null;
        this.videoCanvas = null;
        this.arCanvas = null;
        
        // Three.js components
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.container = null;
        this.car = null;
        this.carPosition = { x: 0, z: 0 };
        this.carRotation = 0;
        
        // JSARToolKit components
        this.arController = null;
        this.arLoaded = false;
        this.lastMarkerTime = 0;
        this.markerVisible = false;
        
        // Hand tracking data
        this.websocket = null;
        this.handTrackingConnected = false;
        this.currentSteeringAngle = 0;
        this.handConfidence = 0;
        
        // Car movement parameters
        this.carSpeed = 0.002; // Units per frame
        this.maxSteeringAngle = 45; // degrees
        this.steeringSmoothing = 0.1;
        this.smoothedSteering = 0;
        
        // State management
        this.isInitialized = false;
        
        this.init();
    }
    
    async init() {
        try {
            this.updateLoadingStatus('Setting up video stream...');
            await this.setupVideo();
            
            this.updateLoadingStatus('Initializing Three.js...');
            this.setupThreeJS();
            
            this.updateLoadingStatus('Loading JSARToolKit...');
            await this.setupJSARToolKit();
            
            this.updateLoadingStatus('Connecting to hand tracking...');
            this.setupWebSocket();
            
            this.updateLoadingStatus('Loading 3D models...');
            await this.loadCarModel();
            
            this.updateLoadingStatus('Starting AR system...');
            this.startRenderLoop();
            
            this.hideLoadingScreen();
            this.isInitialized = true;
            
            console.log('Ghost Wheel AR system initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize Ghost Wheel AR:', error);
            this.updateLoadingStatus(`Error: ${error.message}`);
        }
    }
    
    updateLoadingStatus(message) {
        const statusElement = document.getElementById('loadingStatus');
        if (statusElement) {
            statusElement.textContent = message;
        }
        console.log(`Loading: ${message}`);
    }
    
    hideLoadingScreen() {
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.style.opacity = '0';
            setTimeout(() => {
                loadingScreen.style.display = 'none';
            }, 500);
        }
    }
    
    async setupVideo() {
        this.video = document.getElementById('video');
        this.videoCanvas = document.getElementById('videoCanvas');
        
        const constraints = {
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'environment' // Use back camera if available
            },
            audio: false
        };
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = stream;
            
            return new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    // Setup video canvas for background
                    const ctx = this.videoCanvas.getContext('2d');
                    this.videoCanvas.width = this.video.videoWidth;
                    this.videoCanvas.height = this.video.videoHeight;
                    
                    // Update canvas size to match window
                    this.resizeCanvases();
                    window.addEventListener('resize', () => this.resizeCanvases());
                    
                    resolve();
                };
            });
        } catch (error) {
            throw new Error(`Camera access failed: ${error.message}`);
        }
    }
    
    resizeCanvases() {
        const aspectRatio = this.video.videoWidth / this.video.videoHeight;
        const windowAspectRatio = window.innerWidth / window.innerHeight;
        
        let canvasWidth, canvasHeight;
        
        if (windowAspectRatio > aspectRatio) {
            canvasHeight = window.innerHeight;
            canvasWidth = canvasHeight * aspectRatio;
        } else {
            canvasWidth = window.innerWidth;
            canvasHeight = canvasWidth / aspectRatio;
        }
        
        // Center the canvases
        const offsetX = (window.innerWidth - canvasWidth) / 2;
        const offsetY = (window.innerHeight - canvasHeight) / 2;
        
        [this.videoCanvas, this.arCanvas].forEach(canvas => {
            canvas.style.width = `${canvasWidth}px`;
            canvas.style.height = `${canvasHeight}px`;
            canvas.style.left = `${offsetX}px`;
            canvas.style.top = `${offsetY}px`;
        });
        
        if (this.renderer) {
            this.renderer.setSize(canvasWidth, canvasHeight);
        }
    }
    
    setupThreeJS() {
        this.arCanvas = document.getElementById('arCanvas');
        
        // Setup renderer
        this.renderer = new THREE.WebGLRenderer({ 
            canvas: this.arCanvas,
            alpha: true,
            antialias: true
        });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // Setup scene
        this.scene = new THREE.Scene();
        
        // Setup camera (will be configured by JSARToolKit)
        this.camera = new THREE.Camera();
        this.scene.add(this.camera);
        
        // Setup container for AR objects
        this.container = new THREE.Object3D();
        this.container.matrixAutoUpdate = false;
        this.container.visible = false;
        this.scene.add(this.container);
        
        // Add lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 5);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 1024;
        directionalLight.shadow.mapSize.height = 1024;
        this.scene.add(directionalLight);
    }
    
    async setupJSARToolKit() {
        return new Promise((resolve, reject) => {
            // Wait for JSARToolKit to be available
            if (typeof artoolkit === 'undefined') {
                reject(new Error('JSARToolKit not loaded'));
                return;
            }
            
            try {
                this.arController = new ARController(this.video, 'camera_para.dat');
                
                this.arController.onload = () => {
                    try {
                        // Configure camera matrix for Three.js
                        this.camera.projectionMatrix.fromArray(
                            this.arController.getCameraMatrix()
                        );
                        
                        // Set detection mode for matrix markers
                        this.arController.setPatternDetectionMode(
                            artoolkit.AR_MATRIX_CODE_DETECTION
                        );
                        
                        // Setup marker detection callback
                        this.arController.addEventListener('getMarker', (event) => {
                            this.handleMarkerDetection(event);
                        });
                        
                        this.arLoaded = true;
                        this.updateMarkerStatus('Ready', true);
                        resolve();
                    } catch (error) {
                        reject(new Error(`JSARToolKit setup failed: ${error.message}`));
                    }
                };
                
                this.arController.onerror = (error) => {
                    reject(new Error(`JSARToolKit loading failed: ${error}`));
                };
                
            } catch (error) {
                reject(new Error(`Failed to create ARController: ${error.message}`));
            }
        });
    }
    
    handleMarkerDetection(event) {
        if (event.data.marker.idMatrix !== -1) {
            // Marker detected
            this.updateMarkerMatrix(event.data.matrixGL_RH);
            this.lastMarkerTime = performance.now();
            this.markerVisible = true;
        }
    }
    
    updateMarkerMatrix(markerMatrix) {
        // Apply the corrected matrix transformation (from the educational documents)
        this.fixMatrix(this.container.matrix, markerMatrix);
        this.container.visible = true;
    }
    
    // Matrix transformation function from the educational documents
    fixMatrix(threeMatrix, jsarMatrix) {
        threeMatrix.set(
            jsarMatrix[0], jsarMatrix[8], -jsarMatrix[4], jsarMatrix[12],
            jsarMatrix[1], jsarMatrix[9], -jsarMatrix[5], jsarMatrix[13],
            jsarMatrix[2], jsarMatrix[10], -jsarMatrix[6], jsarMatrix[14],
            jsarMatrix[3], jsarMatrix[11], -jsarMatrix[7], jsarMatrix[15]
        );
    }
    
    setupWebSocket() {
        try {
            this.websocket = new WebSocket('ws://localhost:8765');
            
            this.websocket.onopen = () => {
                this.handTrackingConnected = true;
                this.updateHandTrackingStatus('Connected', true);
                console.log('Hand tracking connected');
            };
            
            this.websocket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleHandTrackingData(data);
                } catch (error) {
                    console.error('Error parsing hand tracking data:', error);
                }
            };
            
            this.websocket.onclose = () => {
                this.handTrackingConnected = false;
                this.updateHandTrackingStatus('Disconnected', false);
                console.log('Hand tracking disconnected');
                
                // Attempt to reconnect after 3 seconds
                setTimeout(() => {
                    if (!this.handTrackingConnected) {
                        this.setupWebSocket();
                    }
                }, 3000);
            };
            
            this.websocket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.updateHandTrackingStatus('Error', false);
            };
            
        } catch (error) {
            console.error('Failed to setup WebSocket:', error);
            this.updateHandTrackingStatus('Failed', false);
        }
    }
    
    handleHandTrackingData(data) {
        // Update steering angle
        this.currentSteeringAngle = data.steering_angle || 0;
        this.handConfidence = data.confidence || 0;
        
        // Update UI
        this.updateSteeringDisplay(this.currentSteeringAngle);
        this.updateHandConfidenceDisplay(this.handConfidence * 100);
        
        // Apply steering smoothing
        this.smoothedSteering = THREE.MathUtils.lerp(
            this.smoothedSteering,
            this.currentSteeringAngle,
            this.steeringSmoothing
        );
        
        // Update car movement if confidence is sufficient
        if (this.handConfidence > 0.7 && this.car && this.markerVisible) {
            this.updateCarMovement();
        }
    }
    
    updateCarMovement() {
        // Convert steering angle to radians
        const steeringRad = THREE.MathUtils.degToRad(this.smoothedSteering);
        
        // Update car rotation
        this.carRotation += steeringRad * 0.02; // Adjust sensitivity
        
        // Calculate movement direction
        const moveX = Math.sin(this.carRotation) * this.carSpeed;
        const moveZ = Math.cos(this.carRotation) * this.carSpeed;
        
        // Update car position
        this.carPosition.x += moveX;
        this.carPosition.z += moveZ;
        
        // Apply transforms to car
        if (this.car) {
            this.car.position.set(this.carPosition.x, 0, this.carPosition.z);
            this.car.rotation.y = this.carRotation;
        }
    }
    
    async loadCarModel() {
        const loader = new GLTFLoader();
        
        return new Promise((resolve, reject) => {
            // You can replace this with your car model URL
            const modelUrl = 'https://threejs.org/examples/models/gltf/DamagedHelmet/DamagedHelmet.gltf';
            
            loader.load(
                modelUrl,
                (gltf) => {
                    this.car = gltf.scene;
                    this.car.scale.set(0.1, 0.1, 0.1); // Scale down the model
                    this.car.position.set(0, 0, 0);
                    
                    // Enable shadows
                    this.car.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });
                    
                    this.container.add(this.car);
                    console.log('Car model loaded successfully');
                    resolve();
                },
                (progress) => {
                    const percent = (progress.loaded / progress.total * 100);
                    this.updateLoadingStatus(`Loading model: ${percent.toFixed(0)}%`);
                },
                (error) => {
                    console.error('Error loading car model:', error);
                    // Create a simple box as fallback
                    this.createFallbackCar();
                    resolve();
                }
            );
        });
    }
    
    createFallbackCar() {
        const geometry = new THREE.BoxGeometry(0.2, 0.1, 0.4);
        const material = new THREE.MeshLambertMaterial({ color: 0xff4444 });
        this.car = new THREE.Mesh(geometry, material);
        this.car.position.set(0, 0.05, 0);
        this.car.castShadow = true;
        this.container.add(this.car);
        console.log('Fallback car model created');
    }
    
    startRenderLoop() {
        const renderLoop = () => {
            requestAnimationFrame(renderLoop);
            
            // Update video background
            this.updateVideoBackground();
            
            // Process AR markers
            if (this.arLoaded && this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
                this.arController.process(this.video);
            }
            
            // Check marker visibility timeout
            if (performance.now() - this.lastMarkerTime > 200) {
                this.container.visible = false;
                this.markerVisible = false;
            }
            
            // Render the scene
            this.renderer.render(this.scene, this.camera);
        };
        
        renderLoop();
    }
    
    updateVideoBackground() {
        if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
            const ctx = this.videoCanvas.getContext('2d');
            ctx.drawImage(this.video, 0, 0, this.videoCanvas.width, this.videoCanvas.height);
        }
    }
    
    // UI Update methods
    updateHandTrackingStatus(status, connected) {
        const statusElement = document.getElementById('handStatus');
        const textElement = document.getElementById('handStatusText');
        
        if (statusElement && textElement) {
            statusElement.className = `status-indicator ${connected ? 'status-connected' : 'status-disconnected'}`;
            textElement.textContent = status;
        }
    }
    
    updateMarkerStatus(status, ready) {
        const statusElement = document.getElementById('markerStatus');
        const textElement = document.getElementById('markerStatusText');
        
        if (statusElement && textElement) {
            statusElement.className = `status-indicator ${ready ? 'status-connected' : 'status-loading'}`;
            textElement.textContent = status;
        }
    }
    
    updateSteeringDisplay(angle) {
        const wheelElement = document.getElementById('steeringWheel');
        const valueElement = document.getElementById('steeringValue');
        const displayElement = document.getElementById('steeringAngleDisplay');
        
        if (wheelElement) {
            wheelElement.style.transform = `rotate(${angle}deg)`;
        }
        
        if (valueElement) {
            valueElement.textContent = `${angle.toFixed(1)}°`;
        }
        
        if (displayElement) {
            displayElement.textContent = `${angle.toFixed(1)}°`;
        }
    }
    
    updateHandConfidenceDisplay(confidence) {
        const element = document.getElementById('handConfidenceDisplay');
        if (element) {
            element.textContent = `${confidence.toFixed(0)}%`;
        }
    }
}

// Initialize the system when page loads
window.addEventListener('load', () => {
    new GhostWheelAR();
});