import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  Animated,
  Linking,
  FlatList,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import ApiService from '../services/api';
import AuthService from '../services/authService';
import PlatformSelectionScreen from './PlatformSelectionScreen';
import DescriptionScreen from './DescriptionScreen';
import HistoryScreen from './HistoryScreen';

export default function HomeScreen() {
  const navigation = useNavigation();
  const [scannedProduct, setScannedProduct] = useState(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPlatforms, setShowPlatforms] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState(null);
  const [scanCountdown, setScanCountdown] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const processingRef = useRef(false);
  const lastScannedCode = useRef(null);
  const scanTimeoutRef = useRef(null);
  const pricesCarouselRef = useRef(null);
  const pricesAutoScrollRef = useRef(null);
  const scrollOffsetRef = useRef(0);
  const pricesScrollAnim = useRef(new Animated.Value(0)).current;
  const itemWidthsRef = useRef({});

  // Animate scanning line when scanner is active
  useEffect(() => {
    if (scanning && !scanned && !loading && !scannedBarcode) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(scanLineAnim, {
            toValue: 0,
            duration: 2000,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      scanLineAnim.setValue(0);
    }
  }, [scanning, scanned, loading, scannedBarcode]);

  // Continuous smooth scrolling prices ticker (like Wall Street)
  useEffect(() => {
    // Only auto-scroll if we have multiple prices and a product is scanned
    if (scannedProduct && scannedProduct.prices && scannedProduct.prices.length > 1) {
      const prices = scannedProduct.prices.slice(0, 5); // Limit to 5
      
      // Reset scroll position when product changes
      scrollOffsetRef.current = 0;
      itemWidthsRef.current = {};
      
      // Clear any existing animation frame
      if (pricesAutoScrollRef.current) {
        cancelAnimationFrame(pricesAutoScrollRef.current);
        pricesAutoScrollRef.current = null;
      }
      
      // Wait a bit before starting scroll to ensure FlatList is ready
      const startTimeout = setTimeout(() => {
        const scrollSpeed = 0.3; // pixels per frame (adjust for speed - lower = slower)
        
        const continuousScroll = () => {
          if (pricesCarouselRef.current) {
            scrollOffsetRef.current += scrollSpeed;
            
            // Calculate total width based on actual item widths or estimate
            let totalContentWidth = 0;
            const itemWidths = Object.values(itemWidthsRef.current);
            if (itemWidths.length > 0 && itemWidths[0] > 0) {
              // Use actual measured widths
              totalContentWidth = itemWidths.reduce((sum, width) => sum + width, 0) / 2; // Divide by 2 since we duplicated
            } else {
              // Fallback to estimate
              const estimatedItemWidth = 180;
              totalContentWidth = prices.length * estimatedItemWidth;
            }
            
            // Reset to 0 when we reach the end (seamless loop with duplicated items)
            if (scrollOffsetRef.current >= totalContentWidth) {
              scrollOffsetRef.current = 0;
            }
            
            try {
              pricesCarouselRef.current.scrollToOffset({
                offset: scrollOffsetRef.current,
                animated: false, // We're animating manually for smoothness
              });
            } catch (error) {
              // Ignore errors, continue scrolling
            }
          }
          
          // Continue scrolling - store in ref so we can cancel it
          pricesAutoScrollRef.current = requestAnimationFrame(continuousScroll);
        };
        
        // Start the continuous scroll
        pricesAutoScrollRef.current = requestAnimationFrame(continuousScroll);
      }, 500); // Wait 500ms before starting scroll
      
      // Cleanup on unmount or when product changes
      return () => {
        clearTimeout(startTimeout);
        if (pricesAutoScrollRef.current) {
          cancelAnimationFrame(pricesAutoScrollRef.current);
          pricesAutoScrollRef.current = null;
        }
      };
    } else {
      // Reset if we don't have multiple prices
      scrollOffsetRef.current = 0;
      if (pricesAutoScrollRef.current) {
        cancelAnimationFrame(pricesAutoScrollRef.current);
        pricesAutoScrollRef.current = null;
      }
    }
  }, [scannedProduct]);

  const handleScan = async () => {
    console.log('📷 handleScan called, permission:', permission);
    if (!permission) {
      // Permission is still being requested
      console.log('⏳ Permission still being requested');
      return;
    }
    if (!permission.granted) {
      console.log('🔒 Requesting camera permission');
      const result = await requestPermission();
      if (!result.granted) {
        console.log('❌ Camera permission denied');
        Alert.alert('Permission Denied', 'Camera permission is required to scan barcodes.');
        return;
      }
      console.log('✅ Camera permission granted');
    }
    // Reset all scan states
    console.log('🔄 Resetting scan states');
    setScanned(false);
    setScannedBarcode(null);
    setScanCountdown(0);
    setLoading(false);
    setIsProcessing(false);
    processingRef.current = false;
    lastScannedCode.current = null;
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
    setScanning(true);
    setTorchEnabled(false); // Reset linterna al abrir escáner
    console.log('✅ Scanner activated');
  };

  const processScannedCode = React.useCallback(async (barcodeData) => {
    try {
      console.log('Processing barcode:', barcodeData);
      
      // Get current location
      let latitude = null;
      let longitude = null;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({});
          latitude = location.coords.latitude;
          longitude = location.coords.longitude;
          console.log('📍 Location obtained:', { latitude, longitude });
        } else {
          console.log('⚠️ Location permission denied');
        }
      } catch (locationError) {
        console.error('⚠️ Error getting location:', locationError);
      }
      
      // Get current user ID
      const user = await AuthService.getUser();
      const userId = user ? user.id : null;
      
      const response = await ApiService.scanProduct(barcodeData, null, null, latitude, longitude, userId);
      
      if (response && response.success && response.product) {
        console.log('💰 Prices received:', response.product.prices?.length || 0, 'prices');
        // Limit prices to 5 in frontend (already limited in backend, but double-check)
        if (response.product.prices && response.product.prices.length > 5) {
          response.product.prices = response.product.prices.slice(0, 5);
        }
        setScannedProduct(response.product);
        // Scroll reset is handled automatically in useEffect when scannedProduct changes
      } else if (response && response.success === false && response.error === 'PRODUCT_NOT_FOUND') {
        // Product not found in any API - show message without creating product
        console.log('❌ Product not found in any API');
        setScannedProduct({
          barcode: barcodeData,
          name: 'Product Not Found',
          price: null,
          image: null,
          description: 'Not found in any API',
          suggestions: [],
          notFound: true
        });
      } else {
        // Even if API fails, create a local product with the barcode
        const localProduct = {
          barcode: barcodeData,
          name: `Code: ${barcodeData}`,
          price: null,
          image: null,
          description: null,
          suggestions: [
            {
              platform: 'Amazon',
              url: `https://www.amazon.com/s?k=${encodeURIComponent(barcodeData)}`,
              name: 'Search on Amazon'
            },
            {
              platform: 'eBay',
              url: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(barcodeData)}`,
              name: 'Search on eBay'
            },
            {
              platform: 'Google',
              url: `https://www.google.com/search?q=${encodeURIComponent(barcodeData)}`,
              name: 'Search on Google'
            },
            {
              platform: 'MercadoLibre',
              url: `https://listado.mercadolibre.com.mx/${encodeURIComponent(barcodeData)}`,
              name: 'Search on MercadoLibre'
            }
          ]
        };
        setScannedProduct(localProduct);
      }
    } catch (error) {
      console.error('Scan error:', error);
      
      // Check if it's a network error
      const isNetworkError = error.message?.includes('Network request failed') || 
                             error.message?.includes('timeout') ||
                             error.name === 'TypeError';
      
      if (isNetworkError) {
        console.warn('⚠️ Network error - creating local product without API data');
        // Mostrar alerta informativa
        Alert.alert(
          'Server Connection Failed',
          'Could not connect to the server. The scanned code will be displayed with search options.\n\nMake sure the backend is running and localtunnel is active.',
          [{ text: 'OK' }]
        );
      }
      
      // Create a local product even if connection fails
      const localProduct = {
        barcode: barcodeData,
        name: `Product - Code: ${barcodeData}`,
        price: null,
        image: null,
        description: 'Information unavailable (server connection failed)',
        suggestions: [
          {
            platform: 'Amazon',
            url: `https://www.amazon.com/s?k=${encodeURIComponent(barcodeData)}`,
            name: 'Search on Amazon'
          },
          {
            platform: 'eBay',
            url: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(barcodeData)}`,
            name: 'Search on eBay'
          },
          {
            platform: 'Google',
            url: `https://www.google.com/search?q=${encodeURIComponent(barcodeData)}`,
            name: 'Search on Google'
          },
          {
            platform: 'MercadoLibre',
            url: `https://listado.mercadolibre.com.mx/${encodeURIComponent(barcodeData)}`,
            name: 'Search on MercadoLibre'
          }
        ]
      };
      setScannedProduct(localProduct);
    } finally {
      // Always reset processing state immediately to allow re-scanning
      // This is critical - must reset synchronously to prevent scanner lock
      processingRef.current = false;
      setIsProcessing(false);
      setLoading(false);
      setScanCountdown(0);
      
      // Cerrar el escáner después de procesar para que el usuario vea el resultado
      // El usuario puede volver a abrir el escáner si necesita escanear más códigos
      setScanning(false);
      setScanned(false);
      setScannedBarcode(null);
      // Resetear lastScannedCode para permitir re-escaneos del mismo código si es necesario
      lastScannedCode.current = null;
    }
  }, []);

  const handleBarCodeScanned = React.useCallback(({ data, type }) => {
    console.log('🔍 handleBarCodeScanned called:', { data, type, processingRef: processingRef.current });
    
    // Validate barcode data - más permisivo para detectar todos los códigos
    if (!data || (typeof data === 'string' && data.trim().length === 0)) {
      console.log('⚠️ Invalid barcode data (empty):', data);
      return;
    }
    
    // Convertir a string si no lo es
    const barcodeString = String(data).trim();
    if (barcodeString.length === 0) {
      console.log('⚠️ Invalid barcode data (empty after trim):', data);
      return;
    }
    
    // Prevent processing if already processing (any code)
    if (processingRef.current) {
      console.log('⏭️ Already processing a scan, ignoring new scan');
      return;
    }
    
    // Debounce: ignore if same code scanned within 2000ms (2 seconds) to prevent multiple rapid scans
    const now = Date.now();
    if (lastScannedCode.current && 
        lastScannedCode.current.data === barcodeString && 
        (now - lastScannedCode.current.timestamp) < 2000) {
      console.log('⏭️ Duplicate scan ignored (debounce - same code within 2s)');
      return;
    }
    
    console.log('✅ Barcode detected:', { 
      data: barcodeString, 
      type, 
      length: barcodeString.length,
      timestamp: new Date().toISOString()
    });
    
    // Store last scanned code with timestamp
    lastScannedCode.current = { data: barcodeString, timestamp: now };
    
    // Clear any existing timeout
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
    }
    
    // Mark as processing immediately (synchronous, prevents race conditions)
    processingRef.current = true;
    
    // Update state (async, but ref is already set)
    setIsProcessing(true);
    setScannedBarcode({ data: barcodeString, type });
    setScanned(true);
    setLoading(true);
    
    // Process immediately without countdown delay
    processScannedCode(barcodeString);
  }, [processScannedCode]);


  const handlePost = () => {
    if (!scannedProduct) {
      Alert.alert('No Product', 'Please scan a product first.');
      return;
    }
    setShowPlatforms(true);
  };

  const handleCreateDescription = () => {
    if (!scannedProduct) {
      Alert.alert('No Product', 'Please scan a product first.');
      return;
    }
    setShowDescription(true);
  };

  const handlePlatformSelect = (platform, response) => {
    // Close the modal after platform selection
    // The PlatformSelectionScreen component handles alerts and URL opening
    setShowPlatforms(false);
  };

  const handleDescriptionGenerated = (description, price = null) => {
    // Update product with description and price locally
    if (scannedProduct) {
      const updatedProduct = {
        ...scannedProduct,
        description: description,
      };
      
      // Update price if provided
      if (price) {
        updatedProduct.price = price;
      }
      
      setScannedProduct(updatedProduct);
    }
    
    // Update product in backend if it has an ID
    if (scannedProduct && scannedProduct.id) {
      const updateData = { description };
      if (price) {
        updateData.price = price;
      }
      ApiService.updateProduct(scannedProduct.id, updateData);
    }
  };

  if (scanning) {
    // NO desactivar el escáner - permitir múltiples intentos incluso durante procesamiento
    // Esto ayuda a detectar códigos pequeños que pueden necesitar varios intentos
    const shouldDisableScanner = false; // Siempre activo para mejor detección
    
    // Log scanner state
    console.log('📷 Scanner active - ready to scan (always enabled for better detection)');
    
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.scannerContainer}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            onBarcodeScanned={shouldDisableScanner ? undefined : handleBarCodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: [
                // TODOS los tipos de códigos soportados por expo-camera
                // Códigos de barras lineales (1D) - ordenados por frecuencia de uso
                'ean13',        // European Article Number 13 dígitos (incluye ISBN-13 para libros)
                'upc_a',        // Universal Product Code A (12 dígitos, muy común)
                'code128',      // Code 128 (muy versátil, usado en logística)
                'ean8',         // European Article Number 8 dígitos
                'upc_e',        // Universal Product Code E (6 dígitos)
                'code39',       // Code 39 (alfanumérico)
                'code93',       // Code 93
                'itf14',        // Interleaved 2 of 5 (14 dígitos, usado en cajas)
                'codabar',      // Codabar
                // Códigos de barras 2D
                'qr',           // QR Code
                'pdf417',       // PDF417
                'datamatrix',   // Data Matrix
                'aztec',        // Aztec Code
              ],
              // Interval reducido para mejor detección de códigos pequeños/densos
              // 100ms = escanea 10 veces por segundo (más frecuente = mejor para códigos pequeños)
              interval: 100,
            }}
            enableTorch={torchEnabled}
          />
          {/* Overlay with transparent scanning window */}
          <View style={styles.scannerOverlay}>
            {/* Top dark area */}
            <View style={styles.overlayTop} />
            
            {/* Middle section with transparent window */}
            <View style={styles.overlayMiddle}>
              <View style={styles.overlaySide} />
              
              {/* Scanning window with frame - transparent center */}
              <View style={styles.scannerWindow} pointerEvents="none">
                {/* Corner brackets */}
                <View style={[styles.corner, styles.cornerTopLeft]} />
                <View style={[styles.corner, styles.cornerTopRight]} />
                <View style={[styles.corner, styles.cornerBottomLeft]} />
                <View style={[styles.corner, styles.cornerBottomRight]} />
                
                {/* Animated scanning line */}
                {!scanned && !loading && (
                  <Animated.View 
                    style={[
                      styles.scanningLine,
                      {
                        transform: [
                          {
                            translateY: scanLineAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [-120, 120],
                            }),
                          },
                        ],
                      },
                    ]} 
                  />
                )}
              </View>
              
              <View style={styles.overlaySide} />
            </View>
            
            {/* Bottom dark area with instructions */}
            <View style={styles.overlayBottom}>
              {scannedBarcode ? (
                <View style={styles.scannedBarcodeContainer}>
                  <Text style={styles.scannerText}>Code Scanned!</Text>
                  <View style={styles.barcodeDisplay}>
                    <Text style={styles.barcodeText}>{scannedBarcode.data}</Text>
                    <Text style={styles.barcodeType}>Type: {scannedBarcode.type}</Text>
                  </View>
                  {loading ? (
                    <>
                      <Text style={styles.countdownText}>Looking up product...</Text>
                      <ActivityIndicator 
                        size="large" 
                        color="#4CAF50" 
                        style={styles.loadingIndicator}
                      />
                    </>
                  ) : null}
                </View>
              ) : (
                <>
                  <Text style={styles.scannerText}>
                    Point camera at barcode
                  </Text>
                  <Text style={styles.scannerHint}>
                    Keep the code within the frame and wait for it to scan{'\n'}
                    For small codes: bring camera closer (5-15cm) or activate flashlight{'\n'}
                    Scanner detects all types and sizes - you can scan multiple codes{'\n'}
                    Press CANCEL when finished
                  </Text>
                </>
              )}
              <View style={styles.scannerControls}>
                <TouchableOpacity
                  style={[styles.torchButton, torchEnabled && styles.torchButtonActive]}
                  onPress={() => {
                    setTorchEnabled(!torchEnabled);
                  }}
                >
                  <Text style={styles.torchButtonText}>
                    {torchEnabled ? '🔦 FLASHLIGHT ON' : '🔦 FLASHLIGHT OFF'}
                  </Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  console.log('🚫 Cancel button pressed, resetting all states');
                  processingRef.current = false;
                  setIsProcessing(false);
                  setScanned(false);
                  setScannedBarcode(null);
                  setLoading(false);
                  setScanCountdown(0);
                  lastScannedCode.current = null;
                  if (scanTimeoutRef.current) {
                    clearTimeout(scanTimeoutRef.current);
                    scanTimeoutRef.current = null;
                  }
                  setScanning(false);
                  setTorchEnabled(false);
                  console.log('✅ All states reset');
                }}
              >
                <Text style={styles.cancelButtonText}>CANCEL</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const handleLogout = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await AuthService.logout();
              // App.js will detect the auth state change and show login screen
            } catch (error) {
              console.error('Logout error:', error);
              Alert.alert('Error', 'Failed to sign out. Please try again.');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Logout button - positioned absolutely in top right */}
      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
        activeOpacity={0.7}
      >
        <Text style={styles.logoutButtonText}>🚪</Text>
      </TouchableOpacity>
      
      <View style={styles.scrollContent}>
        {/* Header with Logo and Go Junkin Button */}
        <View style={styles.header}>
          {/* Logo placeholder - aligned to the left */}
          <View style={styles.logoContainer}>
            <Image
              source={require('../assets/JunkTrunkLogo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          
          {/* Go Junkin Button - aligned to the right */}
          <TouchableOpacity
            style={styles.goJunkinButton}
            onPress={() => navigation.navigate('Map')}
          >
            <Text style={styles.goJunkinButtonText}>Go Junkin!</Text>
          </TouchableOpacity>
        </View>

        {/* Scan Button and History Button in same row */}
        <View style={styles.scanButtonsRow}>
          <TouchableOpacity
            style={[styles.scanButton, styles.scanButtonFlex]}
            onPress={handleScan}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.scanButtonText}>SCAN</Text>
            )}
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.historyButton}
            onPress={() => setShowHistory(true)}
          >
            <Ionicons name="time-outline" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Product Info Display */}
        {scannedProduct ? (
          <View style={styles.productContainer}>
            <View style={styles.productImageContainer}>
              {scannedProduct.image ? (
                <Image
                  source={{ uri: scannedProduct.image }}
                  style={styles.productImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={[styles.productImage, styles.productImagePlaceholder]}>
                  <Text style={styles.productImagePlaceholderText}>No image</Text>
                </View>
              )}
              {/* Scan Date Badge - Overlay on top of image */}
              {scannedProduct.lastScannedAt && (
                <View style={styles.scanBadgeOverlay}>
                  <Text style={styles.scanBadgeText}>
                    Scanned on {new Date(scannedProduct.lastScannedAt).toLocaleDateString('en-US', { 
                      month: '2-digit', 
                      day: '2-digit', 
                      year: '2-digit' 
                    })}{' '}
                    in{' '}
                    {scannedProduct.lastScannedLatitude && scannedProduct.lastScannedLongitude ? (
                      <Text 
                        style={styles.scanBadgeLink}
                        onPress={() => {
                          navigation.navigate('Map', {
                            latitude: scannedProduct.lastScannedLatitude,
                            longitude: scannedProduct.lastScannedLongitude,
                            productName: scannedProduct.name
                          });
                        }}
                      >
                        here
                      </Text>
                    ) : (
                      <Text style={styles.scanBadgeText}>here</Text>
                    )}
                  </Text>
                </View>
              )}
              {/* Prices Badge - Overlay on bottom of image */}
              {scannedProduct.prices && scannedProduct.prices.length > 0 && (
                <View style={styles.pricesOverlay}>
                  {scannedProduct.prices.length === 1 ? (
                    // Single price - simple display
                    <View style={styles.singlePriceContainer}>
                      <Text style={styles.priceSourceLabel}>{scannedProduct.prices[0].source}:</Text>
                      <Text style={styles.priceValue}>{scannedProduct.prices[0].price}</Text>
                    </View>
                  ) : (
                    // Multiple prices - continuous scrolling ticker (like Wall Street)
                    <FlatList
                      ref={pricesCarouselRef}
                      data={[...scannedProduct.prices.slice(0, 5), ...scannedProduct.prices.slice(0, 5)]} // Duplicate for seamless loop
                      horizontal
                      pagingEnabled={false}
                      showsHorizontalScrollIndicator={false}
                      scrollEnabled={false} // Disable manual scrolling for auto-scroll
                      keyExtractor={(item, index) => `${item.source}-${index}`}
                      renderItem={({ item, index }) => {
                        return (
                          <View 
                            style={styles.priceItemContainer}
                            onLayout={(event) => {
                              // Store item width for accurate scrolling
                              const width = event.nativeEvent.layout.width;
                              itemWidthsRef.current[index] = width;
                            }}
                          >
                            <Text style={styles.priceSourceLabel}>{item.source}:</Text>
                            <Text style={styles.priceValue}>{item.price}</Text>
                          </View>
                        );
                      }}
                      style={styles.pricesCarousel}
                      contentContainerStyle={styles.pricesCarouselContent}
                      removeClippedSubviews={false}
                    />
                  )}
                </View>
              )}
              {/* Product Not Found Message - Overlay on center of image */}
              {scannedProduct.notFound && (
                <View style={styles.notFoundOverlay}>
                  <View style={styles.notFoundOverlayContent}>
                    <Text style={styles.notFoundOverlayTitle}>Product Not Found</Text>
                    <Text style={styles.notFoundOverlayText}>
                      Code {scannedProduct.barcode} not found in any API
                    </Text>
                    <Text style={styles.notFoundOverlaySubtext}>
                      No record saved
                    </Text>
                  </View>
                </View>
              )}
            </View>
            <View style={styles.productInfo}>
              <Text 
                style={styles.productName}
                numberOfLines={3}
                ellipsizeMode="tail"
              >
                {scannedProduct.name}
              </Text>
              {scannedProduct.barcode && (
                <Text style={styles.productBarcode}>Code: {scannedProduct.barcode}</Text>
              )}
              {scannedProduct.description && (
                <Text style={styles.productDescription}>{scannedProduct.description}</Text>
              )}
              {scannedProduct.price && (
                <Text style={styles.productPrice}>{scannedProduct.price}</Text>
              )}
              {!scannedProduct.price && scannedProduct.description?.includes('server connection') && (
                <View style={styles.networkWarning}>
                  <Text style={styles.networkWarningText}>
                    ⚠️ Server connection failed - Limited information
                  </Text>
                </View>
              )}
              
              {/* Search Suggestions */}
              {scannedProduct.suggestions && scannedProduct.suggestions.length > 0 && (
                <View style={styles.suggestionsContainer}>
                  <Text style={styles.suggestionsTitle}>Search on:</Text>
                  <View style={styles.suggestionsList}>
                    {scannedProduct.suggestions.map((suggestion, index) => (
                      <TouchableOpacity
                        key={index}
                        style={styles.suggestionButton}
                        onPress={() => {
                          Linking.openURL(suggestion.url).catch(err => 
                            console.error('Error opening URL:', err)
                          );
                        }}
                      >
                        <Text style={styles.suggestionButtonText}>{suggestion.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
              
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.postButton]}
                  onPress={handlePost}
                >
                  <Text style={styles.actionButtonText}>POST</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.actionButton, styles.descriptionButton]}
                  onPress={handleCreateDescription}
                >
                  <Text style={styles.actionButtonText}>CREATE DESCRIPTION</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.placeholderContainer}>
            <Text style={styles.placeholderText}>
              Scan a product to see details here
            </Text>
          </View>
        )}
      </View>

      {/* Platform Selection Modal */}
      <PlatformSelectionScreen
        visible={showPlatforms}
        onClose={() => setShowPlatforms(false)}
        product={scannedProduct}
        onPlatformSelect={handlePlatformSelect}
      />

      {/* Description Modal */}
      <DescriptionScreen
        visible={showDescription}
        onClose={() => setShowDescription(false)}
        product={scannedProduct}
        onDescriptionGenerated={handleDescriptionGenerated}
      />

      {/* History Modal */}
      <HistoryScreen
        visible={showHistory}
        onClose={() => setShowHistory(false)}
        navigation={navigation}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  logoutButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  logoutButtonText: {
    fontSize: 20,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 15,
    marginBottom: 40,
    paddingHorizontal: 0,
  },
  logoContainer: {
    width: 200,
    height: 108,
    justifyContent: 'center',
    alignItems: 'flex-start',
    // Add border for visibility - remove when logo is added
    // borderWidth: 1,
    // borderColor: '#e0e0e0',
    // borderStyle: 'dashed',
  },
  logo: {
    width: 200,
    height: 108,
  },
  goJunkinButton: {
    backgroundColor: '#2c5f2d',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  goJunkinButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  scanButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 30,
    alignItems: 'center',
  },
  scanButton: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 18,
    paddingHorizontal: 40,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  scanButtonFlex: {
    flex: 1,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  historyButton: {
    backgroundColor: '#1a1a1a',
    width: 60,
    height: 60,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  historyButtonText: {
    fontSize: 28,
  },
  productContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 30,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  productImageContainer: {
    position: 'relative',
    width: '100%',
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 15, // Padding para que la imagen se vea más pequeña dentro del contenedor
  },
  productImage: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  productImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  productImagePlaceholderText: {
    color: '#999',
    fontSize: 16,
  },
  productInfo: {
    padding: 20,
  },
  productName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
    textAlign: 'justify',
  },
  productBarcode: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    fontFamily: 'monospace',
  },
  productDescription: {
    fontSize: 14,
    color: '#888',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  productPrice: {
    fontSize: 28,
    fontWeight: '800',
    color: '#2c5f2d',
    marginBottom: 20,
  },
  networkWarning: {
    backgroundColor: '#fff3cd',
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#ffc107',
  },
  networkWarningText: {
    color: '#856404',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  scanBadgeOverlay: {
    position: 'absolute',
    top: 10,
    left: 10,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(232, 245, 233, 0.95)',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4CAF50',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  pricesOverlay: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.75)', // Más transparente (0.75 en lugar de 0.95)
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#FF9900',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    alignSelf: 'flex-start', // Ocupa solo el tamaño del contenido
    justifyContent: 'center', // Centrar verticalmente el contenido
    alignItems: 'center', // Centrar horizontalmente el contenido
  },
  singlePriceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingRight: 8, // Espacio entre items en el carrusel
  },
  pricesCarousel: {
    height: 24, // Reducido para que ocupe menos espacio vertical
  },
  pricesCarouselContent: {
    alignItems: 'center', // Centrar verticalmente los items
    justifyContent: 'center', // Centrar horizontalmente si es necesario
  },
  priceSourceLabel: {
    color: '#131921',
    fontSize: 13,
    fontWeight: '600',
    marginRight: 5,
  },
  priceValue: {
    color: '#FF9900',
    fontSize: 14,
    fontWeight: '700',
  },
  scanBadgeText: {
    color: '#2c5f2d',
    fontSize: 12,
    fontWeight: '600',
  },
  scanBadgeLink: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  suggestionsContainer: {
    marginBottom: 20,
  },
  suggestionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 10,
  },
  suggestionsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  suggestionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  postButton: {
    backgroundColor: '#1a1a1a',
  },
  descriptionButton: {
    backgroundColor: '#4a4a4a',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  placeholderContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
    marginBottom: 30,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
  },
  placeholderText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
  notFoundOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  notFoundOverlayContent: {
    backgroundColor: 'rgba(255, 243, 205, 0.95)',
    borderRadius: 12,
    padding: 20,
    borderWidth: 2,
    borderColor: '#ffc107',
    alignItems: 'center',
    maxWidth: '90%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  notFoundOverlayTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#856404',
    marginBottom: 8,
  },
  notFoundOverlayText: {
    fontSize: 14,
    color: '#856404',
    textAlign: 'center',
    marginBottom: 4,
  },
  notFoundOverlaySubtext: {
    fontSize: 12,
    color: '#856404',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    maxHeight: '25%',
  },
  overlayMiddle: {
    flexDirection: 'row',
    height: '50%',
    minHeight: 250,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  scannerWindow: {
    width: '95%', // Ventana más grande para detectar códigos pequeños
    minWidth: 300,
    maxWidth: 450,
    height: '100%',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#4CAF50',
    borderWidth: 3,
  },
  cornerTopLeft: {
    top: 10,
    left: 10,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  cornerTopRight: {
    top: 10,
    right: 10,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  cornerBottomLeft: {
    bottom: 10,
    left: 10,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  cornerBottomRight: {
    bottom: 10,
    right: 10,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  scanningLine: {
    position: 'absolute',
    width: '85%',
    height: 3,
    backgroundColor: '#4CAF50',
    shadowColor: '#4CAF50',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 15,
    opacity: 0.9,
    borderRadius: 2,
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    maxHeight: '25%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  loadingIndicator: {
    marginTop: 15,
    marginBottom: 10,
  },
  scannerText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  scannerHint: {
    color: '#ccc',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  cancelButton: {
    marginTop: 10,
    paddingVertical: 14,
    paddingHorizontal: 40,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  scannedBarcodeContainer: {
    alignItems: 'center',
    width: '100%',
  },
  barcodeDisplay: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    borderRadius: 8,
    padding: 15,
    marginVertical: 15,
    borderWidth: 2,
    borderColor: '#4CAF50',
    minWidth: '80%',
    alignItems: 'center',
  },
  barcodeText: {
    color: '#4CAF50',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 5,
    textAlign: 'center',
  },
  barcodeType: {
    color: '#ccc',
    fontSize: 12,
    textTransform: 'uppercase',
    marginTop: 5,
  },
  countdownText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'center',
  },
  scannerControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 10,
    width: '100%',
  },
  torchButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(76, 175, 80, 0.3)',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#4CAF50',
    marginHorizontal: 5,
  },
  torchButtonActive: {
    backgroundColor: 'rgba(76, 175, 80, 0.6)',
    borderColor: '#4CAF50',
  },
  torchButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});


