const express = require('express');
const router = express.Router();
const OpenAI = require('openai');

// Initialize OpenAI (will use environment variable)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'your-api-key-here'
});

// Generate product description using AI
router.post('/generate-description', async (req, res) => {
  try {
    const { productName, price, category, brand, additionalInfo } = req.body;

    if (!productName) {
      return res.status(400).json({ error: 'Product name is required' });
    }

    // Build context for AI
    let context = `Product: ${productName}`;
    if (price) context += `\nPrice: ${price}`;
    if (category) context += `\nCategory: ${category}`;
    if (brand) context += `\nBrand: ${brand}`;
    if (additionalInfo) context += `\nAdditional Info: ${additionalInfo}`;

    const prompt = `You are an expert copywriter specializing in online marketplace listings for thrift shop items. Create a compelling, SEO-optimized product description that will maximize sales potential.

Product Information:
${context}

Requirements:
- Write 2-3 short paragraphs (150-200 words total)
- Use persuasive, engaging language
- Highlight unique features, condition, and value
- Include relevant keywords for search optimization
- Mention any vintage, retro, or collectible aspects if applicable
- Create urgency and appeal to buyers
- Be honest about condition
- Use American English
- Format with line breaks for readability

Generate the description now:`;

    // Check if API key is set
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your-api-key-here') {
      // Return a mock description if API key is not configured
      const mockDescription = `Discover this amazing ${productName}!${brand ? ` From the renowned ${brand} brand,` : ''} this item${category ? ` in the ${category} category` : ''} is a fantastic find for any savvy shopper.

${price ? `Priced at just ${price}, ` : ''}This piece offers exceptional value and quality. Perfect for those who appreciate unique items and great deals. The condition is excellent, making it ready for immediate use or collection.

Don't miss out on this opportunity to own a quality item at an unbeatable price. Whether you're looking for a specific piece or just love a good bargain, this is the perfect addition to your collection. Act fast - items like this don't last long!`;

      return res.json({
        success: true,
        description: mockDescription,
        note: 'Using mock description. Set OPENAI_API_KEY in .env file for AI-generated descriptions.'
      });
    }

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert copywriter for online marketplace listings, specializing in thrift shop and vintage items.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 300,
      temperature: 0.8
    });

    const description = completion.choices[0].message.content.trim();

    res.json({
      success: true,
      description,
      model: 'gpt-4o-mini'
    });
  } catch (error) {
    console.error('AI description generation error:', error);
    
    // Return mock description on error
    const { productName, price, brand } = req.body;
    const mockDescription = `Discover this amazing ${productName}!${brand ? ` From the renowned ${brand} brand,` : ''} this item is a fantastic find for any savvy shopper.

${price ? `Priced at just ${price}, ` : ''}This piece offers exceptional value and quality. Perfect for those who appreciate unique items and great deals. The condition is excellent, making it ready for immediate use or collection.

Don't miss out on this opportunity to own a quality item at an unbeatable price. Whether you're looking for a specific piece or just love a good bargain, this is the perfect addition to your collection. Act fast - items like this don't last long!`;

    res.json({
      success: true,
      description: mockDescription,
      note: 'AI service unavailable, using fallback description',
      error: error.message
    });
  }
});

module.exports = router;

