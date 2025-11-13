# OAuth Setup Guide

This guide explains how to set up OAuth authentication for each platform in JunkTrunk.

## Overview

JunkTrunk uses OAuth 2.0 to authenticate with various platforms (Reddit, eBay, Amazon, Facebook, Craigslist). This allows users to connect their accounts and post directly from the app.

## Prerequisites

1. Install dependencies:
   ```bash
   npm install expo-auth-session expo-secure-store expo-web-browser
   ```

2. Configure app.json with OAuth redirect URIs (already done)

## Platform Setup

### 1. Reddit

1. Go to https://www.reddit.com/prefs/apps
2. Click "Create App" or "Create Another App"
3. Fill in the form:
   - Name: JunkTrunk
   - App type: script
   - Description: JunkTrunk OAuth App
   - About URL: (optional)
   - Redirect URI: `junktrunk://oauth/reddit`
4. Save the app and note your Client ID and Client Secret
5. Add to app.json:
   ```json
   "extra": {
     "REDDIT_CLIENT_ID": "your_client_id",
     "REDDIT_CLIENT_SECRET": "your_client_secret"
   }
   ```

### 2. eBay

1. Go to https://developer.ebay.com/my/keys
2. Create a new application
3. Fill in the form:
   - Application Title: JunkTrunk
   - Redirect URI: `junktrunk://oauth/ebay`
4. Save and note your Client ID and Client Secret
5. Add to app.json:
   ```json
   "extra": {
     "EBAY_CLIENT_ID": "your_client_id",
     "EBAY_CLIENT_SECRET": "your_client_secret"
   }
   ```

### 3. Amazon

1. Go to https://sellercentral.amazon.com/apps/develop
2. Register your application
3. Fill in the form:
   - Application Name: JunkTrunk
   - Redirect URI: `junktrunk://oauth/amazon`
4. Save and note your Client ID and Client Secret
5. Add to app.json:
   ```json
   "extra": {
     "AMAZON_CLIENT_ID": "your_client_id",
     "AMAZON_CLIENT_SECRET": "your_client_secret"
   }
   ```

### 4. Facebook

1. Go to https://developers.facebook.com/apps/
2. Create a new app
3. Add Facebook Login product
4. Configure OAuth:
   - Valid OAuth Redirect URIs: `junktrunk://oauth/facebook`
   - Add permissions: `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`
5. Save and note your App ID and App Secret
6. Add to app.json:
   ```json
   "extra": {
     "FACEBOOK_CLIENT_ID": "your_app_id",
     "FACEBOOK_CLIENT_SECRET": "your_app_secret"
   }
   ```

### 5. Craigslist

**Note:** Craigslist does not have a public OAuth API. Manual posting is required.

## Environment Variables

### Development

Add to `app.json`:
```json
{
  "expo": {
    "extra": {
      "REDDIT_CLIENT_ID": "your_reddit_client_id",
      "REDDIT_CLIENT_SECRET": "your_reddit_client_secret",
      "EBAY_CLIENT_ID": "your_ebay_client_id",
      "EBAY_CLIENT_SECRET": "your_ebay_client_secret",
      "AMAZON_CLIENT_ID": "your_amazon_client_id",
      "AMAZON_CLIENT_SECRET": "your_amazon_client_secret",
      "FACEBOOK_CLIENT_ID": "your_facebook_client_id",
      "FACEBOOK_CLIENT_SECRET": "your_facebook_client_secret"
    }
  }
}
```

### Production (EAS Secrets)

For production, use EAS Secrets to securely store credentials:

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to EAS
eas login

# Set secrets
eas secret:create --name REDDIT_CLIENT_ID --value your_client_id
eas secret:create --name REDDIT_CLIENT_SECRET --value your_client_secret
eas secret:create --name EBAY_CLIENT_ID --value your_client_id
eas secret:create --name EBAY_CLIENT_SECRET --value your_client_secret
eas secret:create --name AMAZON_CLIENT_ID --value your_client_id
eas secret:create --name AMAZON_CLIENT_SECRET --value your_client_secret
eas secret:create --name FACEBOOK_CLIENT_ID --value your_client_id
eas secret:create --name FACEBOOK_CLIENT_SECRET --value your_client_secret
```

Then update `app.json` to use secrets:
```json
{
  "expo": {
    "extra": {
      "REDDIT_CLIENT_ID": process.env.REDDIT_CLIENT_ID,
      "REDDIT_CLIENT_SECRET": process.env.REDDIT_CLIENT_SECRET,
      "EBAY_CLIENT_ID": process.env.EBAY_CLIENT_ID,
      "EBAY_CLIENT_SECRET": process.env.EBAY_CLIENT_SECRET,
      "AMAZON_CLIENT_ID": process.env.AMAZON_CLIENT_ID,
      "AMAZON_CLIENT_SECRET": process.env.AMAZON_CLIENT_SECRET,
      "FACEBOOK_CLIENT_ID": process.env.FACEBOOK_CLIENT_ID,
      "FACEBOOK_CLIENT_SECRET": process.env.FACEBOOK_CLIENT_SECRET
    }
  }
}
```

## Testing

1. Start the app:
   ```bash
   npm start
   ```

2. Navigate to the platform selection screen

3. Click "Sign In" on a platform

4. Complete OAuth flow in the browser

5. Verify connection status

## Troubleshooting

### OAuth Not Working

1. Check that redirect URIs are correctly configured in platform settings
2. Verify client IDs and secrets are correct
3. Check app.json for proper scheme configuration
4. Verify platform supports OAuth (Craigslist does not)

### Token Refresh Issues

1. Check that refresh tokens are being stored securely
2. Verify token expiration times are correct
3. Check platform-specific token refresh requirements

### Backend Connection Issues

1. Verify backend is running
2. Check API endpoints are correct
3. Verify CORS settings allow mobile app requests

## Security Notes

1. **Never commit secrets to version control**
2. Use EAS Secrets for production
3. Store tokens securely using expo-secure-store
4. Implement token refresh logic
5. Handle token expiration gracefully

## API Documentation

### OAuth Service

The OAuth service (`services/oauth.js`) provides:
- `authenticate(platformId)`: Start OAuth flow
- `refreshToken(platformId)`: Refresh access token
- `getAccessToken(platformId)`: Get current access token
- `disconnect(platformId)`: Remove platform connection
- `isConnected(platformId)`: Check connection status

### Backend Endpoints

- `POST /api/platforms/connect`: Store OAuth tokens
- `POST /api/platforms/disconnect`: Remove OAuth tokens
- `POST /api/platforms/post`: Post product to platform

## Next Steps

1. Set up OAuth credentials for each platform
2. Test OAuth flow for each platform
3. Implement platform-specific posting logic
4. Add error handling and retry logic
5. Implement token refresh for expired tokens
6. Add user feedback for posting status

