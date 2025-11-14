import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ApiService from '../services/api';

export default function DescriptionScreen({ visible, onClose, product, onDescriptionGenerated }) {
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [price, setPrice] = useState('');

  // Helper function to calculate average price from prices array
  const calculateAveragePrice = (product) => {
    if (product.prices && Array.isArray(product.prices) && product.prices.length > 0) {
      // Extract numeric values from price strings (e.g., "$10.99" -> 10.99)
      const numericPrices = product.prices
        .map(p => {
          if (p.price) {
            const numeric = parseFloat(p.price.replace(/[^0-9.]/g, ''));
            return isNaN(numeric) ? null : numeric;
          }
          return null;
        })
        .filter(p => p !== null);
      
      if (numericPrices.length > 0) {
        // Calculate average
        const sum = numericPrices.reduce((acc, val) => acc + val, 0);
        const average = sum / numericPrices.length;
        return average.toFixed(2);
      }
    }
    
    // If no prices array or calculation failed, try product.price
    if (product.price) {
      // Extract numeric value from price string (e.g., "$10.99" -> "10.99")
      const numericPrice = product.price.replace(/[^0-9.]/g, '');
      if (numericPrice) {
        return numericPrice;
      }
    }
    
    return '';
  };

  const generateDescription = async (priceToUse = null) => {
    if (!product) return;

    try {
      setLoading(true);
      // Use provided price, or current price state, or product price
      const finalPrice = priceToUse || price || (product.price ? product.price.replace(/[^0-9.]/g, '') : '');
      const priceToSend = finalPrice ? `$${parseFloat(finalPrice).toFixed(2)}` : null;
      
      const response = await ApiService.generateDescription(
        product.name,
        priceToSend,
        null, // category - can be added later
        null, // brand - can be added later
        null // additionalInfo removed
      );

      if (response.success) {
        setDescription(response.description);
        if (onDescriptionGenerated) {
          onDescriptionGenerated(response.description);
        }
      }
    } catch (error) {
      console.error('Error generating description:', error);
      Alert.alert('Error', 'Failed to generate description. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible && product) {
      // Calculate average price from prices array
      const calculatedPrice = calculateAveragePrice(product);
      setPrice(calculatedPrice);
      
      // Generate description with calculated price
      if (calculatedPrice) {
        generateDescription(calculatedPrice);
      } else {
        generateDescription();
      }
    }
  }, [visible, product]);

  const handleRegenerate = () => {
    generateDescription();
  };

  const handleUse = () => {
    if (!description) {
      Alert.alert('No Description', 'Please generate a description first.');
      return;
    }
    
    // Use the description - update product and close modal
    // Also update price if a custom price was entered
    if (onDescriptionGenerated) {
      onDescriptionGenerated(description, price ? `$${parseFloat(price).toFixed(2)}` : null);
    }
    
    // Close the modal
    if (onClose) {
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Product Description</Text>
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

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {product && (
            <View style={styles.productInfo}>
              <Text style={styles.productName}>{product.name}</Text>
              {product.price && (
                <Text style={styles.productPrice}>{product.price}</Text>
              )}
            </View>
          )}

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Price (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter price (e.g., 10.99)"
              value={price}
              onChangeText={(text) => {
                // Allow only numbers and decimal point
                const numericText = text.replace(/[^0-9.]/g, '');
                // Ensure only one decimal point
                const parts = numericText.split('.');
                if (parts.length > 2) {
                  setPrice(parts[0] + '.' + parts.slice(1).join(''));
                } else {
                  setPrice(numericText);
                }
              }}
              keyboardType="decimal-pad"
            />
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#1a1a1a" />
              <Text style={styles.loadingText}>Generating description...</Text>
            </View>
          ) : (
            <View style={styles.descriptionContainer}>
              <Text style={styles.descriptionLabel}>AI-Generated Description:</Text>
              <View style={styles.descriptionBox}>
                <Text style={styles.descriptionText}>{description}</Text>
              </View>
            </View>
          )}

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.regenerateButton]}
              onPress={handleRegenerate}
              disabled={loading}
            >
              <Text style={styles.buttonText}>REGENERATE</Text>
            </TouchableOpacity>

            {description && (
              <TouchableOpacity
                style={[styles.button, styles.useButton]}
                onPress={handleUse}
              >
                <Text style={styles.buttonText}>USE</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
        </SafeAreaView>
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
  container: {
    width: '90%',
    maxWidth: 500,
    height: '75%',
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
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#1a1a1a',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    elevation: 10,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  productInfo: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  productName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  productPrice: {
    fontSize: 24,
    fontWeight: '800',
    color: '#2c5f2d',
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  descriptionContainer: {
    marginBottom: 20,
  },
  descriptionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  descriptionBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  descriptionText: {
    fontSize: 15,
    lineHeight: 24,
    color: '#1a1a1a',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  regenerateButton: {
    backgroundColor: '#1a1a1a',
  },
  useButton: {
    backgroundColor: '#2c5f2d',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
});

