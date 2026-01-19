const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const axios = require('axios');
const OpenAI = require('openai');

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Barcode lookup service (UPCItemDB → OpenFoodFacts → eBay → Google Custom Search)
// Nueva lógica:
// 1. Buscar primero en UPCItemDB, si encuentra nombre e imagen → terminar ciclo de APIs primarias (pero aún buscar eBay)
// 2. Si no encuentra en UPCItemDB, buscar en OpenFoodFacts, si encuentra nombre e imagen → terminar ciclo de APIs primarias (pero aún buscar eBay)
// 3. eBay siempre se busca y se agregan precios a la lista
// 4. Google Shopping solo se busca si no se encontró info en UPCItemDB ni OpenFoodFacts
const lookupBarcode = async (barcode) => {
  try {
    console.log('🔍 Starting barcode lookup for:', barcode);
    
    let result = {
      name: null,
      image: null,
      brand: null,
      category: null,
      platform: null,
      url: null,
      prices: [] // Array of {source: string, price: string, url: string}
    };
    
    let foundInPrimaryAPI = false; // Flag para saber si encontramos info en UPCItemDB o OpenFoodFacts
    
    // Opción 1: UPCItemDB
    try {
      console.log('🌐 Trying UPCItemDB...');
      const upcResponse = await axios.get('https://api.upcitemdb.com/prod/trial/lookup', {
        params: { upc: barcode },
        timeout: 10000
      });
      
      if (upcResponse.data.items && upcResponse.data.items.length > 0) {
        const item = upcResponse.data.items[0];
        const productName = item.title || item.description || 'Unknown Product';
        console.log('✅ Found product in UPCItemDB:', productName);
        
        // Set name
        result.name = productName;
        result.platform = 'UPCItemDB';
        result.url = `https://www.upcitemdb.com/upc/${barcode}`;
        
        // Extract ALL prices from offers if available
        console.log('🔍 Checking for prices in UPCItemDB response...');
        console.log('📦 Item offers:', item.offers ? item.offers.length : 0);
        console.log('📦 Lowest recorded price:', item.lowest_recorded_price);
        
        if (item.offers && Array.isArray(item.offers) && item.offers.length > 0) {
          // Add ALL offers as separate prices (excluding Macys Canada)
          item.offers.forEach(offer => {
            if (offer.merchant && offer.price) {
              const merchantName = offer.merchant || 'UPCItemDB';
              
              // Filter out Macys Canada
              if (merchantName.toLowerCase().includes('macys canada') || 
                  merchantName.toLowerCase().includes('macy\'s canada')) {
                console.log(`⏭️ Skipping price from ${merchantName} (filtered out)`);
                return;
              }
              
              // Check if we already have this exact price from the same merchant to avoid duplicates
              const existingPrice = result.prices.find(p => 
                p.source === merchantName && 
                Math.abs(parseFloat(p.price.replace('$', '').replace(/,/g, '')) - parseFloat(offer.price)) < 0.01
              );
              
              if (!existingPrice) {
                result.prices.push({
                  source: merchantName,
                  price: `$${parseFloat(offer.price).toFixed(2)}`,
                  url: offer.link || `https://www.upcitemdb.com/upc/${barcode}`
                });
                console.log(`✅ Found price from ${merchantName}:`, result.prices[result.prices.length - 1].price);
              }
            }
          });
        }
        
        // Add lowest recorded price if no other prices found (as fallback)
        if (result.prices.length === 0 && item.lowest_recorded_price) {
          result.prices.push({
            source: 'UPCItemDB',
            price: `$${parseFloat(item.lowest_recorded_price).toFixed(2)}`,
            url: `https://www.upcitemdb.com/upc/${barcode}`
          });
          console.log('✅ Using lowest recorded price from UPCItemDB:', result.prices[0].price);
        }
        
        // Get image if available
        if (item.images && item.images.length > 0) {
          result.image = item.images[0];
          console.log('✅ Found image in UPCItemDB');
        }
        
        // Get brand and category if available
        if (item.brand) {
          result.brand = item.brand;
        }
        if (item.category) {
          result.category = item.category;
        }
        
        // Si tenemos nombre e imagen Y precios, marcamos como encontrado completamente
        // Si tenemos nombre e imagen pero NO precios, NO marcamos como encontrado para seguir buscando precios en otras APIs
        if (result.name && result.image && result.prices.length > 0) {
          foundInPrimaryAPI = true;
          console.log('✅ Found complete info in UPCItemDB (name, image, prices) - will still search eBay for more prices');
        } else if (result.name && result.image) {
          // Tenemos nombre e imagen pero NO precios, continuamos buscando en otras APIs
          console.log('✅ Found name and image in UPCItemDB but no prices - will continue searching in other APIs for prices');
        } else if (result.name) {
          // Solo tenemos nombre, marcamos como encontrado pero seguimos buscando imagen
          foundInPrimaryAPI = true;
          console.log('✅ Found product name in UPCItemDB - will still search eBay and other APIs for prices');
        }
      } else {
        console.log('⚠️ UPCItemDB returned no items');
      }
    } catch (error) {
      console.log(`❌ UPCItemDB failed:`, error.message);
    }

    // Opción 2: OpenFoodFacts (si no encontramos nombre en UPCItemDB, o si encontramos nombre pero no imagen, o si encontramos nombre e imagen pero no precios)
    if (!foundInPrimaryAPI || (result.name && !result.image) || (result.name && result.image && result.prices.length === 0)) {
      try {
        console.log('🌐 Trying OpenFoodFacts...');
        const ofResponse = await axios.get(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`, {
          timeout: 10000
        });
        
        if (ofResponse.data.status === 1 && ofResponse.data.product) {
          const product = ofResponse.data.product;
          const productName = product.product_name || product.product_name_en || 'Unknown Product';
          console.log('✅ Found product in OpenFoodFacts:', productName);
          
          // Set name if not already set
          if (!result.name) {
            result.name = productName;
            result.platform = 'OpenFoodFacts';
            result.url = `https://world.openfoodfacts.org/product/${barcode}`;
          }
          
          // Get image if not already found
          if (!result.image) {
            result.image = product.image_url || product.image_front_url || null;
            if (result.image) {
              console.log('✅ Found image in OpenFoodFacts');
            }
          }
          
          // Get brand and category if not already found
          if (!result.brand && product.brands) {
            result.brand = product.brands;
          }
          if (!result.category && product.categories) {
            result.category = product.categories;
          }
          
          // Si tenemos nombre, marcamos como encontrado (la imagen es opcional, los precios pueden venir de eBay)
          if (result.name) {
            foundInPrimaryAPI = true;
            console.log('✅ Found product in OpenFoodFacts (name found) - will still search eBay for prices');
          }
        } else {
          console.log('⚠️ OpenFoodFacts product not found (status:', ofResponse.data.status, ')');
        }
      } catch (error) {
        console.log(`❌ OpenFoodFacts failed:`, error.message);
      }
    } else {
      console.log('⏭️ Skipping OpenFoodFacts - already found name and image in UPCItemDB');
    }

    // Opción 3: eBay Finding API (SIEMPRE se busca, independientemente de si encontramos info en otras APIs)
    // Solo agregamos precios, no sobrescribimos nombre/imagen si ya los tenemos
    try {
      console.log('🌐 Trying eBay Finding API (always searched)...');
      const ebayAppId = process.env.EBAY_APP_ID || 'YourAppId';
      
      if (ebayAppId && ebayAppId !== 'YourAppId') {
        const ebayResponse = await axios.get('https://svcs.ebay.com/services/search/FindingService/v1', {
          params: {
            'OPERATION-NAME': 'findItemsByProduct',
            'SERVICE-VERSION': '1.0.0',
            'SECURITY-APPNAME': ebayAppId,
            'RESPONSE-DATA-FORMAT': 'JSON',
            'REST-PAYLOAD': '',
            'productId': barcode,
            'productIdType': 'UPC',
            'paginationInput.entriesPerPage': '5', // Get more results to find best price
            'sortOrder': 'PricePlusShippingLowest'
          },
          timeout: 10000
        });
        
        if (ebayResponse.data && 
            ebayResponse.data.findItemsByProductResponse && 
            ebayResponse.data.findItemsByProductResponse[0] &&
            ebayResponse.data.findItemsByProductResponse[0].searchResult &&
            ebayResponse.data.findItemsByProductResponse[0].searchResult[0] &&
            ebayResponse.data.findItemsByProductResponse[0].searchResult[0].item &&
            ebayResponse.data.findItemsByProductResponse[0].searchResult[0].item.length > 0) {
          
          const items = ebayResponse.data.findItemsByProductResponse[0].searchResult[0].item;
          console.log(`✅ Found ${items.length} items in eBay`);
          
          // Agregar precios de eBay (puede haber múltiples)
          items.forEach(item => {
            const itemPrice = item.sellingStatus && 
                            item.sellingStatus[0] && 
                            item.sellingStatus[0].currentPrice && 
                            item.sellingStatus[0].currentPrice[0] &&
                            item.sellingStatus[0].currentPrice[0].__value__ ? 
                            item.sellingStatus[0].currentPrice[0].__value__ : null;
            const itemUrl = item.viewItemURL && item.viewItemURL[0] ? item.viewItemURL[0] : null;
            
            if (itemPrice) {
              // Check if we already have this price to avoid duplicates
              const existingPrice = result.prices.find(p => 
                Math.abs(parseFloat(p.price.replace('$', '').replace(/,/g, '')) - parseFloat(itemPrice)) < 0.01
              );
              if (!existingPrice) {
                result.prices.push({
                  source: 'eBay',
                  price: `$${parseFloat(itemPrice).toFixed(2)}`,
                  url: itemUrl || `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(barcode)}`
                });
                console.log('✅ Found price in eBay:', result.prices[result.prices.length - 1].price);
              }
            }
          });
        } else {
          console.log('⚠️ eBay returned no items');
        }
      } else {
        console.log('⚠️ eBay App ID not configured, skipping eBay API');
      }
    } catch (error) {
      console.log(`❌ eBay Finding API failed:`, error.message);
    }

    // Opción 4: Google Custom Search API (solo si NO encontramos info completa en UPCItemDB ni OpenFoodFacts, o si tenemos nombre e imagen pero no precios)
    if (!foundInPrimaryAPI || (result.name && result.image && result.prices.length === 0)) {
      try {
        console.log('🌐 Trying Google Custom Search API (only if not found in primary APIs)...');
        const googleApiKey = process.env.GOOGLE_API_KEY;
        const googleCx = process.env.GOOGLE_CX;

        if (googleApiKey && googleCx && googleApiKey !== 'your-api-key-here' && googleCx !== 'your-search-engine-id-here') {
          // Helper function to extract prices from text
          const extractPrices = (text) => {
            const prices = [];
            if (!text) return prices;
            
            // Multiple price patterns to catch different formats
            const dollarPattern = /\$[\d,]+\.?\d*/g;
            const usdPattern = /USD\s*[\d,]+\.?\d*/gi;
            const simpleDollarPattern = /\$\s*[\d,]+(?:\.\d{2})?/g;
            const priceLabelPattern = /(?:price|precio|cost|precio):\s*\$?[\d,]+\.?\d*/gi;
            const mxnPattern = /MXN\s*\$?[\d,]+\.?\d*/gi;
            
            // Try all patterns
            const allPatterns = [
              ...text.match(dollarPattern) || [],
              ...text.match(usdPattern) || [],
              ...text.match(simpleDollarPattern) || [],
              ...text.match(priceLabelPattern) || [],
              ...text.match(mxnPattern) || []
            ];
            
            // Extract unique prices
            for (const match of allPatterns) {
              const priceValue = match.replace(/[^0-9.]/g, '').replace(/,/g, '');
              const priceNum = parseFloat(priceValue);
              
              if (!isNaN(priceNum) && priceNum > 0 && priceNum < 1000000) {
                const formattedPrice = `$${priceNum.toFixed(2)}`;
                
                const existingPrice = prices.find(p => 
                  Math.abs(parseFloat(p.replace('$', '').replace(/,/g, '')) - priceNum) < 0.01
                );
                
                if (!existingPrice) {
                  prices.push(formattedPrice);
                }
              }
            }
            
            return prices;
          };

          // Search for product with shopping focus to get prices, image, and seller info
          try {
            const googleShoppingResponse = await axios.get('https://www.googleapis.com/customsearch/v1', {
              params: {
                key: googleApiKey,
                cx: googleCx,
                q: `${barcode} buy price shopping`,
                num: 5,
                safe: 'active'
              },
              timeout: 10000
            });
            
            if (googleShoppingResponse.data && googleShoppingResponse.data.items && googleShoppingResponse.data.items.length > 0) {
              const items = googleShoppingResponse.data.items;
              console.log(`🔍 Found ${items.length} Google search results`);
              
              for (const item of items) {
                // Extract prices from snippet, title, and HTML snippet
                const searchText = `${item.title || ''} ${item.snippet || ''} ${item.htmlSnippet || ''}`;
                const foundPrices = extractPrices(searchText);
                
                // Add found prices with seller info (displayLink as source)
                for (const price of foundPrices) {
                  const existingPrice = result.prices.find(p => {
                    const p1 = parseFloat(p.price.replace('$', '').replace(/,/g, ''));
                    const p2 = parseFloat(price.replace('$', '').replace(/,/g, ''));
                    return Math.abs(p1 - p2) < 0.01;
                  });
                  
                  if (!existingPrice) {
                    // Use displayLink as seller/source name
                    const sellerName = item.displayLink || 'Google';
                    result.prices.push({
                      source: sellerName,
                      price: price,
                      url: item.link || `https://www.google.com/search?q=${encodeURIComponent(barcode)}`
                    });
                    console.log(`✅ Found price in Google: ${price} from ${sellerName}`);
                  }
                }
                
                // Get name if not already found
                if (!result.name && item.title) {
                  const cleanTitle = item.title
                    .replace(/\s*-\s*Google Shopping.*/i, '')
                    .replace(/\s*-\s*Amazon.*/i, '')
                    .replace(/\s*-\s*eBay.*/i, '')
                    .trim();
                  if (cleanTitle) {
                    result.name = cleanTitle;
                    if (!result.platform) {
                      result.platform = 'Google';
                      result.url = item.link || `https://www.google.com/search?q=${encodeURIComponent(barcode)}`;
                    }
                  }
                }
              }
            }
          } catch (shoppingError) {
            console.log(`❌ Google Shopping search failed:`, shoppingError.message);
          }

          // Image search (if we still need image)
          if (!result.image) {
            try {
              const googleImageResponse = await axios.get('https://www.googleapis.com/customsearch/v1', {
                params: {
                  key: googleApiKey,
                  cx: googleCx,
                  q: barcode,
                  searchType: 'image',
                  num: 3,
                  safe: 'active'
                },
                timeout: 10000
              });
              
              if (googleImageResponse.data && googleImageResponse.data.items && googleImageResponse.data.items.length > 0) {
                // Try to find a good product image (not a barcode image)
                for (const item of googleImageResponse.data.items) {
                  const link = item.link;
                  if (link && !link.toLowerCase().includes('barcode') && !link.toLowerCase().includes('qr')) {
                    result.image = link;
                    console.log('✅ Found image in Google Image Search');
                    break;
                  }
                }
                
                // If no good image found, use the first one
                if (!result.image && googleImageResponse.data.items[0].link) {
                  result.image = googleImageResponse.data.items[0].link;
                  console.log('✅ Found image in Google Image Search (first result)');
                }
              }
            } catch (imageError) {
              console.log(`❌ Google Image search failed:`, imageError.message);
            }
          }
        } else {
          console.log('⚠️ Google API Key or CX not configured, skipping Google Custom Search API');
        }
      } catch (error) {
        console.log(`❌ Google Custom Search API failed:`, error.message);
      }
    } else {
      console.log('⏭️ Skipping Google - already found info in primary APIs (UPCItemDB or OpenFoodFacts)');
    }

    // If we have at least a name, return the result (even if missing image or price)
    if (result.name) {
      // Limit prices to maximum 5
      if (result.prices && result.prices.length > 5) {
        const originalLength = result.prices.length;
        result.prices = result.prices.slice(0, 5);
        console.log(`✅ Limited prices to 5 (had ${originalLength} prices)`);
      }
      console.log('✅ Returning combined result from APIs');
      return result;
    }

    // If we reach here, product was not found in any API
    console.log('⚠️ Product not found in any API');
    return null; // Return null to indicate product not found
  } catch (error) {
    console.error('Barcode lookup error:', error);
    return null; // Return null on error - product not found
  }
};

// Removed complex JWT/OAuth functions - now using simple API key

// Lookup product by name (similar to lookupBarcode but searches by product name)
const lookupProductByName = async (productName) => {
  try {
    console.log('🔍 Starting product lookup by name:', productName);
    
    let result = {
      name: productName, // Use the provided name
      image: null,
      brand: null,
      category: null,
      platform: null,
      url: null,
      prices: [] // Array of {source: string, price: string, url: string}
    };
    
    // Search eBay by product name
    try {
      console.log('🌐 Searching eBay by product name...');
      const ebayAppId = process.env.EBAY_APP_ID;
      
      if (ebayAppId && ebayAppId !== 'your-ebay-app-id-here') {
        const ebayResponse = await axios.get('https://svcs.ebay.com/services/search/FindingService/v1', {
          params: {
            'OPERATION-NAME': 'findItemsByKeywords',
            'SERVICE-VERSION': '1.0.0',
            'SECURITY-APPNAME': ebayAppId,
            'RESPONSE-DATA-FORMAT': 'JSON',
            'REST-PAYLOAD': '',
            'keywords': productName,
            'paginationInput.entriesPerPage': 10,
            'sortOrder': 'PricePlusShippingLowest'
          },
          timeout: 10000
        });
        
        if (ebayResponse.data && 
            ebayResponse.data.findItemsByKeywordsResponse && 
            ebayResponse.data.findItemsByKeywordsResponse[0] &&
            ebayResponse.data.findItemsByKeywordsResponse[0].searchResult &&
            ebayResponse.data.findItemsByKeywordsResponse[0].searchResult[0] &&
            ebayResponse.data.findItemsByKeywordsResponse[0].searchResult[0].item &&
            ebayResponse.data.findItemsByKeywordsResponse[0].searchResult[0].item.length > 0) {
          
          const items = ebayResponse.data.findItemsByKeywordsResponse[0].searchResult[0].item;
          console.log(`✅ Found ${items.length} items in eBay`);
          
          // Get image from first item if available
          if (!result.image && items[0].galleryURL && items[0].galleryURL[0]) {
            result.image = items[0].galleryURL[0];
            console.log('✅ Found image in eBay');
          }
          
          // Add prices from eBay
          items.forEach(item => {
            const itemPrice = item.sellingStatus && 
                            item.sellingStatus[0] && 
                            item.sellingStatus[0].currentPrice && 
                            item.sellingStatus[0].currentPrice[0] &&
                            item.sellingStatus[0].currentPrice[0].__value__ ? 
                            item.sellingStatus[0].currentPrice[0].__value__ : null;
            const itemUrl = item.viewItemURL && item.viewItemURL[0] ? item.viewItemURL[0] : null;
            
            if (itemPrice) {
              const existingPrice = result.prices.find(p => 
                Math.abs(parseFloat(p.price.replace('$', '').replace(/,/g, '')) - parseFloat(itemPrice)) < 0.01
              );
              if (!existingPrice) {
                result.prices.push({
                  source: 'eBay',
                  price: `$${parseFloat(itemPrice).toFixed(2)}`,
                  url: itemUrl || `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(productName)}`
                });
                console.log('✅ Found price in eBay:', result.prices[result.prices.length - 1].price);
              }
            }
          });
        } else {
          console.log('⚠️ eBay returned no items');
        }
      } else {
        console.log('⚠️ eBay App ID not configured, skipping eBay API');
      }
    } catch (error) {
      console.log(`❌ eBay Finding API failed:`, error.message);
    }

    // Search Google Custom Search API
    try {
      console.log('🌐 Searching Google Custom Search API...');
      const googleApiKey = process.env.GOOGLE_API_KEY;
      const googleCx = process.env.GOOGLE_CX;

      if (googleApiKey && googleCx && googleApiKey !== 'your-api-key-here' && googleCx !== 'your-search-engine-id-here') {
        // Helper function to extract prices from text
        const extractPrices = (text) => {
          const prices = [];
          if (!text) return prices;
          
          const dollarPattern = /\$[\d,]+\.?\d*/g;
          const usdPattern = /USD\s*[\d,]+\.?\d*/gi;
          const simpleDollarPattern = /\$\s*[\d,]+(?:\.\d{2})?/g;
          const priceLabelPattern = /(?:price|precio|cost|precio):\s*\$?[\d,]+\.?\d*/gi;
          const mxnPattern = /MXN\s*\$?[\d,]+\.?\d*/gi;
          
          const allPatterns = [
            ...text.match(dollarPattern) || [],
            ...text.match(usdPattern) || [],
            ...text.match(simpleDollarPattern) || [],
            ...text.match(priceLabelPattern) || [],
            ...text.match(mxnPattern) || []
          ];
          
          for (const match of allPatterns) {
            const priceValue = match.replace(/[^0-9.]/g, '').replace(/,/g, '');
            const priceNum = parseFloat(priceValue);
            
            if (!isNaN(priceNum) && priceNum > 0 && priceNum < 1000000) {
              const formattedPrice = `$${priceNum.toFixed(2)}`;
              
              const existingPrice = prices.find(p => 
                Math.abs(parseFloat(p.replace('$', '').replace(/,/g, '')) - priceNum) < 0.01
              );
              
              if (!existingPrice) {
                prices.push(formattedPrice);
              }
            }
          }
          
          return prices;
        };

        // Search for product with shopping focus
        try {
          const googleShoppingResponse = await axios.get('https://www.googleapis.com/customsearch/v1', {
            params: {
              key: googleApiKey,
              cx: googleCx,
              q: `${productName} buy price shopping`,
              num: 5,
              safe: 'active'
            },
            timeout: 10000
          });
          
          if (googleShoppingResponse.data && googleShoppingResponse.data.items && googleShoppingResponse.data.items.length > 0) {
            const items = googleShoppingResponse.data.items;
            console.log(`🔍 Found ${items.length} Google search results`);
            
            for (const item of items) {
              // Extract prices from snippet, title, and HTML snippet
              const searchText = `${item.title || ''} ${item.snippet || ''} ${item.htmlSnippet || ''}`;
              const foundPrices = extractPrices(searchText);
              
              // Add found prices
              for (const price of foundPrices) {
                const existingPrice = result.prices.find(p => {
                  const p1 = parseFloat(p.price.replace('$', '').replace(/,/g, ''));
                  const p2 = parseFloat(price.replace('$', '').replace(/,/g, ''));
                  return Math.abs(p1 - p2) < 0.01;
                });
                
                if (!existingPrice) {
                  const sellerName = item.displayLink || 'Google';
                  result.prices.push({
                    source: sellerName,
                    price: price,
                    url: item.link || `https://www.google.com/search?q=${encodeURIComponent(productName)}`
                  });
                  console.log(`✅ Found price in Google: ${price} from ${sellerName}`);
                }
              }
              
              // Get image if not already found
              if (!result.image && item.pagemap && item.pagemap.cse_image && item.pagemap.cse_image[0]) {
                result.image = item.pagemap.cse_image[0].src;
                console.log('✅ Found image in Google search');
              }
              
              // Set platform and URL
              if (!result.platform) {
                result.platform = 'Google';
                result.url = item.link || `https://www.google.com/search?q=${encodeURIComponent(productName)}`;
              }
            }
          }
        } catch (shoppingError) {
          console.log(`❌ Google Shopping search failed:`, shoppingError.message);
        }

        // Image search (if we still need image)
        if (!result.image) {
          try {
            const googleImageResponse = await axios.get('https://www.googleapis.com/customsearch/v1', {
              params: {
                key: googleApiKey,
                cx: googleCx,
                q: productName,
                searchType: 'image',
                num: 3,
                safe: 'active'
              },
              timeout: 10000
            });
            
            if (googleImageResponse.data && googleImageResponse.data.items && googleImageResponse.data.items.length > 0) {
              result.image = googleImageResponse.data.items[0].link;
              console.log('✅ Found image in Google Image Search');
            }
          } catch (imageError) {
            console.log(`❌ Google Image search failed:`, imageError.message);
          }
        }
      } else {
        console.log('⚠️ Google API Key or CX not configured, skipping Google Custom Search API');
      }
    } catch (error) {
      console.log(`❌ Google Custom Search API failed:`, error.message);
    }

    // Limit prices to maximum 5
    if (result.prices && result.prices.length > 5) {
      const originalLength = result.prices.length;
      result.prices = result.prices.slice(0, 5);
      console.log(`✅ Limited prices to 5 (had ${originalLength} prices)`);
    }
    
    console.log('✅ Returning product result from name lookup');
    return result;
  } catch (error) {
    console.error('Product name lookup error:', error);
    return null;
  }
};

// Scan product endpoint
router.post('/scan', async (req, res) => {
  try {
    console.log('📥 Received scan request:', req.body);
    const { barcode, price, image_url, latitude, longitude, user_id } = req.body;

    if (!barcode) {
      console.error('❌ Barcode is required');
      return res.status(400).json({ error: 'Barcode is required' });
    }
    
    console.log('🔍 Processing barcode:', barcode);

    try {
      // Initialize variables at the start to ensure they're always defined
      let product = null;
      let isExistingProduct = false;
      let prices = [];
      let imageUrl = null; // Initialize imageUrl for all code paths - MUST be defined here
      
      // First, try to get existing product (fast path)
      const existingResult = await pool.query('SELECT * FROM products WHERE barcode = $1', [barcode]);
      product = existingResult.rows[0];
      
      // Log initial state for debugging
      console.log('🔍 Initial state - imageUrl defined:', typeof imageUrl !== 'undefined', 'value:', imageUrl);
      
      if (product) {
        console.log('✅ Product found in database:', product.id);
        isExistingProduct = true;
        
        // Get last scan info BEFORE adding new scan (to check if it was previously scanned)
        const previousScanResult = await pool.query(
          `SELECT scanned_at, latitude, longitude 
           FROM scan_history 
           WHERE product_id = $1 
           ORDER BY scanned_at DESC 
           LIMIT 1`,
          [product.id]
        );
        const previousScan = previousScanResult.rows[0] || null;
        
        // Add to scan history with location and user_id (always update location on each scan)
        try {
          await pool.query(
            'INSERT INTO scan_history (product_id, latitude, longitude, user_id) VALUES ($1, $2, $3, $4)',
            [product.id, latitude || null, longitude || null, user_id || null]
          );
          console.log('📍 Location and user saved to scan history');
        } catch (err) {
          console.error('⚠️ Error adding to scan history:', err);
        }
        
        // Always fetch latest info from API (prices and image) on each scan
        console.log('🔄 Fetching latest product info from API for existing product...');
        const productInfo = await lookupBarcode(barcode);
        
        // Only update if productInfo is not null (product found in at least one API)
        if (productInfo && productInfo !== null) {
          prices = productInfo.prices || [];
          imageUrl = image_url || productInfo.image || null; // Use image from request or API
        } else {
          // Product not found in any API, use existing values from database
          console.log('⚠️ Product not found in any API, using existing database values');
          try {
            if (product.prices) {
              if (typeof product.prices === 'string') {
                prices = product.prices.trim() ? JSON.parse(product.prices) : [];
              } else {
                prices = product.prices; // Already parsed by pg (JSONB)
              }
            } else {
              prices = [];
            }
          } catch (e) {
            console.error('⚠️ Error parsing prices from database:', e);
            prices = [];
          }
          imageUrl = product.image_url || null;
        }
        
        // Update prices in database if we got new ones
        if (prices.length > 0) {
          try {
            await pool.query(
              'UPDATE products SET prices = $1 WHERE id = $2',
              [JSON.stringify(prices), product.id]
            );
            console.log('💰 Updated prices in database:', prices.length, 'prices found');
          } catch (err) {
            console.error('⚠️ Error updating prices:', err);
          }
        }
        
        // Update image in database if we got a new one (and it's different from existing)
        if (imageUrl && imageUrl !== product.image_url) {
          try {
            await pool.query(
              'UPDATE products SET image_url = $1 WHERE id = $2',
              [imageUrl, product.id]
            );
            console.log('🖼️ Updated image in database');
          } catch (err) {
            console.error('⚠️ Error updating image:', err);
          }
        } else if (imageUrl && !product.image_url) {
          // If product has no image but we got one, save it
          try {
            await pool.query(
              'UPDATE products SET image_url = $1 WHERE id = $2',
              [imageUrl, product.id]
            );
            console.log('🖼️ Saved new image to database');
          } catch (err) {
            console.error('⚠️ Error saving image:', err);
          }
        }
        
        // Only return lastScannedAt if there was a previous scan (before this one)
        if (previousScan) {
          return res.json({
            success: true,
            product: {
              id: product.id,
              barcode: product.barcode,
              name: product.name,
              price: product.price ? `$${parseFloat(product.price).toFixed(2)}` : null,
              image: imageUrl, // Use image from API, not from database
              description: product.description,
              suggestions: [],
              lastScannedAt: previousScan.scanned_at,
              lastScannedLatitude: previousScan.latitude ? parseFloat(previousScan.latitude) : null,
              lastScannedLongitude: previousScan.longitude ? parseFloat(previousScan.longitude) : null,
              prices: prices.length > 0 ? prices : (() => {
                try {
                  if (product.prices) {
                    if (typeof product.prices === 'string') {
                      return product.prices.trim() ? JSON.parse(product.prices) : [];
                    } else {
                      return product.prices; // Already parsed by pg (JSONB)
                    }
                  }
                  return [];
                } catch (e) {
                  console.error('⚠️ Error parsing prices:', e);
                  return [];
                }
              })()
            }
          });
        }
        // If no previous scan, this is the first scan of an existing product (edge case)
        // Don't show badge but return updated Amazon price and image
        return res.json({
          success: true,
          product: {
            id: product.id,
            barcode: product.barcode,
            name: product.name,
            price: product.price ? `$${parseFloat(product.price).toFixed(2)}` : null,
            image: imageUrl, // Use image from API, not from database
            description: product.description,
            suggestions: [],
            lastScannedAt: null, // No previous scan, so no badge
            lastScannedLatitude: null,
            lastScannedLongitude: null,
            prices: prices.length > 0 ? prices : (product.prices ? JSON.parse(product.prices) : [])
          }
        });
      } else {
        console.log('🔍 Product not in database, looking up...');
        // Lookup product info
        const productInfo = await lookupBarcode(barcode);
        console.log('📦 Product info from lookup:', productInfo);
        
        // If product not found in any API, return error response
        if (!productInfo || productInfo === null) {
          console.log('❌ Product not found in any API');
          return res.json({
            success: false,
            error: 'PRODUCT_NOT_FOUND',
            message: 'Product not found in any API',
            barcode: barcode
          });
        }
        
        // Create new product only if found in API
        const name = productInfo.name || 'Unknown Product';
        imageUrl = image_url || productInfo.image || null; // Use already declared imageUrl
        prices = productInfo.prices || [];
        
        console.log('💰 Prices from lookup:', prices.length, 'prices found');
        console.log('🖼️ Image URL before INSERT:', imageUrl);
        console.log('🖼️ Image URL type before INSERT:', typeof imageUrl);
        
        // No suggestions/badges - empty array
        const platformSuggestions = JSON.stringify([]);

        // Use INSERT ... ON CONFLICT to handle race conditions atomically
        // If another request inserted the same barcode, we'll get the existing row
        // Save image_url to database so it's available in history
        // Ensure imageUrl is properly set (not empty string, not undefined)
        const finalImageUrlForDB = (imageUrl && typeof imageUrl === 'string' && imageUrl.trim() !== '') ? imageUrl.trim() : null;
        console.log('🖼️ Final image URL for DB insert:', finalImageUrlForDB);
        
        const insertResult = await pool.query(
          `INSERT INTO products (barcode, name, price, image_url, platform_suggestions, prices) 
           VALUES ($1, $2, $3, $4, $5, $6) 
           ON CONFLICT (barcode) DO UPDATE SET 
             barcode = EXCLUDED.barcode,
             image_url = COALESCE(EXCLUDED.image_url, products.image_url)
           RETURNING *`,
          [barcode, name, price || null, finalImageUrlForDB, platformSuggestions, JSON.stringify(prices)]
        );

        product = insertResult.rows[0];
        console.log('✅ Product saved/retrieved with ID:', product.id);
        console.log('🖼️ Image URL in database after INSERT:', product.image_url);
        
        // Ensure image is saved - if we have an image but it's not in DB, update it
        if (finalImageUrlForDB && !product.image_url) {
          console.log('🔄 Image URL exists but not in DB, updating...');
          try {
            await pool.query(
              'UPDATE products SET image_url = $1 WHERE id = $2',
              [finalImageUrlForDB, product.id]
            );
            // Refresh product to get updated image_url
            const updatedResult = await pool.query('SELECT * FROM products WHERE id = $1', [product.id]);
            product = updatedResult.rows[0];
            console.log('✅ Image URL saved to database:', product.image_url);
          } catch (err) {
            console.error('⚠️ Error saving image to database:', err);
          }
        } else if (finalImageUrlForDB && product.image_url) {
          console.log('✅ Image URL already in database:', product.image_url);
        } else if (!finalImageUrlForDB) {
          console.log('⚠️ No image URL to save (imageUrl was null/empty)');
        }

        // Add to scan history with location and user_id
        try {
          await pool.query(
            'INSERT INTO scan_history (product_id, latitude, longitude, user_id) VALUES ($1, $2, $3, $4)',
            [product.id, latitude || null, longitude || null, user_id || null]
          );
        } catch (err) {
          console.error('⚠️ Error adding to scan history:', err);
        }

        // Use image from database (should be saved by now) or fallback to the one we have
        // Prefer database value as it's the source of truth
        const finalImageUrl = product.image_url || finalImageUrlForDB || imageUrl || null;
        console.log('🖼️ Final image URL for response:', finalImageUrl);

        // For new products, don't return lastScannedAt (it's their first scan)
        console.log('✅ Returning new product');
        console.log('💰 Final prices being sent:', prices ? prices.length : 0, 'prices');
        console.log('🖼️ Image URL being sent:', finalImageUrl);
        console.log('🖼️ Image URL type:', typeof finalImageUrl);
        console.log('🖼️ Image URL is undefined?', typeof finalImageUrl === 'undefined');
        
        return res.json({
          success: true,
          product: {
            id: product.id,
            barcode: product.barcode,
            name: product.name,
            price: product.price ? `$${parseFloat(product.price).toFixed(2)}` : null,
            image: finalImageUrl, // Use safe variable
            description: product.description || null,
            suggestions: [], // No suggestions/badges
            lastScannedAt: null, // New products don't have previous scan history
            lastScannedLatitude: null,
            lastScannedLongitude: null,
            prices: prices || [] // Include all prices from APIs
          }
        });
      }
    } catch (dbError) {
      console.error('❌ Database error:', dbError);
      return res.status(500).json({ error: 'Database error', details: dbError.message });
    }
  } catch (error) {
    console.error('❌ Scan endpoint error:', error);
    console.error('📋 Error stack:', error.stack);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Extract product info from URLs found by visual search
const extractProductInfoFromUrls = async (urls, productName) => {
  let result = {
    name: productName,
    image: null,
    prices: [],
    platform: null,
    url: null
  };

  if (!urls || urls.length === 0) {
    return result;
  }

  // Prioritize product pages from major retailers
  const productUrls = urls.filter(url => 
    url.includes('amazon.') || 
    url.includes('ebay.com') || 
    url.includes('walmart.') ||
    url.includes('target.') ||
    url.includes('bestbuy.') ||
    url.includes('mercadolibre.') ||
    url.includes('chedraui.') ||
    url.includes('/product/') ||
    url.includes('/p/') ||
    url.includes('/item/') ||
    url.includes('/dp/')
  );

  // Use first product URL found
  if (productUrls.length > 0) {
    result.url = productUrls[0];
    
    // Detect platform
    if (productUrls[0].includes('amazon.')) {
      result.platform = 'Amazon';
    } else if (productUrls[0].includes('ebay.com')) {
      result.platform = 'eBay';
    } else if (productUrls[0].includes('walmart.')) {
      result.platform = 'Walmart';
    } else if (productUrls[0].includes('target.')) {
      result.platform = 'Target';
    } else if (productUrls[0].includes('bestbuy.')) {
      result.platform = 'Best Buy';
    } else if (productUrls[0].includes('mercadolibre.')) {
      result.platform = 'MercadoLibre';
    } else if (productUrls[0].includes('chedraui.')) {
      result.platform = 'Chedraui';
    }
  } else if (urls.length > 0) {
    // Use first URL if no product pages found
    result.url = urls[0];
  }

  // Si tenemos un nombre de producto, buscar precios usando Google Custom Search
  if (productName && productName !== 'Small appliance') {
    try {
      console.log('🔍 Searching for prices using product name:', productName);
      const googleApiKey = process.env.GOOGLE_API_KEY;
      const googleCx = process.env.GOOGLE_CX;

      if (googleApiKey && googleCx && googleApiKey !== 'your-api-key-here' && googleCx !== 'your-search-engine-id-here') {
        // Helper function to extract prices from text
        const extractPrices = (text) => {
          const prices = [];
          if (!text) return prices;
          
          const dollarPattern = /\$[\d,]+\.?\d*/g;
          const mxnPattern = /MXN\s*\$?[\d,]+\.?\d*/gi;
          const pesoPattern = /[\d,]+\.?\d*\s*pesos?/gi;
          
          const allPatterns = [
            ...text.match(dollarPattern) || [],
            ...text.match(mxnPattern) || [],
            ...text.match(pesoPattern) || []
          ];
          
          for (const match of allPatterns) {
            const priceValue = match.replace(/[^0-9.]/g, '').replace(/,/g, '');
            const priceNum = parseFloat(priceValue);
            
            if (!isNaN(priceNum) && priceNum > 0 && priceNum < 1000000) {
              const formattedPrice = `$${priceNum.toFixed(2)}`;
              
              const existingPrice = prices.find(p => 
                Math.abs(parseFloat(p.replace('$', '').replace(/,/g, '')) - priceNum) < 0.01
              );
              
              if (!existingPrice) {
                prices.push(formattedPrice);
              }
            }
          }
          
          return prices;
        };

        // Buscar en Google Shopping
        const googleShoppingResponse = await axios.get('https://www.googleapis.com/customsearch/v1', {
          params: {
            key: googleApiKey,
            cx: googleCx,
            q: `${productName} precio price comprar buy`,
            num: 5,
            safe: 'active'
          },
          timeout: 10000
        });

        if (googleShoppingResponse.data && googleShoppingResponse.data.items && googleShoppingResponse.data.items.length > 0) {
          googleShoppingResponse.data.items.forEach(item => {
            // Extraer precios del snippet y título
            const searchText = `${item.title || ''} ${item.snippet || ''}`;
            const foundPrices = extractPrices(searchText);
            
            foundPrices.forEach(price => {
              const existingPrice = result.prices.find(p => {
                const p1 = parseFloat(p.price.replace('$', '').replace(/,/g, ''));
                const p2 = parseFloat(price.replace('$', '').replace(/,/g, ''));
                return Math.abs(p1 - p2) < 0.01;
              });
              
              if (!existingPrice) {
                const sellerName = item.displayLink || 'Google';
                result.prices.push({
                  source: sellerName,
                  price: price,
                  url: item.link || result.url
                });
                console.log(`✅ Found price from ${sellerName}: ${price}`);
              }
            });

            // Obtener imagen si está disponible
            if (!result.image && item.pagemap && item.pagemap.cse_image && item.pagemap.cse_image[0]) {
              result.image = item.pagemap.cse_image[0].src;
              console.log('✅ Found image from Google search');
            }
          });
        }
      }
    } catch (error) {
      console.log(`❌ Error extracting info from URLs:`, error.message);
    }
  }

  return result;
};


// Get product by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    const product = result.rows[0];

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({
      id: product.id,
      barcode: product.barcode,
      name: product.name,
      price: product.price ? `$${parseFloat(product.price).toFixed(2)}` : null,
      image: product.image_url,
      description: product.description,
      suggestions: JSON.parse(product.platform_suggestions || '[]')
    });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// Update product
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, price, image_url, description } = req.body;

  const updates = [];
  const values = [];
  let paramIndex = 1;

  if (name !== undefined) {
    updates.push(`name = $${paramIndex}`);
    values.push(name);
    paramIndex++;
  }
  if (price !== undefined) {
    updates.push(`price = $${paramIndex}`);
    values.push(price);
    paramIndex++;
  }
  if (image_url !== undefined) {
    updates.push(`image_url = $${paramIndex}`);
    values.push(image_url);
    paramIndex++;
  }
  if (description !== undefined) {
    updates.push(`description = $${paramIndex}`);
    values.push(description);
    paramIndex++;
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  values.push(id);
  const query = `UPDATE products SET ${updates.join(', ')} WHERE id = $${paramIndex}`;

  try {
    await pool.query(query, values);
    res.json({ success: true, message: 'Product updated successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update product', details: err.message });
  }
});

// Get today's scan history
router.get('/history/today', async (req, res) => {
  try {
    // Get all scans from today with product information
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Format date for PostgreSQL
    const todayStr = today.toISOString();
    
    // Get user_id from query parameter (optional)
    const userId = req.query.user_id ? parseInt(req.query.user_id) : null;
    
    // Build query with optional user filter
    let query = `
      SELECT 
        sh.id as scan_id,
        sh.scanned_at,
        sh.latitude,
        sh.longitude,
        sh.user_id,
        p.id as product_id,
        p.barcode,
        p.name,
        p.image_url,
        p.prices
      FROM scan_history sh
      INNER JOIN products p ON sh.product_id = p.id
      WHERE sh.scanned_at >= $1::timestamp
    `;
    
    const params = [todayStr];
    
    // Add user filter if provided
    if (userId) {
      query += ` AND sh.user_id = $${params.length + 1}`;
      params.push(userId);
    }
    
    query += ` ORDER BY sh.scanned_at DESC`;
    
    const result = await pool.query(query, params);
    
    // Process scans and fetch missing images from APIs
    const scans = await Promise.all(result.rows.map(async (row) => {
      // Safely parse latitude and longitude
      // PostgreSQL NUMERIC values might come as strings or numbers
      let latitude = null;
      let longitude = null;
      
      if (row.latitude != null && row.latitude !== '') {
        try {
          const latStr = String(row.latitude).trim();
          const latVal = parseFloat(latStr);
          if (!isNaN(latVal) && isFinite(latVal)) {
            latitude = latVal;
          }
        } catch (e) {
          console.error('Error parsing latitude:', e, row.latitude);
        }
      }
      
      if (row.longitude != null && row.longitude !== '') {
        try {
          const lngStr = String(row.longitude).trim();
          const lngVal = parseFloat(lngStr);
          if (!isNaN(lngVal) && isFinite(lngVal)) {
            longitude = lngVal;
          }
        } catch (e) {
          console.error('Error parsing longitude:', e, row.longitude);
        }
      }
      
      // Safely parse prices
      let prices = [];
      if (row.prices) {
        try {
          if (typeof row.prices === 'string') {
            prices = JSON.parse(row.prices);
          } else {
            prices = row.prices;
          }
          if (!Array.isArray(prices)) {
            prices = [];
          }
        } catch (e) {
          console.error('Error parsing prices:', e);
          prices = [];
        }
      }
      
      // Format scanned_at date - ensure it's a valid ISO string
      let scannedAt = null;
      if (row.scanned_at) {
        try {
          if (row.scanned_at instanceof Date) {
            scannedAt = row.scanned_at.toISOString();
          } else if (typeof row.scanned_at === 'string') {
            // Validate it's a valid date string
            const date = new Date(row.scanned_at);
            if (!isNaN(date.getTime())) {
              scannedAt = date.toISOString();
            }
          } else {
            // Try to convert to date
            const date = new Date(row.scanned_at);
            if (!isNaN(date.getTime())) {
              scannedAt = date.toISOString();
            }
          }
        } catch (e) {
          console.error('Error formatting scanned_at:', e, row.scanned_at);
        }
      }
      
      // If product has no image, try to fetch it from APIs
      let imageUrl = row.image_url || null;
      if (!imageUrl && row.barcode) {
        try {
          console.log(`🖼️ Product ${row.barcode} has no image, fetching from APIs...`);
          const productInfo = await lookupBarcode(row.barcode);
          if (productInfo && productInfo.image) {
            imageUrl = productInfo.image;
            // Save the image to database for future use
            try {
              await pool.query(
                'UPDATE products SET image_url = $1 WHERE id = $2',
                [imageUrl, row.product_id]
              );
              console.log(`✅ Saved image for product ${row.barcode}`);
            } catch (updateErr) {
              console.error('⚠️ Error saving image to database:', updateErr);
            }
          }
        } catch (lookupErr) {
          console.error(`⚠️ Error fetching image for ${row.barcode}:`, lookupErr.message);
        }
      }
      
      return {
        scanId: row.scan_id,
        scannedAt: scannedAt,
        latitude: latitude,
        longitude: longitude,
        userId: row.user_id || null,
        product: {
          id: row.product_id,
          barcode: row.barcode || '',
          name: row.name || '',
          image: imageUrl,
          prices: prices
        }
      };
    }));
    
    // Ensure all values are JSON-serializable
    const response = {
      success: true,
      scans: scans,
      count: scans.length
    };
    
    res.json(response);
  } catch (err) {
    console.error('Error fetching today\'s scan history:', err);
    return res.status(500).json({ 
      success: false,
      error: 'Database error', 
      details: err.message 
    });
  }
});

// Scan product from image endpoint
router.post('/scan-image', async (req, res) => {
  try {
    console.log('📥 ========== SCAN-IMAGE REQUEST RECEIVED ==========');
    console.log('📥 Request body keys:', Object.keys(req.body));
    console.log('📥 Has image_uri:', !!req.body.image_uri);
    console.log('📥 Has image:', !!req.body.image);
    console.log('📥 Image length (if present):', req.body.image ? req.body.image.length : 0);
    console.log('📥 Latitude:', req.body.latitude);
    console.log('📥 Longitude:', req.body.longitude);
    console.log('📥 User ID:', req.body.user_id);
    
    const { image_uri, image, latitude, longitude, user_id } = req.body;

    if (!image_uri && !image) {
      console.error('❌ Image URI or image data is required');
      return res.status(400).json({ 
        success: false,
        error: 'Image is required',
        received: {
          has_image_uri: !!image_uri,
          has_image: !!image,
          body_keys: Object.keys(req.body)
        }
      });
    }

    // Download image if URI provided, otherwise use base64
    let imageData = image;
    if (image_uri) {
      try {
        console.log('📥 Downloading image from URI:', image_uri);
        const imageResponse = await axios.get(image_uri, {
          responseType: 'arraybuffer',
          timeout: 10000
        });
        const base64 = Buffer.from(imageResponse.data, 'binary').toString('base64');
        imageData = `data:image/jpeg;base64,${base64}`;
        console.log('✅ Image downloaded and converted to base64');
      } catch (downloadError) {
        console.error('❌ Error downloading image:', downloadError);
        return res.status(400).json({ error: 'Could not download image from URI' });
      }
    }

    // Use OpenAI Vision to identify the product
    let productName = null;
    try {
      console.log('🤖 Using OpenAI Vision to identify product...');
      console.log('🤖 Image data length:', imageData ? imageData.length : 0);
      console.log('🤖 Image data preview:', imageData ? imageData.substring(0, 100) : 'null');
      
      if (!process.env.OPENAI_API_KEY) {
        console.error('❌ OPENAI_API_KEY not configured');
        throw new Error('OPENAI_API_KEY not configured');
      }
      
      console.log('🤖 OpenAI API Key exists:', !!process.env.OPENAI_API_KEY);
      console.log('🤖 Calling OpenAI API...');

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'What product is shown in this image? Respond with ONLY the product name and brand if visible (e.g., "Samsung Microwave" or "Nike Running Shoes"). Do not include any other text or explanation.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageData // base64 image
                }
              }
            ]
          }
        ],
        max_tokens: 50
      });

      productName = completion.choices[0].message.content.trim();
      console.log('✅ Product identified by OpenAI:', productName);
    } catch (openaiError) {
      console.error('❌ OpenAI Vision error:', openaiError);
      console.error('❌ OpenAI error message:', openaiError.message);
      console.error('❌ OpenAI error stack:', openaiError.stack);
      return res.status(500).json({
        success: false,
        error: 'Could not identify product. Please ensure OPENAI_API_KEY is configured.',
        details: openaiError.message
      });
    }

    if (!productName || productName.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Could not identify product in image. Please try with a clearer photo.'
      });
    }

    // Search for product information using the identified name
    console.log('🔍 Searching for product:', productName);
    const productInfo = await lookupProductByName(productName);

    if (!productInfo || !productInfo.name) {
      return res.status(404).json({
        success: false,
        error: 'PRODUCT_NOT_FOUND',
        message: 'Product identified but no information found in databases.'
      });
    }

    // Save to database (similar to scan endpoint)
    try {
      const existingResult = await pool.query('SELECT * FROM products WHERE barcode = $1', [productName]);
      let product = existingResult.rows[0];

      if (!product) {
        // Insert new product
        const insertResult = await pool.query(
          `INSERT INTO products (barcode, name, price, image_url, platform_suggestions, prices) 
           VALUES ($1, $2, $3, $4, $5, $6) 
           RETURNING *`,
          [
            productName,
            productInfo.name,
            productInfo.price || null,
            productInfo.image || null,
            JSON.stringify(productInfo.suggestions || []),
            JSON.stringify(productInfo.prices || [])
          ]
        );
        product = insertResult.rows[0];
      }

      // Save scan history
      if (user_id) {
        await pool.query(
          `INSERT INTO scan_history (user_id, product_id, scanned_at, latitude, longitude)
           VALUES ($1, $2, NOW(), $3, $4)`,
          [user_id, product.id, latitude, longitude]
        );
      }

      res.json({
        success: true,
        product: {
          id: product.id,
          barcode: product.barcode,
          name: product.name,
          price: product.price,
          image: product.image_url,
          description: product.description,
          prices: productInfo.prices || [],
          suggestions: productInfo.suggestions || []
        }
      });
    } catch (dbError) {
      console.error('Database error:', dbError);
      // Return product info even if DB save fails
      res.json({
        success: true,
        product: {
          barcode: productName,
          name: productInfo.name,
          price: productInfo.price,
          image: productInfo.image,
          prices: productInfo.prices || [],
          suggestions: productInfo.suggestions || []
        }
      });
    }
  } catch (error) {
    console.error('Scan image error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

module.exports = router;
