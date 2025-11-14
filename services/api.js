import { Platform } from 'react-native';

// API configuration
// IMPORTANT: For physical device testing, replace 'YOUR_LOCAL_IP' with your computer's local IP address
// Find your IP: ipconfig (Windows) or ifconfig (Mac/Linux)
// Look for "IPv4 Address" - example: 192.168.1.100
// Make sure your phone and computer are on the same WiFi network

// IMPORTANT: iOS Simulator cannot access localhost directly
// You MUST use your computer's local IP address
// To find your IP:
//   Windows: ipconfig (look for IPv4 Address)
//   Mac/Linux: ifconfig (look for inet)
//   Example: 192.168.1.100 or 192.168.100.70

// ⚠️ SOLUCIÓN PARA EXPO GO EN MODO TUNNEL ⚠️
// Cuando usas Expo Go en modo TUNNEL, las peticiones HTTP NO pueden acceder a IPs locales
// SOLUCIÓN: Usa localtunnel para exponer el backend
// 
// PASOS:
// 1. Instala localtunnel: npm install -g localtunnel
// 2. En una NUEVA terminal, ejecuta: lt --port 3000
// 3. Copia la URL HTTPS que aparece (ej: https://abc123.loca.lt)
// 4. Pega esa URL aquí abajo:

const LOCALTUNNEL_URL = 'https://junktrunk.cargolux.lat';

// Auto-detect: Prioridad localtunnel > local IP
const getApiBaseUrl = () => {
  // PRIORIDAD 1: localtunnel (funciona con tunnel de Expo)
  if (LOCALTUNNEL_URL && LOCALTUNNEL_URL !== null && LOCALTUNNEL_URL !== '') {
    const url = `${LOCALTUNNEL_URL}/api`;
    console.log('🌐 Using localtunnel for backend:', url);
    console.log('✅ Esto funciona con Expo Go en modo TUNNEL');
    return url;
  }
  
  // PRIORIDAD 2: IP local (solo funciona en modo LAN, NO en tunnel)
  const LOCAL_IP = '192.168.0.10';
  if (LOCAL_IP && LOCAL_IP !== 'YOUR_LOCAL_IP' && LOCAL_IP !== null && LOCAL_IP !== '') {
    const url = `http://${LOCAL_IP}:3000/api`;
    console.log('📱 Using local IP for backend:', url);
    console.log('⚠️ ADVERTENCIA: Esto NO funciona con Expo Go en modo TUNNEL');
    console.log('💡 SOLUCIÓN: Usa localtunnel (ver instrucciones arriba)');
    return url;
  }
  
  // Fallback
  console.warn('⚠️ No backend URL configured! Using localhost (probably won\'t work)');
  return 'http://localhost:3000/api';
};

const API_BASE_URL = getApiBaseUrl();

// Log API URL on first load (helps with debugging)
console.log('🔗 API Base URL configured:', API_BASE_URL);

class ApiService {
  async scanProduct(barcode, price = null, imageUrl = null, latitude = null, longitude = null, userId = null) {
    try {
      console.log('🌐 Calling API:', `${API_BASE_URL}/products/scan`);
      console.log('📦 Request data:', { barcode, price, image_url: imageUrl, latitude, longitude, user_id: userId });
      
      // Create AbortController for timeout - reduced to 8 seconds for faster error detection
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
      
      const response = await fetch(`${API_BASE_URL}/products/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          barcode,
          price,
          image_url: imageUrl,
          latitude,
          longitude,
          user_id: userId,
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      console.log('📥 Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API Error:', response.status, errorText);
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      console.log('✅ API Response:', data);
      return data;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error('⏱️ Request timeout after 30 seconds');
        throw new Error('Request timeout: El servidor no respondió a tiempo');
      }
      console.error('❌ Scan error:', error.message);
      console.error('🔗 API URL:', API_BASE_URL);
      console.error('📋 Full error:', error);
      throw error;
    }
  }

  async getPlatforms() {
    try {
      const response = await fetch(`${API_BASE_URL}/platforms/list`);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Get platforms error:', error);
      throw error;
    }
  }

  async postToPlatform(platformId, product, connectionData = null) {
    try {
      const response = await fetch(`${API_BASE_URL}/platforms/post`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          platform: platformId,
          product,
          connection: connectionData, // OAuth tokens/credentials
        }),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Post to platform error:', error);
      throw error;
    }
  }

  async connectPlatform(platformId, authData) {
    try {
      const response = await fetch(`${API_BASE_URL}/platforms/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          platform: platformId,
          auth: authData, // OAuth tokens
        }),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Connect platform error:', error);
      throw error;
    }
  }

  async disconnectPlatform(platformId) {
    try {
      const response = await fetch(`${API_BASE_URL}/platforms/disconnect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          platform: platformId,
        }),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Disconnect platform error:', error);
      throw error;
    }
  }

  async generateDescription(productName, price = null, category = null, brand = null, additionalInfo = null) {
    try {
      const response = await fetch(`${API_BASE_URL}/ai/generate-description`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productName,
          price,
          category,
          brand,
          additionalInfo,
        }),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Generate description error:', error);
      throw error;
    }
  }

  async updateProduct(productId, updates) {
    try {
      const response = await fetch(`${API_BASE_URL}/products/${productId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Update product error:', error);
      throw error;
    }
  }

  async getNearbyShops(latitude, longitude, radius = 40000) {
    try {
      const response = await fetch(
        `${API_BASE_URL}/maps/nearby-shops?latitude=${latitude}&longitude=${longitude}&radius=${radius}`
      );
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Get nearby shops error:', error);
      throw error;
    }
  }

  async getRoute(origin, destination, waypoints = []) {
    try {
      let url = `${API_BASE_URL}/maps/route?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`;
      if (waypoints.length > 0) {
        // Join waypoints with pipe separator (standard for Google Directions API)
        const waypointsParam = waypoints.map(w => encodeURIComponent(w)).join('|');
        url += `&waypoints=${waypointsParam}`;
      }

      const response = await fetch(url);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Get route error:', error);
      throw error;
    }
  }

  async getTodayScanHistory(userId = null) {
    try {
      let url = `${API_BASE_URL}/products/history/today`;
      if (userId) {
        url += `?user_id=${userId}`;
      }
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API error response:', errorText);
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }
      
      const text = await response.text();
      console.log('Raw API response:', text.substring(0, 500)); // Log first 500 chars for debugging
      
      const data = JSON.parse(text);
      return data;
    } catch (error) {
      console.error('Get today scan history error:', error);
      throw error;
    }
  }
}

export default new ApiService();

