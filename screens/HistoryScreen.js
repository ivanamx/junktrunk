import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  Image,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import ApiService from '../services/api';
import AuthService from '../services/authService';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

export default function HistoryScreen({ visible, onClose, navigation }) {
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visible) {
      // Reset state and reload when modal opens
      setScans([]);
      setLoading(true);
      loadTodayScans();
    }
  }, [visible]);

  const loadTodayScans = async () => {
    try {
      setLoading(true);
      // Get current user ID to filter scans
      const user = await AuthService.getUser();
      const userId = user ? user.id : null;
      
      console.log('📋 Loading today\'s scans for user:', userId);
      
      const response = await ApiService.getTodayScanHistory(userId);
      console.log('📋 Scan history response:', response);
      
      if (response && response.success) {
        const scansList = response.scans || [];
        console.log(`✅ Loaded ${scansList.length} scans for today`);
        setScans(scansList);
      } else {
        console.log('⚠️ No scans found or invalid response');
        setScans([]);
      }
    } catch (error) {
      console.error('❌ Error loading scan history:', error);
      setScans([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLocationPress = (scan) => {
    if (scan.latitude && scan.longitude) {
      onClose();
      // Navigate to map with location
      setTimeout(() => {
        navigation.navigate('Map', {
          latitude: scan.latitude,
          longitude: scan.longitude,
          productName: scan.product.name
        });
      }, 300);
    }
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const truncateName = (name, maxLength = 30) => {
    if (!name) return 'Unknown Product';
    if (name.length <= maxLength) return name;
    return name.substring(0, maxLength) + '...';
  };

  const renderScanItem = ({ item }) => {
    return (
      <View style={styles.scanItem}>
        <View style={styles.scanImageContainer}>
          {item.product.image ? (
            <Image
              source={{ uri: item.product.image }}
              style={styles.scanImage}
              resizeMode="contain"
            />
          ) : (
            <View style={[styles.scanImage, styles.scanImagePlaceholder]}>
              <Text style={styles.scanImagePlaceholderText}>No image</Text>
            </View>
          )}
        </View>
        <View style={styles.scanInfo}>
          <Text style={styles.scanProductName} numberOfLines={1} ellipsizeMode="tail">
            {truncateName(item.product.name)}
          </Text>
          <View style={styles.scanBarcodeRow}>
            <Text style={styles.scanBarcode}>Code: {item.product.barcode}</Text>
            <Text style={styles.scanTime}>{formatTime(item.scannedAt)}</Text>
          </View>
          {item.latitude && item.longitude ? (
            <TouchableOpacity
              onPress={() => handleLocationPress(item)}
              style={styles.locationButton}
            >
              <Text style={styles.locationButtonText}>
                📍 View Location
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.noLocationText}>No location data</Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity 
          style={styles.overlayTouchable}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <View style={styles.headerTitleContainer}>
              <Text style={styles.title}>Today's Scans</Text>
              <Text style={styles.subtitle}>
                {loading ? 'Loading...' : `${scans.length} scan${scans.length !== 1 ? 's' : ''} today`}
              </Text>
            </View>
            <TouchableOpacity 
              onPress={() => {
                console.log('Close button pressed');
                if (onClose) {
                  onClose();
                }
              }} 
              style={styles.closeButton}
              activeOpacity={0.7}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#1a1a1a" />
            </View>
          ) : scans.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No scans today</Text>
              <Text style={styles.emptySubtext}>
                Scan products to see them here{'\n'}
                Your scans will appear in this list
              </Text>
            </View>
          ) : (
            <View style={styles.listContainer}>
              <FlatList
                data={scans}
                renderItem={renderScanItem}
                keyExtractor={(item) => `scan-${item.scanId}`}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={true}
              />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContent: {
    width: SCREEN_WIDTH * 0.9,
    maxWidth: 500,
    height: SCREEN_HEIGHT * 0.75,
    maxHeight: SCREEN_HEIGHT * 0.75,
    backgroundColor: '#f5f5f5',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 1,
    marginBottom: 4,
  },
  headerTitleContainer: {
    flex: 1,
  },
  subtitle: {
    fontSize: 14,
    color: '#ccc',
    fontWeight: '400',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    zIndex: 10,
    elevation: 10,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  loadingContainer: {
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyContainer: {
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    color: '#999',
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 20,
  },
  scanItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  scanImageContainer: {
    width: 70,
    height: 70,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  scanImage: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  scanImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  scanImagePlaceholderText: {
    color: '#999',
    fontSize: 10,
  },
  scanInfo: {
    flex: 1,
    justifyContent: 'space-between',
  },
  scanProductName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  scanBarcodeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  scanBarcode: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'monospace',
    flex: 1,
  },
  scanTime: {
    fontSize: 12,
    color: '#999',
    marginLeft: 8,
  },
  locationButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#4CAF50',
    borderRadius: 6,
  },
  locationButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  noLocationText: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
});

