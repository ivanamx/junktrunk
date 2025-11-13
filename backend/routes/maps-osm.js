const express = require('express');
const router = express.Router();
const axios = require('axios');
require('dotenv').config();

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
// Nueva Places API (New) - endpoint moderno
const GOOGLE_PLACES_API_NEW_URL = 'https://places.googleapis.com/v1';
// Legacy API (deprecated) - solo para geocoding
const GOOGLE_GEOCODING_API_URL = 'https://maps.googleapis.com/maps/api/geocode';

// OpenStreetMap (OSM) - COMPLETAMENTE GRATIS
// No requiere API key, solo respeta el rate limit de 1 request/segundo
const NOMINATIM_API_URL = 'https://nominatim.openstreetmap.org';
const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';
const OSRM_API_URL = 'https://router.project-osrm.org'; // Public instance, puede ser lenta
// Alternativa OSRM: usar instancia propia o Mapbox (gratis hasta cierto límite)

// Rate limiting: Nominatim requiere máximo 1 request/segundo
// Usaremos delays entre requests para respetar esto

// Detect country based on coordinates
// Try Google first (more reliable), fallback to Nominatim
const detectCountry = async (latitude, longitude) => {
  // Try Google Geocoding first (more reliable, especially for Mexico)
  if (GOOGLE_API_KEY) {
    try {
      const response = await axios.get(`${GOOGLE_GEOCODING_API_URL}/json`, {
        params: {
          latlng: `${latitude},${longitude}`,
          key: GOOGLE_API_KEY,
          result_type: 'country',
        },
        timeout: 10000,
      });

      if (response.data && response.data.results && response.data.results.length > 0) {
        const addressComponents = response.data.results[0].address_components;
        const country = addressComponents.find(component => 
          component.types.includes('country')
        );
        
        if (country) {
          return country.short_name; // Returns 'US', 'MX', etc.
        }
      }
    } catch (error) {
      console.log('⚠️ Google geocoding failed, trying Nominatim...');
    }
  }

  // Fallback to Nominatim (OSM)
  try {
    // Add delay to respect rate limit
    await new Promise(resolve => setTimeout(resolve, 1100)); // 1.1 seconds between requests

    const response = await axios.get(`${NOMINATIM_API_URL}/reverse`, {
      params: {
        lat: latitude,
        lon: longitude,
        format: 'json',
        addressdetails: 1,
      },
      headers: {
        'User-Agent': 'JunkTrunk/1.0',
      },
      timeout: 10000,
    });

    if (response.data && response.data.address) {
      const countryCode = response.data.address.country_code?.toUpperCase();
      if (countryCode) {
        return countryCode; // Returns 'US', 'MX', etc.
      }
    }
  } catch (error) {
    console.error('Error detecting country with Nominatim:', error);
  }

  // Default to US if cannot detect
  return 'US';
};

// Helper function to calculate distance between two coordinates (Haversine formula)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in kilometers
  return Math.round(distance * 10) / 10; // Round to 1 decimal place
};

// Helper function to search with Google Maps API (for Mexico)
// Usa la nueva Places API (New) en lugar de la legacy
const searchWithGoogleMaps = async (latitude, longitude, radius) => {
  if (!GOOGLE_API_KEY || GOOGLE_API_KEY === '' || GOOGLE_API_KEY === 'your-google-api-key-here') {
    console.warn('⚠️ Google API key not configured, cannot use Google Maps');
    return [];
  }

  // Verificar que la API key parece válida (no es el placeholder)
  if (GOOGLE_API_KEY.length < 20) {
    console.warn('⚠️ Google API key seems invalid (too short), cannot use Google Maps');
    return [];
  }

  console.log(`🔑 Google API Key configurada (longitud: ${GOOGLE_API_KEY.length} caracteres)`);

  // Términos de búsqueda
  const searchTerms = [
    'flea market',           // Inglés - mercado de pulgas
    'thrift store',              // Español - mercado mexicano
    'antiques store',        // Inglés - tienda de antigüedades
  ];

  let allPlaces = [];
  const seenPlaceIds = new Set();

  console.log(`🔍 Buscando con Google Places API (New)...`);
  
  // Buscar por cada término usando la nueva API
  for (const searchTerm of searchTerms) {
    try {
      console.log(`   🔎 Buscando: "${searchTerm}"...`);
      
      // Nueva Places API (New) - usa POST con JSON
      const response = await axios.post(
        `${GOOGLE_PLACES_API_NEW_URL}/places:searchText`,
        {
          textQuery: searchTerm,
          locationBias: {
            circle: {
              center: {
                latitude: latitude,
                longitude: longitude,
              },
              radius: radius, // en metros
            },
          },
          languageCode: 'es',
          maxResultCount: 20,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_API_KEY,
            'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.types',
          },
          timeout: 15000,
        }
      );

      // Verificar la respuesta completa
      if (response.data && response.data.places) {
        const places = response.data.places || [];
        console.log(`   ✅ "${searchTerm}": encontrados=${places.length}`);
        
        // Agregar todos los resultados (sin duplicados)
        for (const place of places) {
          const placeId = place.id || place.placeId;
          if (!seenPlaceIds.has(placeId)) {
            seenPlaceIds.add(placeId);
            
            // La nueva API usa location.latitude y location.longitude
            const placeLat = place.location?.latitude || place.geometry?.location?.lat;
            const placeLng = place.location?.longitude || place.geometry?.location?.lng;
            
            if (!placeLat || !placeLng) {
              continue; // Skip si no tiene coordenadas
            }
            
            const distance = calculateDistance(
              latitude,
              longitude,
              placeLat,
              placeLng
            );

            allPlaces.push({
              id: placeId,
              name: place.displayName?.text || place.name || 'Sin nombre',
              address: place.formattedAddress || place.vicinity || '',
              latitude: placeLat,
              longitude: placeLng,
              rating: place.rating || null,
              types: place.types || [],
              distance: distance,
            });
          }
        }
        
        // Mostrar algunos nombres encontrados
        if (places.length > 0) {
          const sampleNames = places.slice(0, 3)
            .map(p => p.displayName?.text || p.name || 'Sin nombre')
            .join(', ');
          console.log(`      Lugares: ${sampleNames}${places.length > 3 ? '...' : ''}`);
        }
      } else {
        console.log(`   ℹ️ "${searchTerm}": No se encontraron resultados`);
      }

      // Esperar un poco entre búsquedas
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error) {
      console.error(`   ❌ Error buscando "${searchTerm}":`, error.message);
      if (error.response) {
        console.error(`      HTTP Status: ${error.response.status}`);
        console.error(`      Response Data:`, JSON.stringify(error.response.data, null, 2));
        
        // Si es un error de API no habilitada, detener búsquedas
        if (error.response.status === 403 || error.response.status === 400) {
          const errorData = error.response.data;
          if (errorData?.error?.message?.includes('API') || 
              errorData?.error?.message?.includes('not enabled')) {
            console.error(`   ⚠️ Deteniendo búsquedas de Google Maps - API no habilitada`);
            break;
          }
        }
      } else if (error.request) {
        console.error(`      No se recibió respuesta del servidor`);
      }
      continue;
    }
  }

  // Ordenar por distancia
  allPlaces.sort((a, b) => a.distance - b.distance);

  console.log(`📊 Total encontrado: ${allPlaces.length} lugares únicos`);
  
  return allPlaces;
};

// Get place types for Overpass API
// Overpass uses international OSM tags that work the same in all countries
// Tags like shop=*, amenity=marketplace are standard and language-independent
const getOverpassQuery = (latitude, longitude, radius) => {
  const radiusMeters = radius; // radius is already in meters
  
  // Build Overpass QL query
  // Search for second-hand related places: thrift stores, flea markets, craft shops, etc.
  const query = `
    [out:json][timeout:25];
    (
      // Second-hand and thrift stores
      node["shop"="second_hand"](around:${radiusMeters},${latitude},${longitude});
      way["shop"="second_hand"](around:${radiusMeters},${latitude},${longitude});
      relation["shop"="second_hand"](around:${radiusMeters},${latitude},${longitude});
      
      // Variety stores (often include second-hand items)
      node["shop"="variety"](around:${radiusMeters},${latitude},${longitude});
      way["shop"="variety"](around:${radiusMeters},${latitude},${longitude});
      relation["shop"="variety"](around:${radiusMeters},${latitude},${longitude});
      
      // General stores (may include second-hand)
      node["shop"="general"](around:${radiusMeters},${latitude},${longitude});
      way["shop"="general"](around:${radiusMeters},${latitude},${longitude});
      relation["shop"="general"](around:${radiusMeters},${latitude},${longitude});
      
      // Flea markets and marketplaces
      node["amenity"="marketplace"](around:${radiusMeters},${latitude},${longitude});
      way["amenity"="marketplace"](around:${radiusMeters},${latitude},${longitude});
      relation["amenity"="marketplace"](around:${radiusMeters},${latitude},${longitude});
      
      // Craft shops and workshops
      node["craft"](around:${radiusMeters},${latitude},${longitude});
      way["craft"](around:${radiusMeters},${latitude},${longitude});
      relation["craft"](around:${radiusMeters},${latitude},${longitude});
      
      // Antique shops
      node["shop"="antiques"](around:${radiusMeters},${latitude},${longitude});
      way["shop"="antiques"](around:${radiusMeters},${latitude},${longitude});
      relation["shop"="antiques"](around:${radiusMeters},${latitude},${longitude});
      
      // Vintage and collectibles
      node["shop"="collector"](around:${radiusMeters},${latitude},${longitude});
      way["shop"="collector"](around:${radiusMeters},${latitude},${longitude});
      relation["shop"="collector"](around:${radiusMeters},${latitude},${longitude});
      
      // Charity shops (like Goodwill)
      node["shop"="charity"](around:${radiusMeters},${latitude},${longitude});
      way["shop"="charity"](around:${radiusMeters},${latitude},${longitude});
      relation["shop"="charity"](around:${radiusMeters},${latitude},${longitude});
    );
    out center;
  `;
  
  return query;
};

// Get nearby thrift shops and markets using OpenStreetMap
router.get('/nearby-shops', async (req, res) => {
  try {
    const { latitude, longitude, radius = 40000 } = req.query; // Default 40km radius

    if (!latitude || !longitude) {
      return res.status(400).json({ 
        success: false, 
        error: 'Latitude and longitude are required' 
      });
    }

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    const radiusMeters = parseInt(radius);

    // Log Google API key status for debugging
    if (GOOGLE_API_KEY && GOOGLE_API_KEY !== '' && GOOGLE_API_KEY !== 'your-google-api-key-here') {
      console.log(`🔑 Google API Key está configurada (${GOOGLE_API_KEY.substring(0, 10)}...)`);
    } else {
      console.log(`⚠️ Google API Key NO está configurada o es inválida`);
    }

    // Detect country
    const country = await detectCountry(lat, lon);
    console.log(`🌍 Detected country: ${country}`);

    let allPlaces = [];

    // Use Google Maps for Mexico (better coverage), OSM for other countries
    if (country === 'MX' || country === 'MEX') {
      console.log(`🗺️ Using Google Maps API for Mexico (better coverage)`);
      if (!GOOGLE_API_KEY || GOOGLE_API_KEY === '' || GOOGLE_API_KEY === 'your-google-api-key-here') {
        console.warn('⚠️ Google API key not configured, falling back to OSM');
        // Fall through to OSM search
      } else {
        try {
          const googlePlaces = await searchWithGoogleMaps(lat, lon, radiusMeters);
          allPlaces = googlePlaces;
          console.log(`✅ Google Maps: Found ${googlePlaces.length} places`);
        } catch (error) {
          console.error('Error with Google Maps search:', error.message);
          console.log('⚠️ Falling back to OSM...');
          // Fall through to OSM search
        }
      }
    }

    // Use Overpass API (OSM) for non-Mexico countries or as fallback
    if (allPlaces.length === 0 || (country !== 'MX' && country !== 'MEX')) {
      console.log(`🔍 Searching with Overpass API using OSM tags (shop, marketplace, craft, etc.)`);
      try {
        await new Promise(resolve => setTimeout(resolve, 1100)); // Rate limit
        
        const overpassQuery = getOverpassQuery(lat, lon, radiusMeters);
      
      // Try a simpler Overpass query if the complex one fails
      const simpleOverpassQuery = `
        [out:json][timeout:15];
        (
          node["shop"="second_hand"](around:${radiusMeters},${lat},${lon});
          way["shop"="second_hand"](around:${radiusMeters},${lat},${lon});
          node["shop"="variety"](around:${radiusMeters},${lat},${lon});
          way["shop"="variety"](around:${radiusMeters},${lat},${lon});
          node["amenity"="marketplace"](around:${radiusMeters},${lat},${lon});
          way["amenity"="marketplace"](around:${radiusMeters},${lat},${lon});
          node["craft"](around:${radiusMeters},${lat},${lon});
          way["craft"](around:${radiusMeters},${lat},${lon});
        );
        out center;
      `;
      
      let response;
      try {
        response = await axios.post(OVERPASS_API_URL, overpassQuery, {
          headers: {
            'Content-Type': 'text/plain',
          },
          timeout: 25000, // Reduced timeout
        });
      } catch (overpassError) {
        // If complex query fails, try simpler one
        console.log('⚠️ Complex Overpass query failed, trying simpler query...');
        response = await axios.post(OVERPASS_API_URL, simpleOverpassQuery, {
          headers: {
            'Content-Type': 'text/plain',
          },
          timeout: 20000,
        });
      }

      if (response.data && response.data.elements) {
        const overpassPlaces = response.data.elements
          .filter(element => {
            // Filter by relevance (check tags)
            const tags = element.tags || {};
            const shopType = (tags.shop || '').toLowerCase();
            const amenity = (tags.amenity || '').toLowerCase();
            const craft = (tags.craft || '').toLowerCase();
            
            // Include only second-hand related places
            // These are international OSM tags that work in all countries
            const isRelevant = 
              shopType === 'second_hand' || // Second-hand stores
              shopType === 'variety' || // Variety stores
              shopType === 'general' || // General stores
              shopType === 'antiques' || // Antique shops
              shopType === 'collector' || // Collectibles
              shopType === 'charity' || // Charity shops (Goodwill, etc.)
              amenity === 'marketplace' || // Flea markets and marketplaces
              craft !== ''; // Craft shops and workshops

            if (!isRelevant) return false;

            // Get coordinates
            let placeLat, placeLon;
            if (element.type === 'node') {
              placeLat = element.lat;
              placeLon = element.lon;
            } else if (element.center) {
              placeLat = element.center.lat;
              placeLon = element.center.lon;
            } else {
              return false;
            }

            // Check distance
            const distance = calculateDistance(lat, lon, placeLat, placeLon);
            return distance <= radiusMeters / 1000;
          })
          .map(element => {
            const tags = element.tags || {};
            let placeLat, placeLon;
            if (element.type === 'node') {
              placeLat = element.lat;
              placeLon = element.lon;
            } else if (element.center) {
              placeLat = element.center.lat;
              placeLon = element.center.lon;
            }

            return {
              id: `osm_${element.type}_${element.id}`,
              name: tags.name || 'Unnamed Place',
              address: `${tags['addr:street'] || ''} ${tags['addr:city'] || ''}`.trim() || 'Address not available',
              latitude: placeLat,
              longitude: placeLon,
              rating: null,
              types: [tags.shop || tags.amenity || 'point_of_interest'].filter(Boolean),
              distance: calculateDistance(lat, lon, placeLat, placeLon),
            };
          });

        allPlaces = allPlaces.concat(overpassPlaces);
        console.log(`✅ OSM Overpass: Found ${overpassPlaces.length} places`);
      }
      } catch (error) {
        console.error('Error in Overpass API search:', error.message);
        // Continue with what we have
      }
    }

    // Remove duplicates based on coordinates (within 50m)
    const uniquePlaces = [];
    const seenCoordinates = new Set();

    for (const place of allPlaces) {
      const coordKey = `${Math.round(place.latitude * 1000)},${Math.round(place.longitude * 1000)}`;
      if (!seenCoordinates.has(coordKey)) {
        seenCoordinates.add(coordKey);
        uniquePlaces.push(place);
      }
    }

    // Sort by distance
    uniquePlaces.sort((a, b) => a.distance - b.distance);

    // Limit to 50 results
    const shops = uniquePlaces.slice(0, 50);

    console.log(`✅ Found ${shops.length} unique shops near ${latitude}, ${longitude}`);

    res.json({
      success: true,
      country: country,
      shops: shops,
      count: shops.length,
      source: 'OpenStreetMap (Free)',
    });
  } catch (error) {
    console.error('Error getting nearby shops:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get nearby shops',
      message: error.message,
    });
  }
});

// Get route between points using OSRM (Open Source Routing Machine)
router.get('/route', async (req, res) => {
  try {
    const { origin, destination, waypoints } = req.query;

    if (!origin || !destination) {
      return res.status(400).json({
        success: false,
        error: 'Origin and destination are required',
      });
    }

    // Parse coordinates
    const [originLat, originLon] = origin.split(',').map(Number);
    const [destLat, destLon] = destination.split(',').map(Number);

    // Build coordinates array for OSRM
    let coordinates = [[originLon, originLat]]; // OSRM uses [lon, lat] format

    // Add waypoints if provided
    if (waypoints) {
      const waypointsArray = typeof waypoints === 'string' 
        ? waypoints.split('|').filter(w => w)
        : Array.isArray(waypoints) ? waypoints : [];
      
      waypointsArray.forEach(waypoint => {
        const [lat, lon] = waypoint.split(',').map(Number);
        if (!isNaN(lat) && !isNaN(lon)) {
          coordinates.push([lon, lat]);
        }
      });
    }

    // Add destination
    coordinates.push([destLon, destLat]);

    // Validate coordinates
    if (isNaN(originLat) || isNaN(originLon) || isNaN(destLat) || isNaN(destLon)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid coordinates format',
      });
    }

    // Build OSRM API URL
    const coordsString = coordinates.map(c => `${c[0]},${c[1]}`).join(';');
    const url = `${OSRM_API_URL}/route/v1/driving/${coordsString}?overview=full&geometries=geojson${waypoints ? '&steps=true' : ''}`;

    console.log(`🗺️ OSRM Request URL: ${url.substring(0, 200)}...`);
    console.log(`📍 Coordinates count: ${coordinates.length}`);

    try {
      const response = await axios.get(url, {
        timeout: 30000, // OSRM public instance can be slow
      });

      if (response.data && response.data.code === 'Ok' && response.data.routes && response.data.routes.length > 0) {
        const route = response.data.routes[0];
        const geometry = route.geometry;

        // Convert GeoJSON coordinates to [lat, lon] format
        const routeCoordinates = geometry.coordinates.map(coord => ({
          latitude: coord[1],
          longitude: coord[0],
        }));

        // Calculate total distance and duration
        const distance = (route.distance / 1000).toFixed(1); // Convert to km
        const duration = Math.round(route.duration / 60); // Convert to minutes

        console.log(`✅ OSRM route calculated: ${distance} km, ${duration} min`);

        res.json({
          success: true,
          route: {
            distance: `${distance} km`,
            duration: `${duration} min`,
            coordinates: routeCoordinates,
            bounds: null, // OSRM doesn't provide bounds, we'll calculate from coordinates
            summary: 'OSRM Route',
          },
        });
      } else {
        console.error('❌ OSRM returned no route:', response.data);
        // Fallback to straight-line route
        return createFallbackRoute(originLat, originLon, destLat, destLon, coordinates, res);
      }
    } catch (osrmError) {
      console.error('❌ OSRM error:', osrmError.message);
      if (osrmError.response) {
        console.error('OSRM response status:', osrmError.response.status);
        console.error('OSRM response data:', osrmError.response.data);
      }
      
      // Fallback: return optimized multi-point route using straight lines
      return createFallbackRoute(originLat, originLon, destLat, destLon, coordinates, res);
    }
  } catch (error) {
    console.error('Error getting route:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get route',
      message: error.message,
    });
  }
});

// Helper function to create fallback route when OSRM fails
const createFallbackRoute = (originLat, originLon, destLat, destLon, allCoordinates, res) => {
  // Create a route connecting all points with straight lines
  const routeCoordinates = allCoordinates.map(coord => ({
    latitude: coord[1], // OSRM format is [lon, lat], convert to {lat, lon}
    longitude: coord[0],
  }));

  // Calculate total distance by summing distances between consecutive points
  let totalDistance = 0;
  for (let i = 0; i < routeCoordinates.length - 1; i++) {
    const dist = calculateDistance(
      routeCoordinates[i].latitude,
      routeCoordinates[i].longitude,
      routeCoordinates[i + 1].latitude,
      routeCoordinates[i + 1].longitude
    );
    totalDistance += dist;
  }

  console.log(`⚠️ Using fallback straight-line route: ${totalDistance.toFixed(1)} km`);

  res.json({
    success: true,
    route: {
      distance: `${totalDistance.toFixed(1)} km`,
      duration: 'N/A',
      coordinates: routeCoordinates,
      bounds: null,
      summary: 'Straight-line route (OSRM unavailable)',
    },
    warning: 'OSRM service unavailable, using straight-line route',
  });
};

module.exports = router;

