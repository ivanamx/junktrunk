const express = require('express');
const router = express.Router();
const axios = require('axios');
require('dotenv').config();

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
const GOOGLE_PLACES_API_URL = 'https://maps.googleapis.com/maps/api/place';
const GOOGLE_GEOCODING_API_URL = 'https://maps.googleapis.com/maps/api/geocode';
const GOOGLE_DIRECTIONS_API_URL = 'https://maps.googleapis.com/maps/api/directions';

// Detect country based on coordinates using reverse geocoding
const detectCountry = async (latitude, longitude) => {
  try {
    if (!GOOGLE_API_KEY) {
      console.warn('Google API key not configured, defaulting to US');
      return 'US';
    }

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

    // Default to US if cannot detect
    return 'US';
  } catch (error) {
    console.error('Error detecting country:', error);
    return 'US'; // Default to US
  }
};

// Get place types based on country
const getPlaceTypes = (country) => {
  if (country === 'MX' || country === 'MEX') {
    // Mexico: tianguis, tiendas de artesanías, mercados, etc.
    return [
      'market', // Mercados
      'store', // Tiendas generales
      'shopping_mall', // Centros comerciales
      'point_of_interest', // Puntos de interés (puede incluir tianguis)
    ];
  } else {
    // United States and others: thrift stores, goodwill, arts & crafts, flea markets
    return [
      'store', // General stores (includes thrift stores)
      'shopping_mall', // Shopping malls
      'point_of_interest', // Points of interest (includes flea markets)
    ];
  }
};

// Get search keywords based on country
const getSearchKeywords = (country) => {
  if (country === 'MX' || country === 'MEX') {
    return [
      'tianguis',
      'mercado',
      'tienda de artesanías',
      'artesanías',
      'mercado de pulgas',
      'flea market',
      'segunda mano',
      'usado',
    ];
  } else {
    return [
      'thrift store',
      'goodwill',
      'second hand',
      'flea market',
      'arts and crafts',
      'vintage',
      'consignment',
    ];
  }
};

// Get nearby thrift shops and markets
router.get('/nearby-shops', async (req, res) => {
  try {
    const { latitude, longitude, radius = 40000 } = req.query; // Default 40km radius

    if (!latitude || !longitude) {
      return res.status(400).json({ 
        success: false, 
        error: 'Latitude and longitude are required' 
      });
    }

    // Detect country
    const country = await detectCountry(parseFloat(latitude), parseFloat(longitude));
    console.log(`🌍 Detected country: ${country}`);

    // Get place types and keywords based on country
    const placeTypes = getPlaceTypes(country);
    const keywords = getSearchKeywords(country);

    // Search for places using Google Places API
    let allPlaces = [];

    if (!GOOGLE_API_KEY) {
      console.warn('Google API key not configured, returning empty results');
      return res.json({
        success: true,
        country: country,
        shops: [],
        count: 0,
        message: 'Google API key not configured. Please add GOOGLE_API_KEY to your .env file.',
      });
    }

    // Search by text query (more flexible, includes keywords)
    // Use text search with location-specific keywords
    try {
      // Use combined search query for better results
      const searchQueries = country === 'MX' || country === 'MEX'
        ? [
            `${keywords[0]} cerca de ${latitude},${longitude}`, // tianguis cerca
            `${keywords[1]} cerca de ${latitude},${longitude}`, // mercado cerca
            `${keywords[2]} cerca de ${latitude},${longitude}`, // artesanías cerca
          ]
        : [
            `${keywords[0]} near ${latitude},${longitude}`, // thrift store near
            `${keywords[1]} near ${latitude},${longitude}`, // goodwill near
            `${keywords[2]} near ${latitude},${longitude}`, // flea market near
          ];

      for (const query of searchQueries.slice(0, 3)) { // Limit to first 3 queries
        try {
          const response = await axios.get(`${GOOGLE_PLACES_API_URL}/textsearch/json`, {
            params: {
              query: query,
              location: `${latitude},${longitude}`,
              radius: radius,
              key: GOOGLE_API_KEY,
            },
            timeout: 10000,
          });

          if (response.data && response.data.results) {
            allPlaces = allPlaces.concat(response.data.results);
            console.log(`✅ Found ${response.data.results.length} places for query: ${query}`);
          }

          // Add delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (queryError) {
          console.error(`Error searching for query "${query}":`, queryError.message);
          // Continue with next query
        }
      }
    } catch (error) {
      console.error('Error in text search:', error.message);
      // Continue with nearby search
    }

    // Also search by nearby search with place types
    try {
      for (const placeType of placeTypes) {
        try {
          const response = await axios.get(`${GOOGLE_PLACES_API_URL}/nearbysearch/json`, {
            params: {
              location: `${latitude},${longitude}`,
              radius: radius,
              type: placeType,
              key: GOOGLE_API_KEY,
            },
            timeout: 10000,
          });

          if (response.data && response.data.results) {
            allPlaces = allPlaces.concat(response.data.results);
            console.log(`✅ Found ${response.data.results.length} places of type: ${placeType}`);
          }

          // Add delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (typeError) {
          console.error(`Error searching for type "${placeType}":`, typeError.message);
          // Continue with next type
        }
      }
    } catch (error) {
      console.error('Error in nearby search:', error.message);
      // Continue processing what we have
    }

    // Remove duplicates based on place_id
    const uniquePlaces = [];
    const seenPlaceIds = new Set();

    for (const place of allPlaces) {
      if (!seenPlaceIds.has(place.place_id)) {
        seenPlaceIds.add(place.place_id);
        
        // Filter by relevance (check if name or types contain keywords)
        const placeName = (place.name || '').toLowerCase();
        const placeTypesList = (place.types || []).map(t => t.toLowerCase());
        const placeTypesStr = placeTypesList.join(' ');
        
        // Check if place is relevant based on keywords
        const isRelevant = keywords.some(keyword => {
          const keywordLower = keyword.toLowerCase();
          return placeName.includes(keywordLower) || 
                 placeTypesStr.includes(keywordLower);
        }) || 
        // Also include if it's a store, market, or shopping related
        placeTypesList.some(type => 
          type.includes('store') || 
          type.includes('market') || 
          type.includes('shopping') ||
          type.includes('point_of_interest')
        );

        if (isRelevant) {
          uniquePlaces.push({
            id: place.place_id,
            name: place.name,
            address: place.vicinity || place.formatted_address || '',
            latitude: place.geometry.location.lat,
            longitude: place.geometry.location.lng,
            rating: place.rating || null,
            types: place.types || [],
            distance: null, // Will calculate on client or server
          });
        }
      }
    }

    // Calculate distances from user location
    const userLat = parseFloat(latitude);
    const userLon = parseFloat(longitude);

    uniquePlaces.forEach(place => {
      const distance = calculateDistance(
        userLat,
        userLon,
        place.latitude,
        place.longitude
      );
      place.distance = distance; // Distance in kilometers
    });

    // Sort by distance
    uniquePlaces.sort((a, b) => a.distance - b.distance);

    // Limit to 50 results
    const shops = uniquePlaces.slice(0, 50);

    console.log(`✅ Found ${shops.length} shops near ${latitude}, ${longitude}`);

    res.json({
      success: true,
      country: country,
      shops: shops,
      count: shops.length,
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

// Get route between points
router.get('/route', async (req, res) => {
  try {
    const { origin, destination } = req.query;

    if (!origin || !destination) {
      return res.status(400).json({
        success: false,
        error: 'Origin and destination are required',
      });
    }

    if (!GOOGLE_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'Google API key not configured',
      });
    }

    // Build waypoints parameter
    // Handle waypoints as pipe-separated string (standard format)
    let waypointsParam = '';
    if (req.query.waypoints) {
      const waypoints = req.query.waypoints;
      if (typeof waypoints === 'string') {
        // Already pipe-separated, just clean it up
        waypointsParam = waypoints.split('|').filter(w => w && w.trim()).join('|');
      } else if (Array.isArray(waypoints)) {
        waypointsParam = waypoints.filter(w => w && w.trim()).join('|');
      }
    }

    // Get route from Google Directions API
    const response = await axios.get(`${GOOGLE_DIRECTIONS_API_URL}/json`, {
      params: {
        origin: origin,
        destination: destination,
        waypoints: waypointsParam || undefined,
        optimize: waypointsParam ? true : false, // Optimize waypoints order
        key: GOOGLE_API_KEY,
        mode: 'driving', // Can be 'driving', 'walking', 'transit', 'bicycling'
      },
      timeout: 15000,
    });

    if (response.data && response.data.routes && response.data.routes.length > 0) {
      const route = response.data.routes[0];
      const leg = route.legs[0];

      // Decode polyline to get coordinates
      const overviewPolyline = route.overview_polyline.points;
      const coordinates = decodePolyline(overviewPolyline);

      res.json({
        success: true,
        route: {
          distance: leg.distance?.text || '',
          duration: leg.duration?.text || '',
          coordinates: coordinates,
          bounds: route.bounds,
          summary: route.summary || '',
        },
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'No route found',
      });
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

// Helper function to decode Google polyline
const decodePolyline = (encoded) => {
  const poly = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) !== 0) ? ~(result >> 1) : (result >> 1);
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) !== 0) ? ~(result >> 1) : (result >> 1);
    lng += dlng;

    poly.push({ latitude: lat * 1e-5, longitude: lng * 1e-5 });
  }

  return poly;
};

module.exports = router;

