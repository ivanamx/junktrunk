const express = require('express');
const router = express.Router();

// Get available platforms for posting
router.get('/list', (req, res) => {
  const platforms = [
    {
      id: 'reddit',
      name: 'Reddit',
      icon: '🔴',
      description: 'Post to r/Flipping, r/sell, and more',
      category: 'Social',
    },
    {
      id: 'ebay',
      name: 'eBay',
      icon: '💰',
      description: 'Sell to millions of buyers worldwide',
      category: 'Marketplace',
    },
    {
      id: 'amazon',
      name: 'Amazon',
      icon: '📦',
      description: 'Sell on Amazon Marketplace',
      category: 'Marketplace',
    },
    {
      id: 'facebook',
      name: 'Facebook Marketplace',
      icon: '👥',
      description: 'Sell to your local community',
      category: 'Social',
    },
    {
      id: 'junksale',
      name: 'JunkSale',
      icon: '🏪',
      description: 'Internal marketplace (coming soon)',
      category: 'Internal',
    },
    {
      id: 'craigslist',
      name: 'Craigslist',
      icon: '📋',
      description: 'Local classifieds and forums',
      category: 'Local',
    },
  ];

  res.json({ success: true, platforms });
});

// Connect platform (store OAuth tokens)
router.post('/connect', async (req, res) => {
  try {
    const { platform, auth } = req.body;

    if (!platform || !auth) {
      return res.status(400).json({ 
        success: false, 
        error: 'Platform and auth data are required' 
      });
    }

    // In production, store tokens in database securely
    // For now, we'll just validate and return success
    const validPlatforms = ['reddit', 'ebay', 'amazon', 'facebook', 'craigslist'];
    
    if (!validPlatforms.includes(platform)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid platform' 
      });
    }

    // Validate auth data structure
    if (!auth.accessToken) {
      return res.status(400).json({ 
        success: false, 
        error: 'Access token is required' 
      });
    }

    // TODO: Store tokens in database
    // Example:
    // await db.query(
    //   'INSERT INTO platform_connections (platform, access_token, refresh_token, expires_at, user_id) VALUES ($1, $2, $3, $4, $5)',
    //   [platform, auth.accessToken, auth.refreshToken, auth.expiresAt, userId]
    // );

    console.log(`Platform connected: ${platform}`);

    res.json({
      success: true,
      platform: platform,
      message: `Successfully connected to ${platform}`,
    });
  } catch (error) {
    console.error('Error connecting platform:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to connect platform' 
    });
  }
});

// Disconnect platform (remove OAuth tokens)
router.post('/disconnect', async (req, res) => {
  try {
    const { platform } = req.body;

    if (!platform) {
      return res.status(400).json({ 
        success: false, 
        error: 'Platform is required' 
      });
    }

    // TODO: Remove tokens from database
    // Example:
    // await db.query(
    //   'DELETE FROM platform_connections WHERE platform = $1 AND user_id = $2',
    //   [platform, userId]
    // );

    console.log(`Platform disconnected: ${platform}`);

    res.json({
      success: true,
      platform: platform,
      message: `Successfully disconnected from ${platform}`,
    });
  } catch (error) {
    console.error('Error disconnecting platform:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to disconnect platform' 
    });
  }
});

// Post product to platform
router.post('/post', async (req, res) => {
  try {
    const { platform, product, connection } = req.body;

    if (!platform || !product) {
      return res.status(400).json({ 
        success: false, 
        error: 'Platform and product are required' 
      });
    }

    if (!connection || !connection.accessToken) {
      return res.status(400).json({ 
        success: false, 
        error: 'Platform connection (access token) is required' 
      });
    }

    // Validate platform
    const validPlatforms = ['reddit', 'ebay', 'amazon', 'facebook', 'craigslist'];
    if (!validPlatforms.includes(platform)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid platform' 
      });
    }

    // Post to platform based on platform type
    let result;
    try {
      result = await postToPlatform(platform, product, connection);
    } catch (error) {
      console.error(`Error posting to ${platform}:`, error);
      return res.status(500).json({ 
        success: false, 
        error: `Failed to post to ${platform}: ${error.message}` 
      });
    }

    res.json({
      success: true,
      platform: platform,
      product: product,
      result: result,
      message: `Successfully posted to ${platform}`,
    });
  } catch (error) {
    console.error('Error posting to platform:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to post to platform' 
    });
  }
});

// Post to platform helper function
async function postToPlatform(platform, product, connection) {
  const { accessToken } = connection;

  switch (platform) {
    case 'reddit':
      return await postToReddit(product, accessToken);
    case 'ebay':
      return await postToEbay(product, accessToken);
    case 'amazon':
      return await postToAmazon(product, accessToken);
    case 'facebook':
      return await postToFacebook(product, accessToken);
    case 'craigslist':
      return await postToCraigslist(product, accessToken);
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

// Post to Reddit
async function postToReddit(product, accessToken) {
  try {
    // Reddit API endpoint for posting
    const subreddit = 'Flipping'; // Default subreddit
    const title = product.name || 'Product for Sale';
    const text = product.description || '';
    const url = product.image || '';

    const response = await fetch('https://oauth.reddit.com/api/submit', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'JunkTrunk/1.0.0',
      },
      body: new URLSearchParams({
        sr: subreddit,
        kind: url ? 'link' : 'self',
        title: title,
        text: text,
        url: url,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Reddit API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return {
      success: true,
      postId: data.json?.data?.id,
      url: `https://reddit.com${data.json?.data?.permalink}`,
    };
  } catch (error) {
    console.error('Error posting to Reddit:', error);
    throw error;
  }
}

// Post to eBay
async function postToEbay(product, accessToken) {
  try {
    // eBay API endpoint for creating listing
    const response = await fetch('https://api.ebay.com/sell/inventory/v1/offer', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
      body: JSON.stringify({
        marketplaceId: 'EBAY_US',
        sku: product.barcode || `SKU_${Date.now()}`,
        offer: {
          availableQuantity: 1,
          categoryId: '267', // Default category
          format: 'FIXED_PRICE',
          listingDescription: product.description || '',
          listingPolicies: {
            paymentPolicyId: 'default',
            returnPolicyId: 'default',
            fulfillmentPolicyId: 'default',
          },
          merchantLocationKey: 'default',
          pricingSummary: {
            price: {
              value: product.price?.replace(/[^0-9.]/g, '') || '0.00',
              currency: 'USD',
            },
          },
          quantityLimitPerBuyer: 1,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`eBay API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return {
      success: true,
      offerId: data.offerId,
      listingId: data.listingId,
      url: `https://www.ebay.com/itm/${data.listingId}`,
    };
  } catch (error) {
    console.error('Error posting to eBay:', error);
    throw error;
  }
}

// Post to Amazon
async function postToAmazon(product, accessToken) {
  try {
    // Amazon Selling Partner API endpoint for creating listing
    // Note: Amazon API is more complex and requires additional setup
    const response = await fetch('https://sellingpartnerapi-na.amazon.com/listings/2021-08-01/items', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'x-amz-access-token': accessToken,
      },
      body: JSON.stringify({
        marketplaceId: 'ATVPDKIKX0DER',
        sku: product.barcode || `SKU_${Date.now()}`,
        productType: 'PRODUCT',
        attributes: {
          item_name: product.name || 'Product',
          bullet_point: [product.description || ''],
          list_price: {
            value: product.price?.replace(/[^0-9.]/g, '') || '0.00',
            currency: 'USD',
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Amazon API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return {
      success: true,
      listingId: data.listingId,
      url: `https://sellercentral.amazon.com/inventory/${data.listingId}`,
    };
  } catch (error) {
    console.error('Error posting to Amazon:', error);
    throw error;
  }
}

// Post to Facebook Marketplace
async function postToFacebook(product, accessToken) {
  try {
    // Facebook Graph API endpoint for creating marketplace listing
    // Note: Requires page access token and page ID
    const pageId = 'YOUR_PAGE_ID'; // Get from Facebook
    const response = await fetch(`https://graph.facebook.com/v18.0/${pageId}/feed`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `${product.name || 'Product'}\n\n${product.description || ''}\n\nPrice: ${product.price || 'N/A'}`,
        link: product.image || '',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Facebook API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return {
      success: true,
      postId: data.id,
      url: `https://www.facebook.com/${data.id}`,
    };
  } catch (error) {
    console.error('Error posting to Facebook:', error);
    throw error;
  }
}

// Post to Craigslist
async function postToCraigslist(product, accessToken) {
  try {
    // Note: Craigslist doesn't have a public API
    // This would require web scraping or manual posting
    // For now, return a URL to the posting page
    return {
      success: true,
      url: 'https://www.craigslist.org/post',
      message: 'Craigslist posting requires manual submission. Please visit the URL to complete your posting.',
    };
  } catch (error) {
    console.error('Error posting to Craigslist:', error);
    throw error;
  }
}

module.exports = router;
