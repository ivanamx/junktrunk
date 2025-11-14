import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

// Complete web browser authentication (required for OAuth)
WebBrowser.maybeCompleteAuthSession();

// Get environment variables from Constants (Expo way)
const getEnvVar = (key) => {
  return Constants.expoConfig?.extra?.[key] || 
         Constants.manifest?.extra?.[key] || 
         process.env[key] || 
         '';
};

// Platform OAuth configurations
// Note: Client IDs and secrets should be set in app.json under "extra" or in environment variables
// For production, use Expo Secrets or EAS Secrets for sensitive data
const PLATFORM_CONFIGS = {
  reddit: {
    name: 'Reddit',
    clientId: getEnvVar('REDDIT_CLIENT_ID'),
    clientSecret: getEnvVar('REDDIT_CLIENT_SECRET'),
    authUrl: 'https://www.reddit.com/api/v1/authorize',
    tokenUrl: 'https://www.reddit.com/api/v1/access_token',
    scopes: ['identity', 'submit', 'read'],
    redirectUri: AuthSession.makeRedirectUri({
      scheme: 'junktrunk',
      path: 'oauth/reddit',
    }),
  },
  ebay: {
    name: 'eBay',
    clientId: getEnvVar('EBAY_CLIENT_ID'),
    clientSecret: getEnvVar('EBAY_CLIENT_SECRET'),
    authUrl: 'https://auth.ebay.com/oauth2/authorize',
    tokenUrl: 'https://api.ebay.com/identity/v1/oauth2/token',
    // Scopes needed for posting listings: sell.inventory (create/update listings) and sell.marketing (promote listings)
    scopes: ['https://api.ebay.com/oauth/api_scope/sell.inventory', 'https://api.ebay.com/oauth/api_scope/sell.marketing'],
    redirectUri: AuthSession.makeRedirectUri({
      scheme: 'junktrunk',
      path: 'oauth/ebay',
    }),
  },
  amazon: {
    name: 'Amazon',
    clientId: getEnvVar('AMAZON_CLIENT_ID'),
    clientSecret: getEnvVar('AMAZON_CLIENT_SECRET'),
    authUrl: 'https://sellercentral.amazon.com/apps/authorize/consent',
    tokenUrl: 'https://api.amazon.com/auth/o2/token',
    scopes: ['sellingpartnerapi::migration', 'sellingpartnerapi::notifications'],
    redirectUri: AuthSession.makeRedirectUri({
      scheme: 'junktrunk',
      path: 'oauth/amazon',
    }),
  },
  facebook: {
    name: 'Facebook',
    clientId: getEnvVar('FACEBOOK_CLIENT_ID'),
    clientSecret: getEnvVar('FACEBOOK_CLIENT_SECRET'),
    authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    scopes: ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list'],
    redirectUri: AuthSession.makeRedirectUri({
      scheme: 'junktrunk',
      path: 'oauth/facebook',
    }),
  },
  craigslist: {
    name: 'Craigslist',
    // Note: Craigslist doesn't have a public OAuth API
    // This is a placeholder for future implementation
    clientId: getEnvVar('CRAIGSLIST_CLIENT_ID'),
    clientSecret: getEnvVar('CRAIGSLIST_CLIENT_SECRET'),
    authUrl: null, // No OAuth available
    tokenUrl: null,
    scopes: [],
    redirectUri: null,
  },
};

const STORAGE_KEYS = {
  TOKEN_PREFIX: 'oauth_token_',
  REFRESH_PREFIX: 'oauth_refresh_',
  EXPIRES_PREFIX: 'oauth_expires_',
  USERNAME_PREFIX: 'oauth_username_',
};

class OAuthService {
  /**
   * Get platform configuration
   */
  getPlatformConfig(platformId) {
    const config = PLATFORM_CONFIGS[platformId];
    if (!config) {
      throw new Error(`Platform ${platformId} not found`);
    }
    return config;
  }

  /**
   * Check if platform supports OAuth
   */
  isOAuthSupported(platformId) {
    const config = this.getPlatformConfig(platformId);
    return config.authUrl !== null && config.tokenUrl !== null;
  }

  /**
   * Authenticate with platform using OAuth
   * Opens OAuth login in an in-app browser (SFSafariViewController on iOS, Chrome Custom Tabs on Android)
   */
  async authenticate(platformId) {
    try {
      const config = this.getPlatformConfig(platformId);

      if (!this.isOAuthSupported(platformId)) {
        throw new Error(`${config.name} does not support OAuth authentication`);
      }

      // Check if client ID is configured
      if (!config.clientId) {
        throw new Error(`${config.name} OAuth is not configured. Please set ${platformId.toUpperCase()}_CLIENT_ID in environment variables.`);
      }

      // Create AuthRequest
      const request = new AuthSession.AuthRequest({
        clientId: config.clientId,
        scopes: config.scopes,
        redirectUri: config.redirectUri,
        responseType: AuthSession.ResponseType.Code,
        extraParams: {},
      });

      // Start authentication flow
      // useProxy: false means it opens in an in-app browser (not system browser)
      // This provides better UX as the user stays within the app
      // - iOS: Opens in SFSafariViewController (in-app Safari)
      // - Android: Opens in Chrome Custom Tabs (in-app Chrome)
      // The browser will show the platform's login page
      const result = await request.promptAsync({
        authorizationEndpoint: config.authUrl,
        useProxy: false, // Use in-app browser (better UX)
        showInRecents: true, // Show in browser recents
      });

      if (result.type === 'success') {
        // Exchange authorization code for access token
        const tokenResult = await this.exchangeCodeForToken(
          platformId,
          result.params.code,
          config
        );

        // Store tokens securely
        await this.storeTokens(platformId, tokenResult);

        // Get user info
        const userInfo = await this.getUserInfo(platformId, tokenResult.accessToken);

        return {
          success: true,
          platform: platformId,
          accessToken: tokenResult.accessToken,
          refreshToken: tokenResult.refreshToken,
          expiresAt: tokenResult.expiresAt,
          username: userInfo.username || `user_${platformId}`,
        };
      } else if (result.type === 'cancel') {
        return {
          success: false,
          error: 'User cancelled authentication',
        };
      } else {
        return {
          success: false,
          error: result.error?.message || 'Authentication failed',
        };
      }
    } catch (error) {
      console.error(`OAuth authentication error for ${platformId}:`, error);
      return {
        success: false,
        error: error.message || 'Authentication failed',
      };
    }
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(platformId, code, config) {
    try {
      const tokenParams = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: config.redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      });

      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: tokenParams.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      // Calculate expiration time
      const expiresIn = data.expires_in || 3600; // Default to 1 hour
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || null,
        expiresAt: expiresAt,
        tokenType: data.token_type || 'Bearer',
      };
    } catch (error) {
      console.error(`Token exchange error for ${platformId}:`, error);
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(platformId) {
    try {
      const config = this.getPlatformConfig(platformId);
      const refreshToken = await this.getRefreshToken(platformId);

      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const tokenParams = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      });

      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: tokenParams.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      // Calculate expiration time
      const expiresIn = data.expires_in || 3600;
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      // Update stored tokens
      await this.storeTokens(platformId, {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken, // Use new refresh token if provided
        expiresAt: expiresAt,
        tokenType: data.token_type || 'Bearer',
      });

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        expiresAt: expiresAt,
      };
    } catch (error) {
      console.error(`Token refresh error for ${platformId}:`, error);
      throw error;
    }
  }

  /**
   * Get user info from platform
   */
  async getUserInfo(platformId, accessToken) {
    try {
      const config = this.getPlatformConfig(platformId);

      // Platform-specific user info endpoints
      const userInfoEndpoints = {
        reddit: 'https://oauth.reddit.com/api/v1/me',
        ebay: 'https://api.ebay.com/commerce/identity/v1/user',
        amazon: 'https://api.amazon.com/user/profile',
        facebook: `https://graph.facebook.com/v18.0/me?access_token=${accessToken}`,
      };

      const endpoint = userInfoEndpoints[platformId];
      if (!endpoint) {
        return { username: `user_${platformId}` };
      }

      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        return { username: `user_${platformId}` };
      }

      const data = await response.json();

      // Extract username based on platform
      const usernameMap = {
        reddit: data.name,
        ebay: data.username,
        amazon: data.user_id,
        facebook: data.name,
      };

      return {
        username: usernameMap[platformId] || `user_${platformId}`,
        data: data,
      };
    } catch (error) {
      console.error(`Get user info error for ${platformId}:`, error);
      return { username: `user_${platformId}` };
    }
  }

  /**
   * Store tokens securely
   */
  async storeTokens(platformId, tokenData) {
    try {
      await SecureStore.setItemAsync(
        `${STORAGE_KEYS.TOKEN_PREFIX}${platformId}`,
        tokenData.accessToken
      );

      if (tokenData.refreshToken) {
        await SecureStore.setItemAsync(
          `${STORAGE_KEYS.REFRESH_PREFIX}${platformId}`,
          tokenData.refreshToken
        );
      }

      await SecureStore.setItemAsync(
        `${STORAGE_KEYS.EXPIRES_PREFIX}${platformId}`,
        tokenData.expiresAt
      );
    } catch (error) {
      console.error(`Store tokens error for ${platformId}:`, error);
      throw error;
    }
  }

  /**
   * Store username
   */
  async storeUsername(platformId, username) {
    try {
      await SecureStore.setItemAsync(
        `${STORAGE_KEYS.USERNAME_PREFIX}${platformId}`,
        username
      );
    } catch (error) {
      console.error(`Store username error for ${platformId}:`, error);
    }
  }

  /**
   * Get access token
   */
  async getAccessToken(platformId) {
    try {
      const token = await SecureStore.getItemAsync(`${STORAGE_KEYS.TOKEN_PREFIX}${platformId}`);
      if (!token) {
        return null;
      }

      // Check if token is expired
      const expiresAt = await this.getExpiresAt(platformId);
      if (expiresAt && new Date(expiresAt) < new Date()) {
        // Token expired, try to refresh
        try {
          const refreshed = await this.refreshToken(platformId);
          return refreshed.accessToken;
        } catch (error) {
          console.error(`Token refresh failed for ${platformId}:`, error);
          return null;
        }
      }

      return token;
    } catch (error) {
      console.error(`Get access token error for ${platformId}:`, error);
      return null;
    }
  }

  /**
   * Get refresh token
   */
  async getRefreshToken(platformId) {
    try {
      return await SecureStore.getItemAsync(`${STORAGE_KEYS.REFRESH_PREFIX}${platformId}`);
    } catch (error) {
      console.error(`Get refresh token error for ${platformId}:`, error);
      return null;
    }
  }

  /**
   * Get token expiration time
   */
  async getExpiresAt(platformId) {
    try {
      const expiresAt = await SecureStore.getItemAsync(`${STORAGE_KEYS.EXPIRES_PREFIX}${platformId}`);
      return expiresAt;
    } catch (error) {
      console.error(`Get expires at error for ${platformId}:`, error);
      return null;
    }
  }

  /**
   * Get username
   */
  async getUsername(platformId) {
    try {
      return await SecureStore.getItemAsync(`${STORAGE_KEYS.USERNAME_PREFIX}${platformId}`);
    } catch (error) {
      console.error(`Get username error for ${platformId}:`, error);
      return null;
    }
  }

  /**
   * Check if platform is connected
   */
  async isConnected(platformId) {
    try {
      const token = await this.getAccessToken(platformId);
      return token !== null;
    } catch (error) {
      console.error(`Check connection error for ${platformId}:`, error);
      return false;
    }
  }

  /**
   * Get connection data
   */
  async getConnectionData(platformId) {
    try {
      const token = await this.getAccessToken(platformId);
      if (!token) {
        return null;
      }

      const username = await this.getUsername(platformId);
      const expiresAt = await this.getExpiresAt(platformId);

      return {
        connected: true,
        accessToken: token,
        username: username || `user_${platformId}`,
        expiresAt: expiresAt,
        connectedAt: expiresAt, // Approximate
      };
    } catch (error) {
      console.error(`Get connection data error for ${platformId}:`, error);
      return null;
    }
  }

  /**
   * Disconnect platform (remove tokens)
   */
  async disconnect(platformId) {
    try {
      await SecureStore.deleteItemAsync(`${STORAGE_KEYS.TOKEN_PREFIX}${platformId}`);
      await SecureStore.deleteItemAsync(`${STORAGE_KEYS.REFRESH_PREFIX}${platformId}`);
      await SecureStore.deleteItemAsync(`${STORAGE_KEYS.EXPIRES_PREFIX}${platformId}`);
      await SecureStore.deleteItemAsync(`${STORAGE_KEYS.USERNAME_PREFIX}${platformId}`);
      return { success: true };
    } catch (error) {
      console.error(`Disconnect error for ${platformId}:`, error);
      return { success: false, error: error.message };
    }
  }
}

export default new OAuthService();

