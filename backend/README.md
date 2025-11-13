# JunkTrunk Backend API

Backend server for JunkTrunk mobile app.

## Features

- Product scanning and storage
- Barcode lookup integration
- Platform suggestions (eBay, Craigslist, Facebook Marketplace, etc.)
- AI-powered product description generation

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file from `.env.example`:
```bash
cp .env.example .env
```

3. Add your OpenAI API key to `.env` (optional, for AI descriptions):
```
OPENAI_API_KEY=your-actual-api-key-here
```

4. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## API Endpoints

### Products
- `POST /api/products/scan` - Scan a product (barcode lookup and save)
- `GET /api/products/:id` - Get product by ID
- `PUT /api/products/:id` - Update product

### Platforms
- `GET /api/platforms/list` - Get list of available platforms
- `POST /api/platforms/post` - Get posting URL for a platform

### AI
- `POST /api/ai/generate-description` - Generate product description using AI

## Database

Uses SQLite database (`database.sqlite`) with two tables:
- `products` - Stores scanned products
- `scan_history` - Tracks scan history

## Barcode Lookup

Uses free APIs:
- UPCItemDB (primary)
- OpenFoodFacts (fallback)

## Notes

- The server runs on port 3000 by default
- CORS is enabled for mobile app access
- AI descriptions require OpenAI API key (falls back to mock if not configured)

