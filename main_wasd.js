// Ghost Wheel - WASD Controls
// Applicazione di realtà aumentata per controllo auto virtuale
// Autori: Riccardo Gottardi, Alessandro Mattei
// Corso: Laboratorio di Realtà Aumentata - Università degli Studi di Udine

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ============================================================================
// VARIABILI GLOBALI PER GESTIONE CAMERA
// ============================================================================

/**
 * Stream video corrente dalla webcam
 * Mantiene il riferimento per poterlo fermare quando necessario
 */
let currentStream = null;

/**
 * Array delle camere disponibili sul dispositivo
 * Popolato dinamicamente tramite enumerateDevices()
 */
let availableCameras = [];

/**
 * Flag per indicare se il processamento video è già iniziato
 * Previene inizializzazioni multiple
 */
let isProcessingStarted = false;

/**
 * Flag per prevenire enumerazioni multiple simultanee delle camere
 * Evita race conditions durante la rilevazione dei dispositivi
 */
let isEnumerating = false;

// ============================================================================
// SISTEMA DI CONTROLLO AUTO - VARIABILI GLOBALI
// ============================================================================

/**
 * Oggetto principale che contiene tutto il sistema fisico dell'auto
 * Centralizza posizione, velocità, parametri fisici e stato dei controlli
 */
let carSystem = {
    // Fisica dell'auto - posizione e movimento nello spazio virtuale
    position: { x: 0, z: 0 }, // Posizione virtuale su piano infinito
    velocity: { x: 0, z: 0 }, // Velocità corrente lungo gli assi X e Z
    rotation: 0,              // Rotazione dell'auto in radianti
    speed: 0,                 // Velocità scalare calcolata dal vettore velocità
    
    // Parametri di controllo fisico - determinano comportamento realistico
    acceleration: 0.012,      // Forza di accelerazione per input utente
    maxSpeed: 0.40,          // Velocità massima raggiungibile
    turnSpeed: 0.05,         // Velocità di sterzata
    friction: 0.95,          // Coefficiente di attrito (decelerazione naturale)
    brakeForce: 0.85,        // Forza frenata quando premuto spazio
    
    // Stato corrente degli input utente - traccia tasti premuti
    keys: {
        forward: false,   // Tasto W
        backward: false,  // Tasto S
        left: false,      // Tasto A
        right: false,     // Tasto D
        brake: false      // Tasto Spazio
    }
};

// ============================================================================
// SISTEMA AR (REALTÀ AUMENTATA) - VARIABILI GLOBALI
// ============================================================================

/**
 * Oggetto che gestisce tutto il sistema di realtà aumentata
 * Controlla stati del marker, matrici di trasformazione e modalità di funzionamento
 */
let arSystem = {
    markerDetected: false,        // Flag: marker attualmente rilevato
    lastDetectionTime: 0,         // Timestamp ultimo rilevamento marker
    planeMatrix: new THREE.Matrix4(), // Matrice di trasformazione del piano AR
    planePosition: new THREE.Vector3(), // Posizione del piano nello spazio 3D
    planeRotation: new THREE.Euler(),   // Rotazione del piano nello spazio 3D
    initialized: false,           // Flag: sistema AR inizializzato
    planeEstablished: false,      // Flag: piano stabilito, stop processamento AR
    searchingForMarker: true      // Flag: attualmente in ricerca marker
};

// ============================================================================
// OGGETTI THREE.JS - VARIABILI GLOBALI
// ============================================================================

/**
 * Oggetti principali per il rendering 3D
 * scene: contenitore di tutti gli oggetti 3D
 * camera: punto di vista virtuale
 * renderer: motore di rendering WebGL
 * container: contenitore per oggetti AR che segue il marker
 * carModel: modello 3D dell'auto
 * gridPlane: griglia di riferimento visuale
 */
let scene, camera, renderer, container, carModel, gridPlane;

/**
 * Controller ARToolKit per riconoscimento marker
 * arLoaded: flag che indica se ARToolKit è caricato correttamente
 */
let arController, arLoaded = false;

// ============================================================================
// OTTIMIZZAZIONE PERFORMANCE
// ============================================================================

/**
 * Variabili per limitare il processamento AR a 30fps
 * Migliora performance separando rendering (60fps) da AR processing (30fps)
 */
let lastProcessTime = 0;
const processingInterval = 1000 / 30; // 30fps per processamento AR

// ============================================================================
// INIZIALIZZAZIONE PRINCIPALE
// ============================================================================

/**
 * Punto di ingresso dell'applicazione
 * Si attiva quando la pagina è completamente caricata
 * Verifica file necessari e inizializza selezione camera
 */
window.onload = function() {
    console.log('Ghost Wheel starting...');
    
    // Verifica presenza file richiesti prima di procedere
    checkRequiredFiles().then(() => {
        initializeCameraSelection();
    }).catch((error) => {
        console.warn('Some files missing, starting in fallback mode:', error);
        initializeCameraSelection(); // Continua anche senza tutti i file
    });
}

/**
 * Verifica la disponibilità dei file necessari per ARToolKit
 * Controlla se camera_para.dat e artoolkit.min.js sono accessibili
 * 
 * @returns {Promise} Promise che si risolve se tutti i file sono trovati
 * 
 * Perché: ARToolKit richiede file specifici per funzionare correttamente.
 * Se mancano, l'app può funzionare in modalità fallback senza AR.
 */
async function checkRequiredFiles() {
    const requiredFiles = [
        'camera_para.dat',    // Parametri calibrazione camera ARToolKit
        'artoolkit.min.js'    // Libreria ARToolKit minificata
    ];
    
    // Testa ogni file con richiesta HEAD (solo headers, non content)
    const results = await Promise.allSettled(
        requiredFiles.map(file => 
            fetch(file, { method: 'HEAD' })
                .then(response => {
                    if (!response.ok) throw new Error(`${file} not found`);
                    console.log(`Found: ${file}`);
                    return file;
                })
        )
    );
    
    // Identifica file mancanti
    const missing = results
        .filter(result => result.status === 'rejected')
        .map(result => result.reason.message);
    
    if (missing.length > 0) {
        console.warn('Missing files:', missing.join(', '));
        throw new Error(`Missing: ${missing.join(', ')}`);
    }
    
    console.log('All required files found');
    return true;
}

/**
 * Inizializza l'interfaccia di selezione camera
 * Configura event handlers per selezione camera e refresh
 * Gestisce il caricamento video e l'avvio del processamento
 * 
 * Come: Collega handlers agli elementi DOM, gestisce debouncing per evitare
 * cambi troppo frequenti, avvia enumerazione camere
 * 
 * Perché: L'utente deve poter scegliere quale camera usare se ne ha multiple,
 * e il sistema deve gestire i cambi di camera senza crash
 */
function initializeCameraSelection() {
    const video = document.getElementById("myvideo");
    const cameraSelect = document.getElementById('camera-select');
    const refreshButton = document.getElementById('refresh-cameras');
    
    // Handler per quando i metadati video sono caricati
    // Garantisce che video sia pronto prima di iniziare processamento
    video.onloadedmetadata = () => {
        if (!isProcessingStarted) {
            // Piccolo delay per assicurare che video sia completamente pronto
            setTimeout(() => {
                start_processing();
                isProcessingStarted = true;
            }, 100);
        }
    };
    
    // Handler per cambio camera con debouncing
    // Debouncing previene cambi troppo rapidi che potrebbero causare problemi
    let changeTimeout;
    cameraSelect.addEventListener('change', async (event) => {
        const selectedDeviceId = event.target.value;
        if (selectedDeviceId && !isEnumerating) {
            clearTimeout(changeTimeout);
            // Debounce di 200ms per evitare switch rapidi
            changeTimeout = setTimeout(async () => {
                cameraSelect.disabled = true;
                await startCameraStream(selectedDeviceId);
                cameraSelect.disabled = false;
            }, 200);
        }
    });
    
    // Handler per refresh lista camere con debouncing
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
    
    // Avvia enumerazione camere con delay per non bloccare UI
    setTimeout(() => {
        enumerateAndPopulateCameras();
    }, 500);
}

/**
 * Enumera e popola la lista delle camere disponibili
 * Richiede permessi minimi, enumera dispositivi, popola dropdown
 * 
 * Come: Richiede stream temporaneo per ottenere permessi, poi enumera
 * tutti i dispositivi video, popola il dropdown e gestisce auto-selezione
 * 
 * Perché: L'utente deve poter vedere e scegliere tra le camere disponibili.
 * I permessi sono necessari per enumerare dispositivi con etichette leggibili.
 */
async function enumerateAndPopulateCameras() {
    if (isEnumerating) return; // Previene enumerazioni multiple simultanee
    isEnumerating = true;
    
    const cameraSelect = document.getElementById('camera-select');
    
    try {
        // Mostra stato di caricamento
        cameraSelect.innerHTML = '<option value="">Detecting cameras...</option>';
        
        // Richiede permesso minimo per enumerare dispositivi
        // Stream temporaneo a bassa risoluzione
        const tempStream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 320, height: 240 }, 
            audio: false 
        });
        tempStream.getTracks().forEach(track => track.stop()); // Ferma immediatamente
        
        // Enumera tutti i dispositivi media
        const devices = await navigator.mediaDevices.enumerateDevices();
        availableCameras = devices.filter(device => device.kind === 'videoinput');
        
        cameraSelect.innerHTML = '';
        
        if (availableCameras.length === 0) {
            cameraSelect.innerHTML = '<option value="">No cameras found</option>';
            return;
        }
        
        // Aggiunge opzione di default
        cameraSelect.innerHTML = '<option value="">Select a camera...</option>';
        
        // Popola dropdown con camere disponibili
        availableCameras.forEach((camera, index) => {
            const option = document.createElement('option');
            option.value = camera.deviceId;
            // Usa etichetta se disponibile, altrimenti nome generico
            option.textContent = camera.label || `Camera ${index + 1}`;
            cameraSelect.appendChild(option);
        });
        
        
    } catch (error) {
        console.error('Error enumerating cameras:', error);
        cameraSelect.innerHTML = '<option value="">Camera access denied</option>';
    } finally {
        isEnumerating = false;
    }
}

/**
 * Avvia lo stream video da una camera specifica
 * Gestisce cambio camera, ottimizza constraint video, implementa fallback
 * 
 * @param {string} deviceId - ID univoco della camera da utilizzare
 * 
 * Come: Ferma stream corrente, configura constraint ottimizzati,
 * richiede nuovo stream, gestisce fallback in caso di errore
 * 
 * Perché: Permette switching tra camere multiple e garantisce
 * performance ottimali con constraint video appropriati
 */
async function startCameraStream(deviceId) {
    const video = document.getElementById("myvideo");
    
    try {
        // Ferma stream corrente se esistente
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
        }
        
        // Constraint ottimizzati per performance AR
        const constraints = {
            audio: false,
            video: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                width: { ideal: 640, max: 1280 },   // Risoluzione bilanciata
                height: { ideal: 480, max: 720 },   // per performance AR
                frameRate: { ideal: 30, max: 30 }   // 30fps costanti
            }
        };
        
        // Richiede nuovo stream con camera specifica
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        currentStream = stream;
        video.srcObject = stream;
        
        // Log per debugging - mostra settings reali ottenuti
        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings();
        console.log(' Camera stream started:', {
            resolution: `${settings.width}x${settings.height}`,
            frameRate: settings.frameRate,
            deviceId: settings.deviceId
        });
        
    } catch (error) {
        console.error('Error starting camera stream:', error);
        
        // Fallback con constraint più permissivi
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
            // Ultimo fallback: usa file video pre-registrato
            video.src = "marker.webm";
        }
    }
}

/**
 * Funzione principale di inizializzazione del sistema
 * Chiamata quando video è pronto, coordina setup di tutti i sottosistemi
 * 
 * Come: Configura canvas, inizializza Three.js, setup AR tracking,
 * configura controlli keyboard, avvia loop di rendering
 * 
 * Perché: Centralizza l'inizializzazione per garantire ordine corretto
 * di setup di tutti i componenti interdipendenti
 */
function start_processing() {
    const video = document.getElementById("myvideo");
    const canvas = document.getElementById("mycanvas");
    
    // Configurazione canvas per matchare dimensioni video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    video.width = video.height = 0; // Nasconde elemento video

    // Inizializzazione sequenziale dei sottosistemi
    setupThreeJS(canvas, video);
    setupARTracking(video);
    setupKeyboardControls();
    
    // Avvia loop principale di rendering
    renderLoop();
    
    console.log('Ghost Wheel initialized - Use WASD to control the car!');
}

/**
 * Configura l'ambiente Three.js per rendering 3D
 * Inizializza renderer, scene, camera, background video, griglia e modello auto
 * 
 * @param {HTMLCanvasElement} canvas - Canvas per rendering WebGL
 * @param {HTMLVideoElement} video - Elemento video per background
 * 
 * Come: Crea renderer WebGL con shadows, configura scene, imposta
 * texture video come background, crea griglia e carica modello auto
 * 
 * Perché: Three.js richiede configurazione specifica per AR:
 * background video, shadows per realismo, container per tracking marker
 */
function setupThreeJS(canvas, video) {
    // Renderer WebGL con anti-aliasing e shadows
    renderer = new THREE.WebGLRenderer({ 
        canvas: canvas,
        antialias: true,    // Smooth dei bordi
        alpha: false        // Background opaco
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limita per performance
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Shadows soft
    
    // Scene principale
    scene = new THREE.Scene();
    
    // Camera generica - sarà configurata da ARToolKit o fallback
    camera = new THREE.Camera();
    scene.add(camera);
    
    // Background video texture con color space corretto
    const videoTexture = new THREE.VideoTexture(video);
    videoTexture.colorSpace = THREE.SRGBColorSpace; // Importante per colori corretti
    videoTexture.generateMipmaps = false;           // Non servono per video
    videoTexture.minFilter = THREE.LinearFilter;    // Filtro lineare
    videoTexture.magFilter = THREE.LinearFilter;
    scene.background = videoTexture;
    
    // Container per contenuto AR - segue il marker
    container = new THREE.Object3D();
    container.matrixAutoUpdate = false; // Matrice gestita manualmente
    scene.add(container);
    
    // Crea griglia infinita per riferimento visuale
    createInfiniteGrid();
    
    // Carica modello 3D dell'auto
    loadCarModel();
    
    // Setup illuminazione realistica
    setupLighting();
}

/**
 * Crea una griglia infinita per riferimento visuale
 * Griglia colorata con linee centrali evidenziate
 * 
 * Come: Genera geometria di linee proceduralmente, colora linee centrali
 * diversamente, crea material trasparente, posiziona sopra piano
 * 
 * Perché: Aiuta l'utente a capire orientamento e movimento su piano infinito.
 * Linee centrali evidenziate mostrano centro e assi principali.
 */
function createInfiniteGrid() {
    const gridSize = 20;        // Dimensione griglia
    const gridDivisions = 40;   // Numero divisioni
    
    // Geometria procedurale per linee griglia
    const gridGeometry = new THREE.BufferGeometry();
    const vertices = [];
    const colors = [];
    
    const gridColor = new THREE.Color(0x4CAF50);   // Verde per linee normali
    const centerColor = new THREE.Color(0xFF5722); // Rosso per linee centrali
    
    // Genera linee griglia
    for (let i = 0; i <= gridDivisions; i++) {
        const position = (i / gridDivisions - 0.5) * gridSize;
        
        // Linee verticali (parallele a Z)
        vertices.push(-gridSize/2, 0, position, gridSize/2, 0, position);
        // Linee orizzontali (parallele a X)
        vertices.push(position, 0, -gridSize/2, position, 0, gridSize/2);
        
        // Colori - evidenzia linee centrali
        const isCenter = i === gridDivisions / 2;
        const color = isCenter ? centerColor : gridColor;
        
        // Due punti per linea verticale
        colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
        // Due punti per linea orizzontale
        colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }
    
    // Configura geometria con attributi
    gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    gridGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    // Material per linee con colori vertex
    const gridMaterial = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        depthWrite: false  // Evita problemi di depth con altri oggetti
    });
    
    // Crea mesh e posiziona leggermente sopra piano
    gridPlane = new THREE.LineSegments(gridGeometry, gridMaterial);
    gridPlane.position.y = 0.01; // Evita z-fighting con piano
    container.add(gridPlane);
}

/**
 * Carica il modello 3D dell'auto
 * Tenta di caricare GLTF, se fallisce crea auto procedurale
 * 
 * Come: Usa GLTFLoader per .glb, configura scala e posizione,
 * abilita shadows, se fallisce crea geometria basic
 * 
 * Perché: L'auto 3D rende l'esperienza più immersiva.
 * Fallback procedurale garantisce funzionamento anche senza asset esterni.
 */
function loadCarModel() {
    const loader = new GLTFLoader();
    
    // Tenta caricamento modello GLTF
    loader.load('retro_cartoon_car.glb', 
        // Callback successo
        (gltf) => {
            carModel = gltf.scene;
            
            // Configurazione modello - scala aumentata per visibilità
            carModel.scale.set(1.7, 1.7, 1.7);          // Doppia dimensione originale
            carModel.position.set(0, 0.1, 0);           // Posizione sopra piano
            
            // Abilita shadows per realismo
            carModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            
            container.add(carModel);
            console.log(' Car model loaded successfully (2x size)');
        }, 
        // Callback progress - non utilizzato
        undefined, 
        // Callback errore - crea fallback
        (error) => {
            console.warn('GLTF model not found, using fallback car:', error.message);
            createFallbackCar();
        }
    );
}

/**
 * Crea un'auto procedurale semplice se il GLTF fallisce
 * Costruisce auto basic con geometrie primitive Three.js
 * 
 * Come: Crea gruppo, aggiunge body con BoxGeometry,
 * aggiunge 4 ruote con CylinderGeometry, configura posizioni
 * 
 * Perché: Garantisce funzionamento anche senza file esterni.
 * Auto basic ma riconoscibile mantiene l'esperienza utente.
 */
function createFallbackCar() {
    carModel = new THREE.Group();
    
    // Corpo auto - scatola rossa scalata per forma auto
    const bodyGeometry = new THREE.BoxGeometry(0.8, 0.3, 1.6); // Dimensioni doppie
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0xff0000 });
    const carBody = new THREE.Mesh(bodyGeometry, bodyMaterial);
    carBody.position.y = 0.2; // Posizione elevata
    carBody.castShadow = true;
    carModel.add(carBody);
    
    // Ruote - cilindri neri rotati
    const wheelGeometry = new THREE.CylinderGeometry(0.16, 0.16, 0.1); // Doppie dimensioni
    const wheelMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
    
    // Posizioni ruote - adattate per auto più grande
    const wheelPositions = [
        [-0.3, 0.1, 0.5],   // Anteriore sinistra
        [0.3, 0.1, 0.5],    // Anteriore destra
        [-0.3, 0.1, -0.5],  // Posteriore sinistra
        [0.3, 0.1, -0.5]    // Posteriore destra
    ];
    
    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.position.set(...pos);
        wheel.rotation.z = Math.PI / 2; // Ruota cilindro per orientamento corretto
        wheel.castShadow = true;
        carModel.add(wheel);
    });
    
    carModel.position.set(0, 0.04, 0); // Posizione base elevata
    container.add(carModel);
    
    console.log(' Fallback car created (2x size)');
}

/**
 * Configura sistema di illuminazione per rendering realistico
 * Combina luce ambientale e direzionale con shadows
 * 
 * Come: Aggiunge AmbientLight per illuminazione generale,
 * DirectionalLight con shadows per realismo, configura shadow camera
 * 
 * Perché: L'illuminazione corretta è essenziale per AR convincente.
 * Shadows aiutano a "ancorare" oggetti virtuali al mondo reale.
 */
function setupLighting() {
    // Luce ambientale - illuminazione generale diffusa
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    container.add(ambientLight);
    
    // Luce direzionale con shadows per realismo
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(2, 4, 2);           // Posizione tipo sole
    directionalLight.castShadow = true;               // Abilita shadows
    
    // Configurazione shadow camera per qualità ottimale
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

/**
 * Configura il tracking AR per riconoscimento marker
 * Inizializza ARController, gestisce callback, configura detection mode
 * 
 * @param {HTMLVideoElement} video - Elemento video per processamento AR
 * 
 * Come: Crea ARController con parametri camera, configura matrix code detection,
 * imposta callback per marker detection, gestisce errori con fallback
 * 
 * Perché: ARToolKit è il cuore del sistema AR. Setup corretto è critico
 * per funzionamento. Fallback garantisce funzionalità base senza AR.
 */
function setupARTracking(video) {
    console.log('Initializing AR tracking...');
    
    // Verifica disponibilità ARController
    if (typeof ARController === 'undefined') {
        console.error('ARController not found - artoolkit.min.js missing?');
        setupFallbackCamera();
        return;
    }
    
    try {
        // Inizializza ARController con file parametri camera
        arController = new ARController(video, 'camera_para.dat');
        
        // Callback quando ARController è caricato
        arController.onload = () => {
            try {
                console.log(' AR Controller loaded');
                
                // Imposta matrice proiezione camera da ARToolKit a Three.js
                const cameraMatrix = arController.getCameraMatrix();
                if (cameraMatrix && cameraMatrix.length === 16) {
                    camera.projectionMatrix.fromArray(cameraMatrix);
                    console.log(' Camera matrix applied');
                } else {
                    console.error('Invalid camera matrix');
                    setupFallbackCamera();
                    return;
                }
                
                // Configura detection per Matrix Code markers (non pattern)
                arController.setPatternDetectionMode(artoolkit.AR_MATRIX_CODE_DETECTION);
                console.log(' Matrix code detection enabled');
                
                // Handler per rilevamento marker
                arController.addEventListener('getMarker', handleMarkerDetection);
                
                arLoaded = true;
                
                // Aggiorna UI per mostrare stato AR attivo
                document.getElementById('marker-status').textContent = 'Searching...';
                document.getElementById('marker-status').className = 'status-warning';
                
                console.log('AR System ready - Show matrix marker to camera');
                
            } catch (error) {
                console.error('Error in AR controller setup:', error);
                setupFallbackCamera();
            }
        };
        
        // Callback errore caricamento ARController
        arController.onerror = (error) => {
            console.error('AR Controller failed to load:', error);
            setupFallbackCamera();
        };
        
    } catch (error) {
        console.error('Failed to create AR Controller:', error);
        setupFallbackCamera();
    }
}

/**
 * Configura camera fallback se AR non disponibile
 * Crea PerspectiveCamera standard per funzionamento senza marker
 * 
 * Come: Sostituisce Camera generica con PerspectiveCamera,
 * posiziona camera per vista ottimale, marca sistema come inizializzato
 * 
 * Perché: Garantisce funzionamento anche senza ARToolKit.
 * L'utente può comunque controllare l'auto in modalità 3D normale.
 */
function setupFallbackCamera() {
    console.log('Setting up fallback camera (AR disabled)');
    
    const canvas = document.getElementById("mycanvas");
    const aspect = canvas.width / canvas.height;
    
    // Sostituisce camera generica con perspective camera
    scene.remove(camera);
    camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    camera.position.set(0, 2, 3);  // Posizione sopra e dietro al centro
    camera.lookAt(0, 0, 0);        // Guarda verso centro
    scene.add(camera);
    
    // Marca sistema come inizializzato in modalità fallback
    arSystem.initialized = true;
    arSystem.markerDetected = false; // Nessun marker in fallback
    
    console.log(' Fallback camera initialized - Controls work without AR');
    
    // Aggiorna UI per mostrare warning
    document.getElementById('marker-status').textContent = 'AR Disabled (Files Missing)';
    document.getElementById('marker-status').className = 'status-error';
}

/**
 * Gestisce eventi di rilevamento marker da ARToolKit
 * Quando marker rilevato, stabilisce piano di riferimento e ferma ricerca
 * 
 * @param {Event} event - Evento con dati marker da ARToolKit
 * 
 * Come: Verifica ID marker valido, aggiorna riferimento piano,
 * cambia stati sistema, aggiorna UI, mostra istruzioni
 * 
 * Perché: Il marker serve solo per stabilire il piano iniziale.
 * Una volta stabilito, il sistema passa a tracking virtuale.
 */
function handleMarkerDetection(event) {
    // Verifica marker valido (ID diverso da -1)
    if (event.data.marker.idMatrix !== -1 && arSystem.searchingForMarker) {
        console.log(`Marker detected! ID: ${event.data.marker.idMatrix}`);
        
        // Aggiorna riferimento piano da matrice marker
        updatePlaneReference(event.data.matrixGL_RH);
        
        // Aggiorna stati sistema AR
        arSystem.markerDetected = true;
        arSystem.lastDetectionTime = performance.now();
        arSystem.planeEstablished = true;    // PIANO STABILITO!
        arSystem.searchingForMarker = false; // STOP RICERCA!
        
        // Aggiorna UI con conferma
        document.getElementById('marker-status').textContent = `Plane Set (ID: ${event.data.marker.idMatrix}) - Marker Removed`;
        document.getElementById('marker-status').className = 'status-good';
        
        // Log istruzioni per utente
        console.log('🎉 AR Plane established! You can now:');
        console.log('   1. Remove the marker from camera view');
        console.log('   2. Use WASD to drive on the virtual infinite plane');
        console.log('   3. Press R to reset and search for marker again');
        
        // Mostra istruzioni temporanee in UI
        showInstructions(' Plane Set! Remove marker, use WASD to drive. Press R to reset.');
    }
}

/**
 * Mostra messaggio di istruzioni temporaneo sovrapposto
 * Crea overlay semi-trasparente con auto-hide
 * 
 * @param {string} message - Messaggio da mostrare
 * 
 * Come: Crea o aggiorna div overlay con stili CSS,
 * posiziona al centro, applica auto-hide dopo 4 secondi
 * 
 * Perché: Feedback visuale importante per guidare utente
 * attraverso fasi critiche del setup AR.
 */
function showInstructions(message) {
    // Cerca overlay esistente o creane uno nuovo
    let overlay = document.getElementById('instruction-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'instruction-overlay';
        // Stili inline per overlay centrato e accattivante
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
    
    // Auto-hide dopo 4 secondi
    setTimeout(() => {
        if (overlay) overlay.style.display = 'none';
    }, 4000);
}

/**
 * Aggiorna il riferimento del piano virtuale da matrice marker
 * Salva matrice di trasformazione per uso futuro senza marker
 * 
 * @param {Array} markerMatrix - Matrice 4x4 dal marker ARToolKit
 * 
 * Come: Corregge orientamento matrice, estrae posizione/rotazione,
 * marca sistema come inizializzato
 * 
 * Perché: Il piano di riferimento permette tracking senza marker fisico.
 * Salva relazione spaziale tra mondo reale e virtuale.
 */
function updatePlaneReference(markerMatrix) {
    // Salva matrice trasformazione con correzione orientamento
    fixMatrix(arSystem.planeMatrix, markerMatrix);
    
    // Estrae posizione e rotazione per riferimento
    arSystem.planePosition.setFromMatrixPosition(arSystem.planeMatrix);
    arSystem.planeRotation.setFromRotationMatrix(arSystem.planeMatrix);
    
    // Marca sistema come inizializzato se prima volta
    if (!arSystem.initialized) {
        arSystem.initialized = true;
        console.log('Virtual plane initialized');
    }
}

/**
 * Corregge orientamento matrice marker per compatibilità Three.js
 * Applica rotazione 90° su X per convertire Z-up a Y-up
 * 
 * @param {THREE.Matrix4} three_mat - Matrice Three.js di destinazione
 * @param {Array} m - Array matrice da ARToolKit
 * 
 * Come: Riordina elementi matrice applicando rotazione 90° X,
 * converte da colonna-major ad ordine Three.js
 * 
 * Perché: ARToolKit usa Z-up, Three.js usa Y-up.
 * Correzione necessaria per allineamento corretto oggetti.
 */
function fixMatrix(three_mat, m) {
    // Matrice con rotazione 90° su X applicata
    // Converte da Z-up (ARToolKit) a Y-up (Three.js)
    three_mat.set(
        m[0], m[8], -m[4], m[12],    // Riga 1
        m[1], m[9], -m[5], m[13],    // Riga 2  
        m[2], m[10], -m[6], m[14],   // Riga 3
        m[3], m[11], -m[7], m[15]    // Riga 4
    );
}

/**
 * Configura controlli tastiera per movimento auto
 * Mappa tasti a stati, gestisce eventi keydown/keyup, tasti speciali
 * 
 * Come: Definisce mapping tasti->azioni, aggiunge event listeners
 * per keydown/keyup, gestisce tasti speciali R e G
 * 
 * Perché: Controlli intuitivi WASD standard per gaming.
 * Gestione keydown/keyup permette movimento fluido e multi-tasto.
 */
function setupKeyboardControls() {
    // Mapping tasti a azioni auto
    const keyMap = {
        'KeyW': 'forward',   // W - Avanti
        'KeyS': 'backward',  // S - Indietro
        'KeyA': 'left',      // A - Sinistra
        'KeyD': 'right',     // D - Destra
        'Space': 'brake'     // Spazio - Freno
    };
    
    // Handler pressione tasti
    document.addEventListener('keydown', (event) => {
        // Gestisce tasti movimento
        if (keyMap[event.code]) {
            event.preventDefault();
            carSystem.keys[keyMap[event.code]] = true;
        }
        
        // Gestisce tasti speciali
        switch(event.code) {
            case 'KeyR':
                event.preventDefault();
                resetCarPosition(); // Reset sistema e ricerca marker
                break;
            case 'KeyG':
                event.preventDefault();
                toggleGrid();       // Toggle visibilità griglia
                break;
        }
    });
    
    // Handler rilascio tasti
    document.addEventListener('keyup', (event) => {
        if (keyMap[event.code]) {
            event.preventDefault();
            carSystem.keys[keyMap[event.code]] = false;
        }
    });
    
    console.log('Keyboard controls initialized');
}

/**
 * Reset completo sistema: posizione auto e ricerca nuovo marker
 * Riporta tutto allo stato iniziale per nuovo setup
 * 
 * Come: Azzera fisica auto, reset stati AR per ricerca marker,
 * aggiorna UI, mostra istruzioni
 * 
 * Perché: Permette all'utente di riposizionare sistema o correggere
 * setup errato senza ricaricare pagina.
 */
function resetCarPosition() {
    console.log('🔄 Resetting system - searching for marker...');
    
    // Reset completo fisica auto
    carSystem.position.x = 0;
    carSystem.position.z = 0;
    carSystem.velocity.x = 0;
    carSystem.velocity.z = 0;
    carSystem.rotation = 0;
    carSystem.speed = 0;
    
    // Reset stati AR per nuova ricerca marker
    arSystem.planeEstablished = false;
    arSystem.searchingForMarker = true;
    arSystem.markerDetected = false;
    arSystem.initialized = false;
    
    // Aggiorna UI per stato ricerca
    document.getElementById('marker-status').textContent = 'Searching for Marker...';
    document.getElementById('marker-status').className = 'status-warning';
    
    // Mostra istruzioni per nuovo setup
    showInstructions('🔍 Place matrix marker in front of camera to set new plane');
    
    console.log('Ready for new marker detection');
}

/**
 * Toggle visibilità griglia di riferimento
 * Permette nascondere/mostrare griglia per preferenza utente
 * 
 * Come: Inverte proprietà visible della griglia, aggiorna UI
 * 
 * Perché: Alcuni utenti potrebbero preferire vista senza griglia
 * per esperienza più pulita.
 */
function toggleGrid() {
    if (gridPlane) {
        gridPlane.visible = !gridPlane.visible;
        document.getElementById('grid-status').textContent = gridPlane.visible ? 'Visible' : 'Hidden';
        console.log('Grid toggled:', gridPlane.visible ? 'visible' : 'hidden');
    }
}

/**
 * Aggiorna fisica e movimento dell'auto
 * Calcola accelerazione, rotazione, velocità, applica limiti e attrito
 * 
 * Come: Legge input utente, calcola forze, aggiorna velocità/posizione,
 * applica vincoli fisici, aggiorna posizione visuale
 * 
 * Perché: Simulazione fisica realistica rende controlli naturali.
 * Inerzia, attrito e limiti prevengono comportamenti irrealistici.
 */
function updateCarPhysics() {
    const keys = carSystem.keys;
    
    // Calcola accelerazione basata su input utente
    let acceleration = 0;
    
    if (keys.forward) {
        acceleration = carSystem.acceleration;
    } else if (keys.backward) {
        acceleration = -carSystem.acceleration;
    }
    
    // Applica frenata se richiesta
    if (keys.brake) {
        carSystem.velocity.x *= carSystem.brakeForce;
        carSystem.velocity.z *= carSystem.brakeForce;
    }
    
    // Aggiorna rotazione basata su sterzata e velocità corrente
    // Sterzata efficace solo se auto in movimento
    if (keys.left && Math.abs(carSystem.speed) > 0.01) {
        carSystem.rotation += carSystem.turnSpeed * Math.sign(carSystem.speed);
    }
    if (keys.right && Math.abs(carSystem.speed) > 0.01) {
        carSystem.rotation -= carSystem.turnSpeed * Math.sign(carSystem.speed);
    }
    
    // Calcola componenti velocità in direzione auto
    const cos = Math.cos(carSystem.rotation);
    const sin = Math.sin(carSystem.rotation);
    
    // Applica accelerazione in direzione corrente auto
    carSystem.velocity.x += acceleration * sin;
    carSystem.velocity.z += acceleration * cos;
    
    // Applica attrito per decelerazione naturale
    carSystem.velocity.x *= carSystem.friction;
    carSystem.velocity.z *= carSystem.friction;
    
    // Calcola velocità scalare e applica limite massimo
    carSystem.speed = Math.sqrt(carSystem.velocity.x ** 2 + carSystem.velocity.z ** 2);
    
    if (carSystem.speed > carSystem.maxSpeed) {
        const ratio = carSystem.maxSpeed / carSystem.speed;
        carSystem.velocity.x *= ratio;
        carSystem.velocity.z *= ratio;
        carSystem.speed = carSystem.maxSpeed;
    }
    
    // Aggiorna posizione basata su velocità
    carSystem.position.x += carSystem.velocity.x;
    carSystem.position.z += carSystem.velocity.z;
    
    // Aggiorna posizione visuale modello 3D
    if (carModel && arSystem.initialized) {
        updateCarVisualPosition();
    }
    
    // Aggiorna display UI
    updateUI();
}

/**
 * Aggiorna posizione visuale del modello auto nello spazio 3D
 * Sincronizza modello 3D con stato fisica
 * 
 * Come: Copia posizione/rotazione da sistema fisica a modello 3D,
 * mantiene elevazione costante sopra piano
 * 
 * Perché: Separazione tra logica fisica e rendering permette
 * modifiche indipendenti e debug più facile.
 */
function updateCarVisualPosition() {
    if (!carModel) return;
    
    // Sincronizza posizione e rotazione con fisica
    carModel.position.x = carSystem.position.x;
    carModel.position.z = carSystem.position.z;
    carModel.rotation.y = carSystem.rotation;
    
    // Mantiene auto leggermente sopra piano per visibilità shadows
    carModel.position.y = 0.1;
}

/**
 * Aggiorna informazioni UI in tempo reale
 * Mostra velocità, posizione, stato marker negli overlay
 * 
 * Come: Formatta valori numerici, aggiorna textContent elementi,
 * determina stato marker basato su flags sistema
 * 
 * Perché: Feedback real-time aiuta utente capire stato sistema
 * e debug problemi. Informazioni tecniche utili per sviluppo.
 */
function updateUI() {
    // Aggiorna velocità con 2 decimali
    document.getElementById('speed-value').textContent = carSystem.speed.toFixed(2);
    
    // Aggiorna posizione con 1 decimale
    document.getElementById('position-value').textContent = 
        `${carSystem.position.x.toFixed(1)}, ${carSystem.position.z.toFixed(1)}`;
    
    // Determina e aggiorna stato marker
    if (arSystem.planeEstablished) {
        // Piano stabilito, marker può essere rimosso
        document.getElementById('marker-status').textContent = 'Plane Active (Marker Removed)';
        document.getElementById('marker-status').className = 'status-good';
    } else if (arSystem.searchingForMarker) {
        // Ricerca attiva marker
        document.getElementById('marker-status').textContent = 'Searching for Marker...';
        document.getElementById('marker-status').className = 'status-warning';
    } else if (!arLoaded) {
        // AR disabilitato
        document.getElementById('marker-status').textContent = 'AR Disabled (Files Missing)';
        document.getElementById('marker-status').className = 'status-error';
    }
}

/**
 * Loop principale di rendering - cuore dell'applicazione
 * Coordina processamento AR, fisica auto, rendering a 60fps
 * 
 * @param {number} currentTime - Timestamp corrente per timing
 * 
 * Come: Usa requestAnimationFrame per 60fps, processa AR a 30fps,
 * aggiorna fisica ogni frame, sincronizza container con AR
 * 
 * Perché: Separazione timing ottimizza performance. AR a 30fps sufficiente,
 * fisica a 60fps per controlli fluidi. Rendering continuo per smoothness.
 */
function renderLoop(currentTime) {
    requestAnimationFrame(renderLoop); // Mantiene loop attivo
    
    // Processamento AR solo se necessario e con throttling a 30fps
    const shouldProcessAR = arLoaded && 
                           arController && 
                           arSystem.searchingForMarker && 
                           !arSystem.planeEstablished &&
                           (currentTime - lastProcessTime >= processingInterval);
    
    if (shouldProcessAR) {
        try {
            // Processa frame video per rilevamento marker
            arController.process(document.getElementById("myvideo"));
            lastProcessTime = currentTime;
        } catch (error) {
            console.warn('AR processing error:', error);
        }
    }
    
    // Aggiorna fisica auto ogni frame (60fps per controlli fluidi)
    updateCarPhysics();
    
    // Aggiorna visibilità e trasformazione container AR
    updateContainerTransform();
    
    // Rendering finale scena
    renderer.render(scene, camera);
}

/**
 * Aggiorna trasformazione container basata su stato AR
 * Gestisce visibilità e posizionamento contenuto AR
 * 
 * Come: Determina visibilità da stato sistema, applica matrice
 * di trasformazione salvata quando piano stabilito
 * 
 * Perché: Container deve apparire solo quando appropriato e
 * seguire correttamente il piano di riferimento stabilito.
 */
function updateContainerTransform() {
    // Mostra container se piano stabilito O modalità fallback attiva
    if (arSystem.planeEstablished || (!arLoaded && arSystem.initialized)) {
        container.visible = true;
        
        // Applica matrice trasformazione salvata dal marker
        if (arSystem.planeMatrix) {
            container.matrix.copy(arSystem.planeMatrix);
        }
    } else {
        // Nasconde container durante ricerca marker
        container.visible = false;
    }
}

/**
 * Funzione cleanup per stream camera
 * Ferma tutti i track video quando applicazione chiude
 * 
 * Come: Itera su tutti i track dello stream, li ferma e disabilita
 * 
 * Perché: Libera risorse hardware camera quando non più necessaria.
 * Previene camera "bloccata" dopo chiusura pagina.
 */
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

// Registra cleanup per eventi chiusura pagina
// beforeunload: chiusura normale
// pagehide: navigazione mobile/tab switching
window.addEventListener('beforeunload', cleanup);
window.addEventListener('pagehide', cleanup);