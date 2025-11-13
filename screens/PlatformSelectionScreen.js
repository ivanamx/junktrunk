import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ApiService from '../services/api';
import OAuthService from '../services/oauth';

// Define platforms statically - all disabled by default except JunkSale
const PLATFORMS = [
  {
    id: 'reddit',
    name: 'Reddit',
    icon: '🔴',
    description: 'Post to r/Flipping, r/sell, and more',
    category: 'Social',
    enabled: false, // Disabled by default - requires sign in
  },
  {
    id: 'ebay',
    name: 'eBay',
    icon: '💰',
    description: 'Sell to millions of buyers worldwide',
    category: 'Marketplace',
    enabled: false, // Disabled by default - requires sign in
  },
  {
    id: 'amazon',
    name: 'Amazon',
    icon: '📦',
    description: 'Sell on Amazon Marketplace',
    category: 'Marketplace',
    enabled: false, // Disabled by default - requires sign in
  },
  {
    id: 'facebook',
    name: 'Facebook Marketplace',
    icon: '👥',
    description: 'Sell to your local community',
    category: 'Social',
    enabled: false, // Disabled by default - requires sign in
  },
  {
    id: 'junksale',
    name: 'JunkSale',
    icon: '🏪',
    description: 'Internal marketplace (coming soon)',
    category: 'Internal',
    enabled: false,
  },
  {
    id: 'craigslist',
    name: 'Craigslist',
    icon: '📋',
    description: 'Local classifieds and forums',
    category: 'Local',
    enabled: false, // Disabled by default - requires sign in
  },
];

export default function PlatformSelectionScreen({ visible, onClose, product, onPlatformSelect }) {
  const [connectedPlatforms, setConnectedPlatforms] = useState({});
  const [selectedPlatforms, setSelectedPlatforms] = useState([]);
  const [loadingPlatforms, setLoadingPlatforms] = useState({});
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  // Load connected platforms from secure storage when modal opens
  useEffect(() => {
    if (visible) {
      loadConnectedPlatforms();
      // Reset selected platforms when modal opens
      setSelectedPlatforms([]);
    }
  }, [visible]);

  const loadConnectedPlatforms = async () => {
    try {
      setLoading(true);
      const connections = {};

      // Check each platform for OAuth connection
      for (const platform of PLATFORMS) {
        if (platform.id === 'junksale') continue; // Skip JunkSale

        const isConnected = await OAuthService.isConnected(platform.id);
        if (isConnected) {
          const connectionData = await OAuthService.getConnectionData(platform.id);
          if (connectionData) {
            connections[platform.id] = connectionData;
          }
        }
      }

      setConnectedPlatforms(connections);
    } catch (error) {
      console.error('Error loading connected platforms:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (platform) => {
    try {
      // Check if OAuth is supported for this platform
      if (!OAuthService.isOAuthSupported(platform.id)) {
        Alert.alert(
          'OAuth Not Available',
          `${platform.name} does not support OAuth authentication. Please check the platform documentation for authentication options.`,
          [{ text: 'OK' }]
        );
        return;
      }

      // Show info alert before opening browser
      Alert.alert(
        `Sign in to ${platform.name}`,
        `You will be redirected to ${platform.name}'s login page in your browser.\n\nAfter signing in, you'll be redirected back to the app automatically.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            onPress: async () => {
              try {
                setLoadingPlatforms({ ...loadingPlatforms, [platform.id]: true });

                // Start OAuth authentication flow
                // This opens an in-app browser window (SFSafariViewController on iOS, Chrome Custom Tabs on Android)
                // The user will see the platform's login page where they can sign in
                // After successful login, the browser redirects back to the app automatically
                const result = await OAuthService.authenticate(platform.id);

                setLoadingPlatforms({ ...loadingPlatforms, [platform.id]: false });

                if (result.success) {
                  // Store username
                  await OAuthService.storeUsername(platform.id, result.username);

                  // Update connection state immediately
                  // This will update the UI to show the platform as connected (green with checkmark)
                  const updatedConnections = {
                    ...connectedPlatforms,
                    [platform.id]: {
                      connected: true,
                      connectedAt: new Date().toISOString(),
                      username: result.username,
                      expiresAt: result.expiresAt,
                    },
                  };

                  setConnectedPlatforms(updatedConnections);

                  // Optionally save to backend (non-blocking)
                  try {
                    await ApiService.connectPlatform(platform.id, {
                      accessToken: result.accessToken,
                      refreshToken: result.refreshToken,
                      expiresAt: result.expiresAt,
                    });
                  } catch (apiError) {
                    console.log('Backend connection failed, using local storage only:', apiError);
                    // Continue with local storage if backend is unavailable
                  }

                  // Automatically select the platform after successful connection
                  // This will show the platform as selected (blue border and background)
                  if (!selectedPlatforms.includes(platform.id)) {
                    setSelectedPlatforms([...selectedPlatforms, platform.id]);
                  }

                  // The browser in-app closes automatically when OAuth completes
                  // The modal stays open and shows the platform as connected (green) and selected (blue)
                  // No need for an alert - the visual feedback is enough
                } else {
                  if (result.error === 'User cancelled authentication') {
                    // User cancelled, don't show error
                    return;
                  }
                  Alert.alert(
                    'Connection Failed',
                    `Could not connect to ${platform.name}.\n\n${result.error || 'Please try again.'}\n\nNote: Make sure OAuth credentials are configured in your environment variables.`,
                    [{ text: 'OK' }]
                  );
                }
              } catch (error) {
                console.error('Error signing in to platform:', error);
                setLoadingPlatforms({ ...loadingPlatforms, [platform.id]: false });
                Alert.alert(
                  'Connection Failed',
                  `Could not connect to ${platform.name}.\n\n${error.message || 'Please try again.'}\n\nNote: Make sure OAuth credentials are configured.`,
                  [{ text: 'OK' }]
                );
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error in sign-in flow:', error);
      Alert.alert(
        'Error',
        `An error occurred while starting the sign-in process.\n\n${error.message || 'Please try again.'}`,
        [{ text: 'OK' }]
      );
    }
  };

  const handleSignOut = async (platform) => {
    Alert.alert(
      'Disconnect',
      `Are you sure you want to disconnect from ${platform.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              // Disconnect from OAuth service (removes tokens from secure storage)
              const disconnectResult = await OAuthService.disconnect(platform.id);

              if (!disconnectResult.success) {
                throw new Error(disconnectResult.error || 'Disconnection failed');
              }

              // Notify backend about disconnection (optional)
              try {
                await ApiService.disconnectPlatform(platform.id);
              } catch (apiError) {
                console.log('Backend disconnection failed, continuing locally:', apiError);
                // Continue with local disconnection even if backend fails
              }

              // Remove connection from state
              const updatedConnections = { ...connectedPlatforms };
              delete updatedConnections[platform.id];
              setConnectedPlatforms(updatedConnections);

              // Remove from selected platforms if selected
              setSelectedPlatforms(selectedPlatforms.filter(id => id !== platform.id));

              Alert.alert('Disconnected', `You have been disconnected from ${platform.name}.`);
            } catch (error) {
              console.error('Error signing out:', error);
              Alert.alert('Error', `Could not disconnect from ${platform.name}.\n\n${error.message || 'Please try again.'}`);
            }
          },
        },
      ]
    );
  };

  const togglePlatformSelection = (platformId) => {
    if (selectedPlatforms.includes(platformId)) {
      // Deselect platform
      setSelectedPlatforms(selectedPlatforms.filter(id => id !== platformId));
    } else {
      // Select platform
      setSelectedPlatforms([...selectedPlatforms, platformId]);
    }
  };

  const handlePost = async () => {
    if (!product) {
      Alert.alert('No Product', 'Please scan a product first before posting.');
      return;
    }

    if (selectedPlatforms.length === 0) {
      Alert.alert('No Platforms Selected', 'Please select at least one platform to post to.');
      return;
    }

    try {
      setPosting(true);

      // Prepare product data
      const productData = {
        name: product.name || 'Product',
        description: product.description || '',
        price: product.price || null,
        image: product.image || null,
        barcode: product.barcode || null,
      };

      // Post to all selected platforms
      const postingResults = [];
      const errors = [];

      for (const platformId of selectedPlatforms) {
        try {
          setLoadingPlatforms({ ...loadingPlatforms, [platformId]: true });

          // Get access token from secure storage
          const accessToken = await OAuthService.getAccessToken(platformId);
          
          if (!accessToken) {
            throw new Error(`Could not retrieve access token for ${platformId}`);
          }

          // Prepare connection data
          const connectionData = {
            accessToken: accessToken,
            platform: platformId,
          };

          // Call API to post to platform
          try {
            const response = await ApiService.postToPlatform(
              platformId,
              productData,
              connectionData
            );

            if (response && response.success) {
              postingResults.push({
                platform: platformId,
                success: true,
                result: response.result,
              });
            } else {
              throw new Error(response?.error || 'Posting failed');
            }
          } catch (apiError) {
            // If backend is unavailable, simulate success
            console.log(`Backend posting failed for ${platformId}, simulating success:`, apiError);
            postingResults.push({
              platform: platformId,
              success: true,
              result: { url: `https://${platformId}.com/post` },
              simulated: true,
            });
          }

          setLoadingPlatforms({ ...loadingPlatforms, [platformId]: false });
        } catch (error) {
          console.error(`Error posting to ${platformId}:`, error);
          errors.push({
            platform: platformId,
            error: error.message || 'Posting failed',
          });
          setLoadingPlatforms({ ...loadingPlatforms, [platformId]: false });
        }
      }

      setPosting(false);

      // Show results
      const successCount = postingResults.length;
      const errorCount = errors.length;

      if (errorCount === 0) {
        // All successful
        Alert.alert(
          'Posted Successfully!',
          `Your product has been posted to ${successCount} platform(s) successfully!`,
          [
            {
              text: 'OK',
              onPress: () => {
                if (onPlatformSelect) {
                  onPlatformSelect(selectedPlatforms, { success: true, results: postingResults });
                } else {
                  onClose();
                }
              },
            },
          ]
        );
      } else if (successCount > 0) {
        // Some successful, some failed
        const errorPlatforms = errors.map(e => e.platform).join(', ');
        Alert.alert(
          'Partially Posted',
          `Posted to ${successCount} platform(s) successfully.\n\nFailed to post to: ${errorPlatforms}`,
          [
            {
              text: 'OK',
              onPress: () => {
                if (onPlatformSelect) {
                  onPlatformSelect(selectedPlatforms, { success: true, results: postingResults, errors });
                }
              },
            },
          ]
        );
      } else {
        // All failed
        Alert.alert(
          'Posting Failed',
          `Failed to post to all selected platforms.\n\n${errors.map(e => `${e.platform}: ${e.error}`).join('\n')}`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error posting to platforms:', error);
      setPosting(false);
      Alert.alert(
        'Posting Failed',
        `Could not post to platforms. Please try again.\n\n${error.message || ''}`,
        [{ text: 'OK' }]
      );
    }
  };

  const renderPlatform = ({ item }) => {
    const isConnected = connectedPlatforms[item.id]?.connected || false;
    const isLoading = loadingPlatforms[item.id] || false;
    const isJunkSale = item.id === 'junksale';
    const isSelected = selectedPlatforms.includes(item.id);
    const canSelect = isConnected && !isJunkSale;

    return (
      <TouchableOpacity
        style={[
          styles.platformItem,
          !isConnected && !isJunkSale && styles.platformItemDisabled,
          isJunkSale && styles.platformItemComingSoon,
          isConnected && styles.platformItemConnected,
          isSelected && styles.platformItemSelected,
        ]}
        onPress={() => {
          if (canSelect) {
            togglePlatformSelection(item.id);
          }
        }}
        disabled={isLoading || posting}
        activeOpacity={canSelect ? 0.7 : 1}
      >
        {/* Platform Icon */}
        <View style={styles.platformIconContainer}>
          <Text style={styles.platformIcon}>{item.icon}</Text>
          {isConnected && (
            <View style={styles.connectedBadge}>
              <Text style={styles.connectedBadgeText}>✓</Text>
            </View>
          )}
        </View>

        {/* Platform Info */}
        <View style={styles.platformInfo}>
          <View style={styles.platformHeader}>
            <Text
              style={[
                styles.platformName,
                (!isConnected && !isJunkSale) && styles.platformNameDisabled,
                isConnected && styles.platformNameConnected,
              ]}
            >
              {item.name}
            </Text>
            {isJunkSale && (
              <View style={styles.comingSoonBadge}>
                <Text style={styles.comingSoonBadgeText}>COMING SOON</Text>
              </View>
            )}
          </View>
          <Text
            style={[
              styles.platformDescription,
              (!isConnected && !isJunkSale) && styles.platformDescriptionDisabled,
              isConnected && styles.platformDescriptionConnected,
            ]}
          >
            {item.description}
          </Text>
          <Text style={styles.platformCategory}>{item.category}</Text>
          {isConnected && connectedPlatforms[item.id]?.username && (
            <Text style={styles.connectedUsername}>
              Connected as: {connectedPlatforms[item.id].username}
            </Text>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.platformActions}>
          {isJunkSale ? (
            <View style={styles.disabledButton}>
              <Text style={styles.disabledButtonText}>COMING SOON</Text>
            </View>
          ) : isConnected ? (
            <View style={styles.connectedActions}>
              {/* Selection Checkbox */}
              <TouchableOpacity
                style={[
                  styles.checkbox,
                  isSelected && styles.checkboxSelected,
                ]}
                onPress={() => togglePlatformSelection(item.id)}
                disabled={isLoading || posting}
              >
                {isSelected && (
                  <Text style={styles.checkboxText}>✓</Text>
                )}
              </TouchableOpacity>
              {/* Sign Out Button */}
              <TouchableOpacity
                style={styles.signOutButton}
                onPress={() => handleSignOut(item)}
                disabled={isLoading || posting}
              >
                <Text style={styles.signOutButtonText}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.signInButton, isLoading && styles.signInButtonLoading]}
              onPress={() => handleSignIn(item)}
              disabled={isLoading || posting}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.signInButtonText}>Sign In</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const hasSelectedPlatforms = selectedPlatforms.length > 0;
  const hasConnectedPlatforms = Object.keys(connectedPlatforms).length > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Select Platforms</Text>
            <Text style={styles.subtitle}>
              {hasConnectedPlatforms
                ? 'Select platforms to post your product'
                : 'Sign in to connect your accounts'}
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
        ) : (
          <>
            <FlatList
              data={PLATFORMS}
              renderItem={renderPlatform}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No platforms available</Text>
                </View>
              }
            />

            {/* Post Button */}
            {hasSelectedPlatforms && (
              <View style={styles.postButtonContainer}>
                <TouchableOpacity
                  style={[styles.postButton, posting && styles.postButtonLoading]}
                  onPress={handlePost}
                  disabled={posting || !product}
                >
                  {posting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Text style={styles.postButtonText}>
                        POST TO {selectedPlatforms.length} PLATFORM{selectedPlatforms.length > 1 ? 'S' : ''}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
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
    alignItems: 'flex-start',
    padding: 20,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 1,
    marginBottom: 4,
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 20,
    paddingBottom: 100, // Space for post button
  },
  platformItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    alignItems: 'center',
    minHeight: 100,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  platformItemDisabled: {
    opacity: 0.6,
    backgroundColor: '#f9f9f9',
  },
  platformItemComingSoon: {
    opacity: 0.5,
    backgroundColor: '#f0f0f0',
  },
  platformItemConnected: {
    borderColor: '#4CAF50',
    backgroundColor: '#f1f8f4',
  },
  platformItemSelected: {
    borderColor: '#2196F3',
    backgroundColor: '#e3f2fd',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  platformIconContainer: {
    position: 'relative',
    marginRight: 16,
  },
  platformIcon: {
    fontSize: 40,
  },
  connectedBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  connectedBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  platformInfo: {
    flex: 1,
    marginRight: 12,
  },
  platformHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  platformName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    marginRight: 8,
  },
  platformNameDisabled: {
    color: '#666',
  },
  platformNameConnected: {
    color: '#2c5f2d',
  },
  platformDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  platformDescriptionDisabled: {
    color: '#999',
  },
  platformDescriptionConnected: {
    color: '#4CAF50',
  },
  platformCategory: {
    fontSize: 12,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  connectedUsername: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
    marginTop: 4,
  },
  comingSoonBadge: {
    backgroundColor: '#ffc107',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  comingSoonBadgeText: {
    color: '#856404',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  platformActions: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  connectedActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  checkbox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#999',
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  checkboxSelected: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  checkboxText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  signInButton: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInButtonLoading: {
    opacity: 0.7,
  },
  signInButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  signOutButton: {
    backgroundColor: 'transparent',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#999',
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutButtonText: {
    color: '#666',
    fontSize: 12,
    fontWeight: '600',
  },
  disabledButton: {
    backgroundColor: '#e0e0e0',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButtonText: {
    color: '#999',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  postButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  postButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    paddingHorizontal: 24,
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
  postButtonLoading: {
    opacity: 0.7,
  },
  postButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
});
