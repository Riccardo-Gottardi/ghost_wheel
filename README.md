# Ghost Wheel

Un'applicazione di realtà aumentata che permette di controllare un'auto virtuale su un piano infinito utilizzando i controlli WASD.

## Autori

- **Riccardo Gottardi** - [GitHub](https://github.com/Riccardo-Gottardi)
- **Alessandro Mattei** - [GitHub](https://github.com/AlessandroMattei)

Progetto realizzato per l'esame di **Laboratorio di Realtà Aumentata** - Università degli Studi di Udine.

## Descrizione

Ghost Wheel è un'applicazione web di realtà aumentata che combina:
- **ARToolKit** per il riconoscimento di marker
- **Three.js** per la grafica 3D
- **WebRTC** per l'acquisizione video dalla webcam

L'utente può posizionare un marker matrix code davanti alla camera per stabilire un piano virtuale, rimuovere il marker e poi controllare un'auto 3D su questo piano infinito utilizzando i tasti WASD.

## Funzionalità

### Sistema AR
- Riconoscimento marker matrix code
- Stabilimento di un piano di riferimento virtuale
- Tracking continuo senza necessità del marker fisico

### Controlli Auto
- **W**: Accelerazione in avanti
- **S**: Accelerazione all'indietro  
- **A**: Sterzata a sinistra
- **D**: Sterzata a destra
- **Spazio**: Freno
- **R**: Reset posizione e ricerca nuovo marker
- **G**: Attiva/disattiva griglia

### Fisica
- Sistema fisico realistico con inerzia
- Attrito e decelerazione
- Velocità massima limitata
- Sterzata proporzionale alla velocità

### Interfaccia
- Selezione camera da menu dropdown
- Controlli informativi in overlay
- Status real-time (velocità, posizione, stato marker)
- Auto-hide dei controlli dopo inattività

## Struttura File

```
ghost-wheel/
├── index.html          # Interfaccia utente e setup HTML
├── main_wasd.js         # Logica principale dell'applicazione
├── .gitignore          # Configurazione Git
└── README.md           # Documentazione
```

## Requisiti

### File Necessari
- `camera_para.dat` - Parametri di calibrazione camera per ARToolKit
- `artoolkit.min.js` - Libreria ARToolKit
- `retro_cartoon_car.glb` - Modello 3D dell'auto (opzionale)

### Browser
- Supporto WebRTC per accesso camera
- Supporto WebGL per rendering 3D
- Supporto ES6 modules

## Setup e Installazione

1. **Scaricare i file necessari**:
   - Scaricare `artoolkit.min.js` e `camera_para.dat` da ARToolKit
   - Opzionalmente scaricare il modello 3D dell'auto

2. **Servire l'applicazione**:
   ```bash
   # Esempio con Python
   python -m http.server 8000
   
   # Esempio con Node.js
   npx serve .
   ```

3. **Accedere all'applicazione**:
   Aprire `http://localhost:8000` nel browser

## Utilizzo

1. **Consentire accesso alla camera** quando richiesto dal browser
2. **Selezionare la camera** dal menu dropdown (se multiple disponibili)
3. **Mostrare un marker matrix code** alla camera per stabilire il piano
4. **Rimuovere il marker** una volta stabilito il piano
5. **Utilizzare i controlli WASD** per guidare l'auto virtuale

## Architettura Tecnica

### Componenti Principali

- **Sistema Camera**: Gestione accesso webcam e enumerazione dispositivi
- **Sistema AR**: Riconoscimento marker e tracking piano virtuale
- **Sistema Physics**: Simulazione fisica dell'auto
- **Sistema Rendering**: Grafica 3D con Three.js
- **Sistema Input**: Gestione controlli tastiera

### Tecnologie Utilizzate

- **ARToolKit**: Riconoscimento marker e calcolo matrici di trasformazione
- **Three.js**: Rendering 3D, gestione scene, materiali e illuminazione
- **WebRTC**: Acquisizione video real-time dalla camera
- **JavaScript ES6+**: Logica applicativa moderna

## Funzionamento

1. **Inizializzazione**: Setup camera, Three.js e ARToolKit
2. **Detection**: Ricerca continua del marker nella camera
3. **Plane Establishment**: Quando trovato, il marker stabilisce il piano di riferimento
4. **Tracking**: Il sistema passa al tracking del piano virtuale senza marker
5. **Interaction**: L'utente controlla l'auto sul piano infinito
6. **Reset**: Possibilità di resettare e cercare un nuovo marker

## Note Tecniche

- Il sistema utilizza un approccio "Ghost" dove il marker è necessario solo per stabilire il piano iniziale
- La fisica dell'auto implementa accelerazione, attrito, velocità massima e controlli realistici
- Il rendering avviene a 60fps con processamento AR ottimizzato a 30fps
- Supporta modalità fallback se ARToolKit non è disponibile

## Limitazioni

- Richiede buone condizioni di illuminazione per il riconoscimento marker
- Le prestazioni dipendono dalle capacità GPU del dispositivo
- La calibrazione camera influenza la precisione del tracking