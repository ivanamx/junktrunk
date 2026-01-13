# MENSAJE PARA OTRO AGENTE - LECTOR DE CÓDIGO DE BARRAS EN PWA

## ⚠️ CONTEXTO CRÍTICO

**Este proyecto es PWA (Progressive Web App), NO React Native/Expo.**

**NO puedes usar:**
- ❌ `expo-camera` (solo para React Native)
- ❌ `CameraView` (solo para React Native)
- ❌ Cualquier librería de React Native

**DEBES usar:**
- ✅ APIs web nativas (`getUserMedia`)
- ✅ Librerías JavaScript para navegador
- ✅ `html5-qrcode` o `quagga2`

---

## SOLUCIÓN RÁPIDA

### 1. Instalar dependencia:
```bash
npm install html5-qrcode
```

### 2. Código mínimo funcional:

```javascript
import { Html5Qrcode } from 'html5-qrcode';

function BarcodeScanner({ onScan }) {
  const html5QrCodeRef = useRef(null);
  const lastScannedCode = useRef(null);

  useEffect(() => {
    const html5QrCode = new Html5Qrcode("reader");
    html5QrCodeRef.current = html5QrCode;

    html5QrCode.start(
      { facingMode: "environment" }, // Cámara trasera
      {
        fps: 10,
        qrbox: { width: 250, height: 250 }
      },
      (decodedText) => {
        // DEBOUNCE: Ignorar mismo código en 2 segundos
        const now = Date.now();
        if (lastScannedCode.current?.data === decodedText && 
            (now - lastScannedCode.current.timestamp) < 2000) {
          return;
        }
        lastScannedCode.current = { data: decodedText, timestamp: now };
        
        // Procesar código
        onScan({ data: decodedText });
        html5QrCode.stop();
      }
    );

    return () => html5QrCode.stop();
  }, []);

  return <div id="reader" style={{ width: '100%', height: '400px' }} />;
}
```

### 3. REQUISITOS CRÍTICOS:

- **HTTPS o localhost:** La cámara NO funciona en `http://192.168.x.x`
- **Permisos:** El navegador pedirá permiso automáticamente
- **Dispositivo móvil:** Funciona mejor en móvil que en desktop

---

## DIFERENCIAS CLAVE

| Lo que NO funciona (React Native) | Lo que SÍ funciona (PWA) |
|-----------------------------------|--------------------------|
| `expo-camera` | `html5-qrcode` |
| `CameraView` | `<div id="reader">` |
| `useCameraPermissions()` | `getUserMedia()` automático |
| App nativa | Navegador web |

---

## PROBLEMA MÁS COMÚN

**"No funciona la cámara"** → Verifica que estés en:
- ✅ `https://tu-dominio.com`
- ✅ `http://localhost:3000`
- ✅ `http://127.0.0.1:3000`

**NO funciona en:**
- ❌ `http://192.168.1.100:3000` (necesitas HTTPS)

---

## ARCHIVO COMPLETO

Lee `INSTRUCCIONES_LECTOR_PWA.md` para código completo con:
- Manejo de errores
- Estilos
- Múltiples formatos de códigos
- Alternativa con Quagga2

---

**RESUMEN:** Para PWA usa `html5-qrcode`, NO `expo-camera`. Funciona en navegador con HTTPS/localhost.

