import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Alert,
  ActivityIndicator,
  ScrollView,
  Switch,
  Platform,
  Linking,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { MaterialIcons } from '@expo/vector-icons';
import ApiService from '../services/api';

export default function MapScreen() {
  const route = useRoute();
  const { latitude, longitude, productName } = route.params || {};
  
  const [userLocation, setUserLocation] = useState(null);
  const [thriftShops, setThriftShops] = useState([]);
  const [selectedShops, setSelectedShops] = useState([]);
  const [selectMode, setSelectMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [routeInfo, setRouteInfo] = useState(null);
  const [country, setCountry] = useState(null);
  const [filterOption, setFilterOption] = useState('today');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [region, setRegion] = useState({
    latitude: 37.78825,
    longitude: -122.4324,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  });

  // Get user location on mount
  useEffect(() => {
    getUserLocation();
  }, []);

  // Update map region when user location or shops are loaded
  useEffect(() => {
    if (userLocation || (latitude && longitude)) {
      const centerLat = userLocation?.latitude || latitude;
      const centerLon = userLocation?.longitude || longitude;
      
      setRegion({
        latitude: centerLat,
        longitude: centerLon,
        latitudeDelta: 0.1, // Wider view to show 40km radius
        longitudeDelta: 0.1,
      });
      
      // Load nearby thrift shops
      loadNearbyThriftShops(centerLat, centerLon);
    }
  }, [userLocation, latitude, longitude]);

  const getUserLocation = async () => {
    try {
      setLoading(true);
      
      // Request location permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Location Permission',
          'Location permission is required to find nearby thrift shops.',
          [{ text: 'OK' }]
        );
        setLoading(false);
        return;
      }

      // Get current location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const userLoc = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      setUserLocation(userLoc);
    } catch (error) {
      console.error('Error getting user location:', error);
      Alert.alert(
        'Location Error',
        'Could not get your location. Using default location.',
        [{ text: 'OK' }]
      );
      setLoading(false);
    }
  };

  const loadNearbyThriftShops = async (centerLat, centerLon) => {
    try {
      setLoading(true);
      
      // Call API to get nearby thrift shops
      const response = await ApiService.getNearbyShops(centerLat, centerLon, 40000); // 40km radius
      
      if (response && response.success && response.shops) {
        setThriftShops(response.shops);
        setCountry(response.country);
        
        // Format distance for display
        const shopsWithDistance = response.shops.map(shop => ({
          ...shop,
          distanceText: shop.distance < 1 
            ? `${Math.round(shop.distance * 1000)}m` 
            : `${shop.distance.toFixed(1)}km`,
        }));
        
        setThriftShops(shopsWithDistance);
      } else {
        Alert.alert(
          'Error',
          'Could not load nearby thrift shops. Please try again.',
          [{ text: 'OK' }]
        );
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error loading thrift shops:', error);
      setLoading(false);
      Alert.alert(
        'Error',
        'Could not load nearby thrift shops. Please check your connection and try again.',
        [{ text: 'OK' }]
      );
    }
  };

  const toggleShopSelection = (shop) => {
    // Only allow selection when select mode is active
    if (!selectMode) {
      return;
    }

    if (selectedShops.find(s => s.id === shop.id)) {
      // Deselect shop
      const newSelected = selectedShops.filter(s => s.id !== shop.id);
      setSelectedShops(newSelected);
      
      // Clear route if no shops selected
      if (newSelected.length === 0) {
        setRouteCoordinates([]);
        setRouteInfo(null);
      } else {
        // Recalculate route with remaining shops (only if route was already created)
        if (routeCoordinates.length > 0) {
          calculateRoute(newSelected, true);
        }
      }
    } else {
      // Select shop
      const newSelected = [...selectedShops, shop];
      setSelectedShops(newSelected);
      
      // Don't auto-calculate route when selecting, wait for "Create Route" button
    }
  };

  // Helper function to calculate distance between two points
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in kilometers
  };

  // Optimize route order using nearest neighbor algorithm
  const optimizeRouteOrder = (startLat, startLon, shops) => {
    if (shops.length === 0) return [];
    if (shops.length === 1) return shops;

    const optimized = [];
    const remaining = [...shops];
    let currentLat = startLat;
    let currentLon = startLon;

    // Greedy nearest neighbor: always go to the closest unvisited shop
    while (remaining.length > 0) {
      let nearestIndex = 0;
      let nearestDistance = calculateDistance(
        currentLat,
        currentLon,
        remaining[0].latitude,
        remaining[0].longitude
      );

      for (let i = 1; i < remaining.length; i++) {
        const distance = calculateDistance(
          currentLat,
          currentLon,
          remaining[i].latitude,
          remaining[i].longitude
        );
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = i;
        }
      }

      const nearest = remaining.splice(nearestIndex, 1)[0];
      optimized.push(nearest);
      currentLat = nearest.latitude;
      currentLon = nearest.longitude;
    }

    return optimized;
  };

  const calculateRoute = async (shops, optimize = true) => {
    if (shops.length === 0) {
      setRouteCoordinates([]);
      setRouteInfo(null);
      return { success: false };
    }

    try {
      setLoading(true);

      // Get starting point (user location or scan location)
      const startLat = userLocation?.latitude || latitude || region.latitude;
      const startLon = userLocation?.longitude || longitude || region.longitude;
      const origin = `${startLat},${startLon}`;

      // Optimize route order if multiple shops
      let shopsToRoute = shops;
      if (optimize && shops.length > 1) {
        shopsToRoute = optimizeRouteOrder(startLat, startLon, shops);
        // Update selected shops order to match optimized route
        setSelectedShops(shopsToRoute);
      }

      let routeData = null;

      if (shopsToRoute.length === 1) {
        // Single destination
        const shop = shopsToRoute[0];
        const destination = `${shop.latitude},${shop.longitude}`;
        
        const response = await ApiService.getRoute(origin, destination);
        
        if (response && response.success && response.route) {
          routeData = {
            coordinates: response.route.coordinates,
            distance: response.route.distance,
            duration: response.route.duration,
            summary: response.route.summary,
            warning: response.warning || null,
          };
          
          setRouteCoordinates(routeData.coordinates);
          setRouteInfo({
            distance: routeData.distance,
            duration: routeData.duration,
            summary: routeData.summary,
          });
          
          // Adjust map to show route
          adjustMapToRoute(routeData.coordinates);
        }
      } else {
        // Multiple destinations - use waypoints
        const destination = shopsToRoute[shopsToRoute.length - 1];
        const waypoints = shopsToRoute.slice(0, -1).map(shop => `${shop.latitude},${shop.longitude}`);
        const destinationStr = `${destination.latitude},${destination.longitude}`;
        
        const response = await ApiService.getRoute(origin, destinationStr, waypoints);
        
        if (response && response.success && response.route) {
          routeData = {
            coordinates: response.route.coordinates,
            distance: response.route.distance,
            duration: response.route.duration,
            summary: response.route.summary || 'Optimized route',
            warning: response.warning || null,
          };
          
          setRouteCoordinates(routeData.coordinates);
          setRouteInfo({
            distance: routeData.distance,
            duration: routeData.duration,
            summary: routeData.summary,
          });
          
          // Adjust map to show route
          adjustMapToRoute(routeData.coordinates);
        }
      }

      return { success: !!routeData, route: routeData };
    } catch (error) {
      console.error('Error calculating route:', error);
      
      // Show user-friendly error message
      const errorMessage = error.message || 'Could not calculate route. Please try again.';
      Alert.alert(
        'Route Error',
        errorMessage,
        [{ text: 'OK' }]
      );
      
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  // Helper function to adjust map view to show entire route
  const adjustMapToRoute = (coordinates) => {
    if (!coordinates || coordinates.length === 0) return;

    const lats = coordinates.map(c => c.latitude);
    const lons = coordinates.map(c => c.longitude);
    
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    
    const centerLat = (minLat + maxLat) / 2;
    const centerLon = (minLon + maxLon) / 2;
    const latDelta = Math.max(maxLat - minLat, 0.01) * 1.5;
    const lonDelta = Math.max(maxLon - minLon, 0.01) * 1.5;
    
    setRegion({
      latitude: centerLat,
      longitude: centerLon,
      latitudeDelta: latDelta,
      longitudeDelta: lonDelta,
    });
  };

  const handleCreateRoute = async () => {
    if (selectedShops.length === 0) {
      Alert.alert(
        'No Shops Selected',
        'Please select at least one thrift shop to create a route.',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      // Calculate optimized route
      const result = await calculateRoute(selectedShops, true);
      
      // Show confirmation if route was successfully created
      if (result.success && result.route) {
        const warningText = result.route.warning ? `\n\n⚠️ ${result.route.warning}` : '';
        Alert.alert(
          'Route Created',
          `Optimized route to ${selectedShops.length} shop${selectedShops.length > 1 ? 's' : ''} has been created!\n\nDistance: ${result.route.distance || 'N/A'}\nDuration: ${result.route.duration || 'N/A'}${warningText}`,
          [{ text: 'OK' }]
        );
      } else if (!result.success) {
        // Error already shown in calculateRoute, but ensure loading is off
        console.error('Route calculation failed:', result.error);
      }
    } catch (error) {
      console.error('Error creating route:', error);
      Alert.alert(
        'Error',
        'An unexpected error occurred while creating the route. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleOpenInMaps = () => {
    if (selectedShops.length === 0 || routeCoordinates.length === 0) {
      return;
    }

    try {
      const startLat = userLocation?.latitude || latitude || region.latitude;
      const startLon = userLocation?.longitude || longitude || region.longitude;
      
      const destination = selectedShops[selectedShops.length - 1];
      const destinationStr = `${destination.latitude},${destination.longitude}`;
      
      let url;
      
      if (Platform.OS === 'ios') {
        // iOS Maps - supports waypoints via waypoints parameter
        if (selectedShops.length === 1) {
          url = `http://maps.apple.com/?daddr=${destinationStr}&dirflg=d`;
        } else {
          // For multiple destinations, use waypoints
          const waypoints = selectedShops.slice(0, -1).map(shop => `${shop.latitude},${shop.longitude}`).join('+to:');
          url = `http://maps.apple.com/?saddr=${startLat},${startLon}&daddr=${waypoints}+to:${destinationStr}&dirflg=d`;
        }
      } else {
        // Android Google Maps
        if (selectedShops.length === 1) {
          url = `google.navigation:q=${destinationStr}`;
        } else {
          // For multiple waypoints, use Google Maps web URL with waypoints
          const waypoints = selectedShops.slice(0, -1).map(shop => `${shop.latitude},${shop.longitude}`).join('/');
          url = `https://www.google.com/maps/dir/${startLat},${startLon}/${waypoints}/${destinationStr}`;
        }
      }
      
      Linking.openURL(url).catch(err => {
        console.error('Error opening maps:', err);
        Alert.alert(
          'Error',
          'Could not open maps application. Please try again.',
          [{ text: 'OK' }]
        );
      });
    } catch (error) {
      console.error('Error opening in maps:', error);
      Alert.alert(
        'Error',
        'Could not open maps application. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleReset = () => {
    setSelectedShops([]);
    setRouteCoordinates([]);
    setRouteInfo(null);
    
    // Reset map region to initial view
    if (userLocation || (latitude && longitude)) {
      const centerLat = userLocation?.latitude || latitude;
      const centerLon = userLocation?.longitude || longitude;
      
      setRegion({
        latitude: centerLat,
        longitude: centerLon,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      });
    }
  };

  // Add scan location marker if provided
  const scanLocation = latitude && longitude ? {
    id: 'scan-location',
    name: productName || 'Scan Location',
    latitude: latitude,
    longitude: longitude,
  } : null;

  // Custom marker components
  const CustomMarker = ({ type, isSelected, shopName }) => {
    let backgroundColor, icon, borderColor;
    
    if (type === 'scan') {
      backgroundColor = '#4CAF50';
      icon = '📍';
      borderColor = '#2E7D32';
    } else if (isSelected) {
      backgroundColor = '#FF6B6B';
      icon = '🏪';
      borderColor = '#D32F2F';
    } else {
      backgroundColor = '#FFA500';
      icon = '🏪';
      borderColor = '#F57C00';
    }

    return (
      <View style={styles.customMarkerContainer}>
        <View style={[styles.customMarker, { backgroundColor, borderColor }]}>
          <Text style={styles.markerIcon}>{icon}</Text>
        </View>
        <View style={[styles.markerPin, { borderTopColor: backgroundColor }]} />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <MapView
        style={styles.map}
        region={region}
        onRegionChangeComplete={setRegion}
        showsUserLocation={true}
        showsMyLocationButton={true}
      >
        {/* Scan location marker */}
        {scanLocation && (
          <Marker
            key={scanLocation.id}
            coordinate={{
              latitude: scanLocation.latitude,
              longitude: scanLocation.longitude,
            }}
            title={scanLocation.name}
            anchor={{ x: 0.5, y: 1 }}
          >
            <CustomMarker type="scan" />
          </Marker>
        )}

        {/* Thrift shop markers - Always shown regardless of filter option */}
        {thriftShops.map((shop) => {
          const isSelected = selectedShops.find(s => s.id === shop.id);
          return (
            <Marker
              key={shop.id}
              coordinate={{
                latitude: shop.latitude,
                longitude: shop.longitude,
              }}
              title={shop.name}
              description={shop.address}
              anchor={{ x: 0.5, y: 1 }}
              onPress={() => toggleShopSelection(shop)}
            >
              <CustomMarker type="shop" isSelected={isSelected} shopName={shop.name} />
            </Marker>
          );
        })}

        {/* Route polyline */}
        {routeCoordinates.length > 0 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor="#2196F3"
            strokeWidth={4}
            lineDashPattern={[1]}
          />
        )}
      </MapView>

      {/* Loading indicator */}
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1a1a1a" />
          <Text style={styles.loadingText}>Loading nearby shops...</Text>
        </View>
      )}

      {/* Filter and Select Mode Cards - Only show after loading completes */}
      {!loading && (
        <View style={styles.topCardsContainer}>
          {/* Filter Card */}
          <View style={styles.filterContainer}>
            <TouchableOpacity
              style={styles.filterContent}
              onPress={() => setShowFilterDropdown(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.filterLabel}>Scans:</Text>
              <View style={styles.filterValueContainer}>
                <Text style={styles.filterValue}>
                  {filterOption === 'today' ? 'Today' :
                   filterOption === 'this week' ? 'This Week' : 'This Month'}
                </Text>
                <MaterialIcons name="arrow-drop-down" size={20} color="#1a1a1a" />
              </View>
            </TouchableOpacity>
          </View>

          {/* Select Mode Toggle */}
          <View style={styles.selectModeContainer}>
            <View style={styles.selectModeContent}>
              <Text style={styles.selectModeLabel}>Select Mode</Text>
              <View style={styles.switchContainer}>
                <Switch
                  value={selectMode}
                  onValueChange={(value) => {
                    setSelectMode(value);
                    if (!value) {
                      // Clear selection when turning off select mode
                      setSelectedShops([]);
                      setRouteCoordinates([]);
                      setRouteInfo(null);
                    }
                  }}
                  trackColor={{ false: '#ccc', true: '#4CAF50' }}
                  thumbColor={selectMode ? '#fff' : '#f4f3f4'}
                  style={styles.switch}
                />
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Filter Dropdown Modal */}
      <Modal
        visible={showFilterDropdown}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowFilterDropdown(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowFilterDropdown(false)}
        >
          <View style={styles.dropdownContainer}>
            <TouchableOpacity
              style={[
                styles.dropdownItem,
                filterOption === 'today' && styles.dropdownItemSelected
              ]}
              onPress={() => {
                setFilterOption('today');
                setShowFilterDropdown(false);
              }}
            >
              <Text style={[
                styles.dropdownItemText,
                filterOption === 'today' && styles.dropdownItemTextSelected
              ]}>
                Today
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.dropdownItem,
                filterOption === 'this week' && styles.dropdownItemSelected
              ]}
              onPress={() => {
                setFilterOption('this week');
                setShowFilterDropdown(false);
              }}
            >
              <Text style={[
                styles.dropdownItemText,
                filterOption === 'this week' && styles.dropdownItemTextSelected
              ]}>
                This Week
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.dropdownItem,
                styles.dropdownItemLast,
                filterOption === 'this month' && styles.dropdownItemSelected
              ]}
              onPress={() => {
                setFilterOption('this month');
                setShowFilterDropdown(false);
              }}
            >
              <Text style={[
                styles.dropdownItemText,
                filterOption === 'this month' && styles.dropdownItemTextSelected
              ]}>
                This Month
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Selected shops info */}
      {selectMode && selectedShops.length > 0 && (
        <View style={styles.selectedShopsContainer}>
          <View style={styles.selectedShopsHeader}>
            <Text style={styles.selectedShopsTitle}>
              {selectedShops.length} shop{selectedShops.length > 1 ? 's' : ''} selected
            </Text>
            {routeInfo && (
              <View style={styles.routeInfo}>
                <Text style={styles.routeInfoText}>
                  📍 {routeInfo.distance} • ⏱ {routeInfo.duration}
                </Text>
              </View>
            )}
          </View>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.selectedShopsList}
          >
            {selectedShops.map((shop, index) => (
              <View key={shop.id} style={styles.selectedShopItem}>
                <View style={styles.selectedShopBadge}>
                  <Text style={styles.selectedShopNumber}>{index + 1}</Text>
                </View>
                <Text style={styles.selectedShopName} numberOfLines={1}>
                  {shop.name}
                </Text>
                <Text style={styles.selectedShopDistance}>{shop.distanceText}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Create Route Button - Only show when route is not created */}
      {selectMode && routeCoordinates.length === 0 && (
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[
              styles.createRouteButton,
              selectedShops.length === 0 && styles.createRouteButtonDisabled,
            ]}
            onPress={handleCreateRoute}
            disabled={selectedShops.length === 0 || loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.createRouteButtonText}>
                {`CREATE ROUTE ${selectedShops.length > 0 ? `(${selectedShops.length})` : ''}`}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Follow on Maps and Reset Buttons - Show when route is created */}
      {selectMode && routeCoordinates.length > 0 && (
        <View style={styles.buttonContainer}>
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={[styles.actionButton, styles.followButton]}
              onPress={handleOpenInMaps}
            >
              <View style={styles.followButtonContent}>
                <Text style={styles.actionButtonText}>FOLLOW ON </Text>
                <MaterialIcons 
                  name={Platform.OS === 'ios' ? 'map' : 'navigation'} 
                  size={20} 
                  color="#fff" 
                />
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.resetButton]}
              onPress={handleReset}
            >
              <Text style={styles.actionButtonText}>RESET</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  loadingContainer: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 16,
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
  loadingText: {
    marginTop: 8,
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  topCardsContainer: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  filterContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 8,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    minWidth: 140,
    flex: 1,
    marginRight: 10,
    minHeight: 48,
    justifyContent: 'center',
  },
  filterContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginRight: 8,
  },
  filterValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2196F3',
    marginRight: 4,
  },
  selectModeContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 8,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    minWidth: 140,
    flex: 1,
    marginLeft: 10,
    minHeight: 48,
    justifyContent: 'center',
  },
  selectModeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectModeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginRight: 8,
  },
  switchContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  switch: {
    transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }],
  },
  selectedShopsContainer: {
    position: 'absolute',
    top: 80,
    left: 20,
    right: 20,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    maxHeight: 150,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  selectedShopsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  selectedShopsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  routeInfo: {
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  routeInfoText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2196F3',
  },
  selectedShopsList: {
    flexDirection: 'row',
  },
  selectedShopItem: {
    alignItems: 'center',
    marginRight: 16,
    minWidth: 80,
  },
  selectedShopBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  selectedShopNumber: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  selectedShopName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 2,
  },
  selectedShopDistance: {
    fontSize: 10,
    color: '#666',
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  createRouteButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
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
    minWidth: 200,
  },
  createRouteButtonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.6,
  },
  createRouteButtonActive: {
    backgroundColor: '#2196F3',
  },
  createRouteButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
  },
  actionButton: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 20,
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
    marginHorizontal: 6,
  },
  followButton: {
    backgroundColor: '#2196F3',
  },
  followButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetButton: {
    backgroundColor: '#FF6B6B',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  customMarkerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  customMarker: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  markerIcon: {
    fontSize: 24,
  },
  markerPin: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -2,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    paddingTop: 80,
    paddingLeft: 20,
    paddingRight: 20,
  },
  dropdownContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  dropdownItemLast: {
    borderBottomWidth: 0,
  },
  dropdownItemSelected: {
    backgroundColor: '#e3f2fd',
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  dropdownItemTextSelected: {
    color: '#2196F3',
    fontWeight: '700',
  },
});
