# LECTOR DE CÓDIGO DE BARRAS PARA PWA (Progressive Web App)

## ⚠️ IMPORTANTE: Esto es para PWA, NO para React Native/Expo

Para PWA necesitas usar APIs web nativas + librería JavaScript. **NO puedes usar expo-camera**.

---

## PASO 1: INSTALAR LIBRERÍA PARA PWA

**Opción recomendada: html5-qrcode** (soporta QR y códigos de barras)

```bash
npm install html5-qrcode
```

**Alternativas:**
- `quagga2` (solo códigos de barras 1D)
- `@zxing/library` (más complejo pero potente)
- `dynamsoft-barcode-reader` (comercial, muy potente)

---

## PASO 2: CÓDIGO COMPLETO PARA PWA

Crea un componente `BarcodeScanner.jsx` (o `.js`):

```javascript
import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

export default function BarcodeScanner({ onScan, onClose }) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const html5QrCodeRef = useRef(null);
  const lastScannedCode = useRef(null);

  const startScanning = async () => {
    try {
      // Crear instancia del escáner
      const html5QrCode = new Html5Qrcode("reader");
      html5QrCodeRef.current = html5QrCode;

      // Configuración de códigos soportados
      const config = {
        fps: 10, // 10 frames por segundo
        qrbox: { width: 250, height: 250 }, // Área de escaneo
        aspectRatio: 1.0,
        // Soporta múltiples formatos
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
          Html5QrcodeSupportedFormats.PDF_417,
        ]
      };

      // Iniciar cámara trasera (environment) o frontal (user)
      await html5QrCode.start(
        { facingMode: "environment" }, // Cámara trasera
        config,
        (decodedText, decodedResult) => {
          // DEBOUNCE: Ignorar mismo código en 2 segundos
          const now = Date.now();
          if (lastScannedCode.current && 
              lastScannedCode.current.data === decodedText && 
              (now - lastScannedCode.current.timestamp) < 2000) {
            return; // Ignorar duplicado
          }

          // Guardar código escaneado
          lastScannedCode.current = { 
            data: decodedText, 
            timestamp: now 
          };

          // Llamar callback con el código
          if (onScan) {
            onScan({
              data: decodedText,
              type: decodedResult.result.format?.formatName || 'unknown'
            });
          }

          // Detener escáner después de escanear
          stopScanning();
        },
        (errorMessage) => {
          // Ignorar errores de "no se encontró código" (es normal)
          // Solo mostrar errores críticos
          if (!errorMessage.includes('No QR code')) {
            console.warn('Scan error:', errorMessage);
          }
        }
      );

      setScanning(true);
      setError(null);
    } catch (err) {
      console.error('Error starting scanner:', err);
      setError(err.message);
      setScanning(false);
    }
  };

  const stopScanning = async () => {
    try {
      if (html5QrCodeRef.current) {
        await html5QrCodeRef.current.stop();
        await html5QrCodeRef.current.clear();
        html5QrCodeRef.current = null;
      }
      setScanning(false);
      lastScannedCode.current = null;
    } catch (err) {
      console.error('Error stopping scanner:', err);
    }
  };

  // Iniciar automáticamente al montar
  useEffect(() => {
    startScanning();
    
    // Limpiar al desmontar
    return () => {
      stopScanning();
    };
  }, []);

  // Manejar cierre
  const handleClose = () => {
    stopScanning();
    if (onClose) {
      onClose();
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2>Escanear Código de Barras</h2>
        <button onClick={handleClose} style={styles.closeButton}>
          ✕ Cerrar
        </button>
      </div>

      {error && (
        <div style={styles.error}>
          <p>Error: {error}</p>
          <button onClick={startScanning}>Reintentar</button>
        </div>
      )}

      <div 
        id="reader" 
        style={styles.scanner}
      />

      {scanning && (
        <div style={styles.instructions}>
          <p>Apunta la cámara al código de barras</p>
          <p style={styles.hint}>
            Mantén el código dentro del marco y espera a que se escanee
          </p>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    color: '#fff',
  },
  closeButton: {
    padding: '10px 20px',
    backgroundColor: '#1a1a1a',
    color: '#fff',
    border: '2px solid #4CAF50',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: 'bold',
  },
  scanner: {
    flex: 1,
    width: '100%',
    position: 'relative',
  },
  instructions: {
    padding: '20px',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    color: '#fff',
    textAlign: 'center',
  },
  hint: {
    fontSize: '14px',
    color: '#ccc',
    marginTop: '10px',
  },
  error: {
    padding: '20px',
    backgroundColor: '#ff3b3b',
    color: '#fff',
    textAlign: 'center',
  },
};
```

---

## PASO 3: USAR EL COMPONENTE

```javascript
import React, { useState } from 'react';
import BarcodeScanner from './BarcodeScanner';

function App() {
  const [showScanner, setShowScanner] = useState(false);
  const [scannedCode, setScannedCode] = useState(null);

  const handleScan = (result) => {
    console.log('Código escaneado:', result.data);
    console.log('Tipo:', result.type);
    
    // Aquí procesas el código (llamar API, etc.)
    setScannedCode(result.data);
    setShowScanner(false);
    
    // Ejemplo: llamar API
    fetch('/api/products/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barcode: result.data })
    })
    .then(res => res.json())
    .then(data => {
      console.log('Producto encontrado:', data);
    });
  };

  return (
    <div>
      <button onClick={() => setShowScanner(true)}>
        Escanear Código
      </button>

      {scannedCode && (
        <p>Código escaneado: {scannedCode}</p>
      )}

      {showScanner && (
        <BarcodeScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}

export default App;
```

---

## PASO 4: PERMISOS EN MANIFEST (PWA)

En tu `manifest.json` o `manifest.webmanifest`:

```json
{
  "name": "Tu App",
  "short_name": "App",
  "start_url": "/",
  "display": "standalone",
  "permissions": [
    "camera"
  ]
}
```

---

## PASO 5: HTTPS O LOCALHOST (REQUISITO)

**CRÍTICO:** La API de cámara solo funciona en:
- `https://` (producción)
- `http://localhost` (desarrollo)
- `http://127.0.0.1` (desarrollo)

**NO funciona en `http://192.168.x.x`** (necesitas HTTPS o usar localhost)

---

## ALTERNATIVA: QUAGGA2 (Solo códigos de barras 1D)

Si solo necesitas códigos de barras 1D (no QR):

```bash
npm install quagga
```

```javascript
import Quagga from 'quagga';

function BarcodeScanner() {
  useEffect(() => {
    Quagga.init({
      inputStream: {
        name: "Live",
        type: "LiveStream",
        target: document.querySelector('#scanner'),
        constraints: {
          width: 640,
          height: 480,
          facingMode: "environment" // Cámara trasera
        }
      },
      locator: {
        patchSize: "medium",
        halfSample: true
      },
      numOfWorkers: 2,
      decoder: {
        readers: [
          "ean_reader",
          "ean_8_reader",
          "code_128_reader",
          "code_39_reader",
          "upc_reader",
          "upc_e_reader"
        ]
      },
      locate: true
    }, (err) => {
      if (err) {
        console.error('Error:', err);
        return;
      }
      Quagga.start();
    });

    Quagga.onDetected((result) => {
      const code = result.codeResult.code;
      console.log('Código detectado:', code);
      // Procesar código
      Quagga.stop();
    });

    return () => {
      Quagga.stop();
    };
  }, []);

  return <div id="scanner" style={{ width: '100%', height: '400px' }} />;
}
```

---

## PROBLEMAS COMUNES Y SOLUCIONES

### ❌ "getUserMedia is not defined"
**Solución:** Verifica que estés en HTTPS o localhost.

### ❌ "Camera permission denied"
**Solución:** El navegador pedirá permiso automáticamente. Asegúrate de permitirlo.

### ❌ "No se detectan códigos"
**Solución:**
- Mejora la iluminación
- Acerca la cámara (5-15cm del código)
- Verifica que el código esté enfocado
- Aumenta el tamaño del `qrbox`

### ❌ "Solo funciona en móvil, no en desktop"
**Solución:** En desktop, verifica que tengas cámara conectada. Algunos navegadores requieren HTTPS incluso en localhost para desktop.

---

## CHECKLIST FINAL

- [ ] Instalado `html5-qrcode` o `quagga`
- [ ] Componente creado con manejo de permisos
- [ ] Debounce implementado (2 segundos)
- [ ] Probado en HTTPS o localhost
- [ ] Permisos de cámara otorgados en el navegador
- [ ] Probado en dispositivo móvil (mejor experiencia)

---

## DIFERENCIAS CLAVE: PWA vs React Native

| React Native/Expo | PWA |
|-------------------|-----|
| `expo-camera` | `html5-qrcode` o `quagga` |
| `CameraView` component | `<div id="reader">` |
| `useCameraPermissions()` | `navigator.mediaDevices.getUserMedia()` |
| `onBarcodeScanned` prop | Callback en `html5QrCode.start()` |
| Funciona en app nativa | Funciona en navegador (HTTPS requerido) |

---

**NOTA:** Esta solución funciona en navegadores modernos (Chrome, Firefox, Safari, Edge) en dispositivos móviles y desktop con cámara.

