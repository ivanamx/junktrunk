# INSTRUCCIONES PARA REPLICAR LECTOR DE CÓDIGO DE BARRAS - PASO A PASO

## PROBLEMA COMÚN: Si después de 15 intentos no funciona, probablemente falta:
1. **Configuración en app.json** (CRÍTICO - sin esto no funciona)
2. **Permisos de cámara** no configurados correctamente
3. **Versión incorrecta de expo-camera**

---

## PASO 1: INSTALAR DEPENDENCIAS EXACTAS

```bash
npx expo install expo-camera@~17.0.9 expo-location@~19.0.7
```

**IMPORTANTE:** Usa estas versiones exactas. Otras versiones pueden no funcionar.

---

## PASO 2: CONFIGURAR app.json (CRÍTICO - SIN ESTO NO FUNCIONA)

Agrega estos plugins en tu `app.json`:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-location",
        {
          "locationAlwaysAndWhenInUsePermission": "Allow $(PRODUCT_NAME) to use your location."
        }
      ],
      [
        "expo-build-properties",
        {
          "android": {
            "minSdkVersion": 24,
            "targetSdkVersion": 34,
            "compileSdkVersion": 35
          }
        }
      ],
      "expo-camera"
    ],
    "android": {
      "permissions": [
        "android.permission.CAMERA",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION"
      ]
    }
  }
}
```

**DESPUÉS DE MODIFICAR app.json:**
```bash
# Limpia el caché y reconstruye
npx expo prebuild --clean
# O si usas Expo Go, reinicia completamente:
# Cierra Expo Go, ejecuta: npx expo start --clear
```

---

## PASO 3: CÓDIGO MÍNIMO FUNCIONAL

Crea un componente `BarcodeScanner.js` con este código EXACTO:

```javascript
import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';

export default function BarcodeScanner() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [scannedCode, setScannedCode] = useState(null);
  const processingRef = useRef(false);
  const lastScannedCode = useRef(null);

  const handleScan = async () => {
    if (!permission) {
      return;
    }
    if (!permission.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Permission Denied', 'Camera permission is required.');
        return;
      }
    }
    setScanning(true);
    setScannedCode(null);
    processingRef.current = false;
    lastScannedCode.current = null;
  };

  const handleBarCodeScanned = ({ data, type }) => {
    // Validar datos
    if (!data || String(data).trim().length === 0) {
      return;
    }
    
    const barcodeString = String(data).trim();
    
    // Prevenir procesamiento duplicado
    if (processingRef.current) {
      return;
    }
    
    // Debounce: ignorar mismo código en 2 segundos
    const now = Date.now();
    if (lastScannedCode.current && 
        lastScannedCode.current.data === barcodeString && 
        (now - lastScannedCode.current.timestamp) < 2000) {
      return;
    }
    
    // Marcar como procesando
    processingRef.current = true;
    lastScannedCode.current = { data: barcodeString, timestamp: now };
    
    // Mostrar código escaneado
    setScannedCode({ data: barcodeString, type });
    
    // Aquí procesas el código (llamar API, etc.)
    console.log('Código escaneado:', barcodeString);
    
    // Resetear después de procesar
    setTimeout(() => {
      processingRef.current = false;
      setScanning(false);
      setScannedCode(null);
    }, 1000);
  };

  if (scanning) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.scannerContainer}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            onBarcodeScanned={handleBarCodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: [
                'ean13',
                'upc_a',
                'code128',
                'ean8',
                'upc_e',
                'code39',
                'code93',
                'itf14',
                'codabar',
                'qr',
                'pdf417',
                'datamatrix',
                'aztec',
              ],
              interval: 100, // 10 escaneos por segundo
            }}
          />
          
          {/* Overlay simple */}
          <View style={styles.overlay}>
            <View style={styles.scannerWindow}>
              {scannedCode ? (
                <View style={styles.scannedContainer}>
                  <Text style={styles.scannedText}>Código: {scannedCode.data}</Text>
                  <Text style={styles.scannedType}>Tipo: {scannedCode.type}</Text>
                </View>
              ) : (
                <Text style={styles.instructionText}>
                  Apunta la cámara al código de barras
                </Text>
              )}
            </View>
            
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                processingRef.current = false;
                setScanning(false);
                setScannedCode(null);
              }}
            >
              <Text style={styles.cancelButtonText}>CANCELAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <TouchableOpacity style={styles.scanButton} onPress={handleScan}>
          <Text style={styles.scanButtonText}>ESCANEAR</Text>
        </TouchableOpacity>
        {scannedCode && (
          <Text style={styles.resultText}>
            Último código: {scannedCode.data}
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scannerContainer: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerWindow: {
    width: '80%',
    height: 200,
    borderWidth: 2,
    borderColor: '#4CAF50',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    marginBottom: 50,
  },
  instructionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
  scannedContainer: {
    alignItems: 'center',
  },
  scannedText: {
    color: '#4CAF50',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  scannedType: {
    color: '#ccc',
    fontSize: 12,
  },
  cancelButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 30,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  scanButton: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 18,
    paddingHorizontal: 40,
    borderRadius: 8,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  resultText: {
    marginTop: 20,
    fontSize: 16,
    color: '#333',
  },
});
```

---

## PASO 4: VERIFICAR QUE FUNCIONA

1. **Ejecuta en dispositivo físico** (no simulador - la cámara no funciona bien en simulador)
2. **Verifica permisos:** La app debe pedir permiso de cámara al iniciar
3. **Prueba con código real:** Usa un código de barras físico (no imagen en pantalla)

---

## PROBLEMAS COMUNES Y SOLUCIONES

### ❌ "Camera permission denied"
**Solución:** Verifica que `app.json` tenga el plugin `expo-camera` y los permisos de Android.

### ❌ "onBarcodeScanned no se ejecuta"
**Solución:** 
- Verifica que `scanning` esté en `true`
- Verifica que `onBarcodeScanned` no sea `undefined`
- Asegúrate de usar `CameraView` (no `Camera` - está deprecated)

### ❌ "No detecta códigos"
**Solución:**
- Reduce la distancia (5-15cm del código)
- Asegúrate de buena iluminación
- Verifica que el código esté dentro del área de escaneo
- Aumenta el `interval` a 50ms si es necesario

### ❌ "Se escanea múltiples veces el mismo código"
**Solución:** El debounce de 2 segundos ya está implementado. Si persiste, aumenta el tiempo.

---

## CHECKLIST FINAL

- [ ] Dependencias instaladas: `expo-camera@~17.0.9` y `expo-location@~19.0.7`
- [ ] `app.json` tiene el plugin `expo-camera`
- [ ] `app.json` tiene permisos de Android configurados
- [ ] Ejecutaste `npx expo prebuild --clean` después de modificar `app.json`
- [ ] Probaste en dispositivo físico (no simulador)
- [ ] La app pidió permiso de cámara
- [ ] El código usa `CameraView` (no `Camera`)
- [ ] El handler `onBarcodeScanned` está definido cuando `scanning === true`

---

## NOTAS IMPORTANTES

1. **NO uses `Camera` (deprecated)**, usa `CameraView`
2. **NO pruebes en simulador**, usa dispositivo físico
3. **SIEMPRE verifica permisos** antes de abrir la cámara
4. **El debounce es crítico** para evitar escaneos múltiples
5. **El `processingRef` previene** que se procese el mismo código dos veces

---

Si después de seguir estos pasos EXACTOS no funciona, el problema está en:
- Versión de Expo SDK (debe ser compatible con expo-camera 17.0.9)
- Configuración del dispositivo (permisos del sistema)
- Build corrupto (ejecuta `npx expo prebuild --clean`)

