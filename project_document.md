# Ghost Wheel - Documento di Progetto
## Sistema di Realtà Aumentata per Controllo Automobilistico

---

## 1. Panoramica del Progetto

### 1.1 Descrizione
**Ghost Wheel** è un sistema di realtà aumentata innovativo che permette all'utente di controllare un'automobile virtuale utilizzando le proprie mani come volante invisibile. Il sistema combina computer vision, realtà aumentata e interfacce naturali per creare un'esperienza di guida immersiva.

### 1.2 Obiettivi
- Creare un'interfaccia di controllo naturale basata su gesti delle mani
- Implementare un sistema AR per visualizzazione di contenuti 3D su superfici reali
- Dimostrare l'integrazione di tecnologie moderne (MediaPipe, Three.js, WebSocket)
- Sviluppare un prototipo funzionale per scopi educativi e dimostrativi

### 1.3 Utenti Target
- Studenti di computer vision e realtà aumentata
- Sviluppatori interessati alle interfacce naturali
- Pubblico generale per scopi dimostrativi

---

## 2. Requisiti del Sistema

### 2.1 Requisiti Funzionali
- **RF01**: Il sistema deve riconoscere i movimenti delle mani dell'utente
- **RF02**: Il sistema deve calcolare l'angolo di sterzo basato sulla posizione delle mani
- **RF03**: Il sistema deve rilevare marcatori AR sulla superficie di gioco
- **RF04**: Il sistema deve visualizzare un'automobile 3D allineata alla superficie
- **RF05**: L'automobile deve rispondere ai comandi di sterzo in tempo reale
- **RF06**: Il sistema deve fornire feedback visivo immediato

### 2.2 Requisiti Non Funzionali
- **RNF01**: Latenza massima di 100ms tra input e visualizzazione
- **RNF02**: Frame rate minimo di 30 FPS per entrambe le telecamere
- **RNF03**: Precisione di tracking delle mani con accuratezza > 90%
- **RNF04**: Stabilità del sistema per sessioni di 30+ minuti
- **RNF05**: Compatibilità con browser moderni (Chrome, Firefox, Safari)

### 2.3 Requisiti Hardware
- 2 telecamere USB (risoluzione minima 640x480)
- Laptop con GPU dedicata (raccomandato)
- Marcatori ArUco stampati
- Superficie piana per il gioco

---

## 3. Architettura del Sistema

### 3.1 Componenti Principali

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Camera Input  │    │   Backend Python │    │   Frontend Web  │
│  (Hand Tracking)│───▶│                  │───▶│   (Three.js)    │
└─────────────────┘    │  - MediaPipe     │    └─────────────────┘
                       │  - OpenCV        │             ▲
┌─────────────────┐    │  - WebSocket     │             │
│  Camera Display │───▶│  - ArUco         │─────────────┘
│   (AR Surface)  │    └──────────────────┘
└─────────────────┘
```

### 3.2 Flusso di Dati

1. **Input Stream**: Camera → MediaPipe → Calcolo Sterzo → WebSocket
2. **Display Stream**: Camera → ArUco Detection → Matrice Trasformazione → WebSocket
3. **Rendering**: WebSocket → Three.js → Rendering 3D → Display

### 3.3 Protocolli di Comunicazione

#### WebSocket Message Format
```json
{
  "type": "steering_data",
  "timestamp": 1234567890,
  "steering_angle": -45.2,
  "confidence": 0.95
}

{
  "type": "ar_data", 
  "timestamp": 1234567890,
  "transformation_matrix": [...],
  "markers_detected": 4,
  "surface_valid": true
}

{
  "type": "video_frame",
  "timestamp": 1234567890,
  "frame_data": "base64_encoded_image"
}
```

---

## 4. Piano di Sviluppo Incrementale

### 4.1 Sprint 1 - Fondamenta (Settimana 1-2)
**Obiettivo**: Stabilire l'infrastruttura base del sistema

#### Milestone 1.1 - Setup Ambiente
- [ ] Configurazione ambiente Python (OpenCV, MediaPipe)
- [ ] Setup progetto web (Three.js, WebSocket)
- [ ] Test connessione telecamere
- [ ] Creazione repository e documentazione base

#### Milestone 1.2 - Hand Tracking Base
- [ ] Implementazione rilevamento mani con MediaPipe
- [ ] Calcolo angolo di sterzo semplificato
- [ ] Visualizzazione debug delle mani rilevate
- [ ] Test accuratezza rilevamento

**Deliverable**: Prototipo che rileva le mani e calcola angoli di base

### 4.2 Sprint 2 - Computer Vision (Settimana 3-4)
**Obiettivo**: Implementare il sistema di tracking completo

#### Milestone 2.1 - ArUco Marker Detection
- [ ] Setup rilevamento marcatori ArUco
- [ ] Calcolo matrice di trasformazione 3D
- [ ] Calibrazione telecamera
- [ ] Validazione accuratezza posizionamento

#### Milestone 2.2 - Streaming Video
- [ ] Implementazione streaming video in tempo reale
- [ ] Ottimizzazione qualità/performance
- [ ] Gestione buffer e sincronizzazione
- [ ] Test latenza end-to-end

**Deliverable**: Sistema che rileva superficie AR e streaming video funzionante

### 4.3 Sprint 3 - Comunicazione (Settimana 5-6)
**Obiettivo**: Implementare la comunicazione tra componenti

#### Milestone 3.1 - WebSocket Server
- [ ] Implementazione server WebSocket in Python
- [ ] Gestione connessioni multiple
- [ ] Protocollo di comunicazione dati
- [ ] Gestione errori e riconnessioni

#### Milestone 3.2 - Integrazione Dati
- [ ] Sincronizzazione timestamp
- [ ] Aggregazione dati da entrambe le telecamere
- [ ] Validazione integrità dati
- [ ] Sistema di logging

**Deliverable**: Comunicazione affidabile tra backend e frontend

### 4.4 Sprint 4 - Rendering 3D (Settimana 7-8)
**Obiettivo**: Implementare la visualizzazione AR

#### Milestone 4.1 - Three.js Setup
- [ ] Configurazione scena 3D base
- [ ] Caricamento modello automobile
- [ ] Setup telecamera AR
- [ ] Implementazione background video

#### Milestone 4.2 - AR Rendering
- [ ] Applicazione matrici di trasformazione
- [ ] Allineamento oggetti 3D con superficie reale
- [ ] Gestione occlusioni e lighting
- [ ] Ottimizzazione performance rendering

**Deliverable**: Automobile 3D correttamente posizionata sulla superficie

### 4.5 Sprint 5 - Controlli (Settimana 9-10)
**Obiettivo**: Implementare i controlli di guida

#### Milestone 5.1 - Sistema di Controllo
- [ ] Mappatura angolo sterzo → movimento automobile
- [ ] Implementazione fisica di movimento semplificata
- [ ] Vincoli di movimento sulla superficie
- [ ] Sistema di collisioni base

#### Milestone 5.2 - Responsive Controls
- [ ] Calibrazione sensibilità controlli
- [ ] Smoothing e filtraggio input
- [ ] Gestione perdita tracking
- [ ] Feedback visivo stato sistema

**Deliverable**: Sistema di controllo completo e responsivo

### 4.6 Sprint 6 - Polishing (Settimana 11-12)
**Obiettivo**: Finalizzazione e ottimizzazione

#### Milestone 6.1 - User Experience
- [ ] Interfaccia utente per calibrazione
- [ ] Indicatori visivi stato sistema
- [ ] Gestione errori user-friendly
- [ ] Tutorial e istruzioni

#### Milestone 6.2 - Ottimizzazione Performance
- [ ] Profiling performance completo
- [ ] Ottimizzazione algoritmi critici
- [ ] Riduzione utilizzo memoria
- [ ] Test stress e stabilità

**Deliverable**: Sistema completo pronto per dimostrazione

---

## 5. Stack Tecnologico

### 5.1 Backend (Python)
```python
# Core Dependencies
opencv-python==4.8.1.78
mediapipe==0.10.7
numpy==1.24.3
websockets==11.0.3
asyncio
```

### 5.2 Frontend (Web)
```javascript
// Core Technologies  
Three.js (r158+)
WebSocket API
HTML5 Video API
WebGL 2.0
```

### 5.3 Strumenti di Sviluppo
- **Version Control**: Git + GitHub
- **IDE**: VS Code con estensioni Python/JavaScript
- **Testing**: pytest (Python), Jest (JavaScript)
- **Debugging**: Chrome DevTools, Python debugger

---

## 6. Considerazioni Tecniche

### 6.1 Sfide Tecniche Principali
1. **Latenza**: Minimizzare il delay tra input e visualizzazione
2. **Sincronizzazione**: Allineare dati da telecamere multiple
3. **Accuratezza**: Mantenere precision tracking in condizioni variabili
4. **Performance**: Garantire frame rate stabili su hardware limitato

### 6.2 Strategie di Mitigazione
- Utilizzo di thread separati per processing parallelo
- Implementazione di buffer circolari per streaming
- Algoritmi di predizione per compensare latenza
- Fallback graceful in caso di perdita tracking

### 6.3 Testing Strategy
- **Unit Testing**: Testing componenti individuali
- **Integration Testing**: Testing comunicazione componenti
- **Performance Testing**: Benchmark latenza e throughput
- **User Testing**: Validazione esperienza utente

---

## 7. Metriche di Successo

### 7.1 Metriche Quantitative
- Latenza end-to-end < 100ms
- Accuratezza hand tracking > 90%
- Frame rate stabile a 30+ FPS
- Uptime sistema > 95% in sessioni 30min

### 7.2 Metriche Qualitative
- Esperienza utente fluida e intuitiva
- Setup e calibrazione semplici
- Feedback visivo chiaro e immediato
- Robustezza in condizioni di lighting variabili

---

## 8. Rischi e Contingency

### 8.1 Rischi Tecnici
| Rischio | Probabilità | Impatto | Mitigazione |
|---------|-------------|---------|-------------|
| Latenza elevata | Media | Alto | Ottimizzazione algoritmi, hardware più potente |
| Accuratezza tracking | Media | Medio | Algoritmi di filtering, calibrazione migliorata |
| Performance rendering | Bassa | Alto | Fallback a qualità ridotta, ottimizzazione modelli |

### 8.2 Piano di Contingency
- **Latenza eccessiva**: Implementare predizione movimento
- **Hardware insufficiente**: Ridurre risoluzione, semplificare rendering
- **Tracking instabile**: Implementare algoritmi di smoothing avanzati

---

## 9. Conclusioni

Ghost Wheel rappresenta un progetto ambizioso che combina tecnologie all'avanguardia per creare un'esperienza di realtà aumentata coinvolgente. L'approccio di sviluppo incrementale permetterà di validare progressivamente ogni componente, riducendo i rischi e garantendo un prodotto finale robusto e funzionale.

Il progetto servirà come eccellente dimostrazione delle possibilità offerte dall'integrazione di computer vision, realtà aumentata e interfacce naturali, fornendo una base solida per futuri sviluppi e miglioramenti.