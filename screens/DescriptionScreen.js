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
  const [additionalInfo, setAdditionalInfo] = useState('');

  useEffect(() => {
    if (visible && product) {
      generateDescription();
    }
  }, [visible, product]);

  const generateDescription = async () => {
    if (!product) return;

    try {
      setLoading(true);
      const response = await ApiService.generateDescription(
        product.name,
        product.price,
        null, // category - can be added later
        null, // brand - can be added later
        additionalInfo || null
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

  const handleRegenerate = () => {
    generateDescription();
  };

  const handleCopy = () => {
    // Copy to clipboard functionality can be added with expo-clipboard
    Alert.alert('Copied!', 'Description copied to clipboard');
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
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
            <Text style={styles.inputLabel}>Additional Information (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Add any additional details about the product..."
              value={additionalInfo}
              onChangeText={setAdditionalInfo}
              multiline
              numberOfLines={3}
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
                style={[styles.button, styles.copyButton]}
                onPress={handleCopy}
              >
                <Text style={styles.buttonText}>COPY</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
    textAlignVertical: 'top',
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
  copyButton: {
    backgroundColor: '#2c5f2d',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
});

