# JunkTrunk

A React Native app for thrift shop enthusiasts to scan products, create AI-optimized descriptions, and find the best thrift shop routes.

## Features

- **Product Scanning**: Scan barcodes to automatically lookup product information
- **AI Description Generation**: Generate optimized product descriptions using OpenAI
- **Platform Integration**: Post to multiple platforms (eBay, Craigslist, Facebook Marketplace, etc.)
- **Product Database**: Store scanned products with full history
- **Thrift Shop Finder**: Interactive map to find nearby thrift shops
- **Route Creation**: Create optimized routes to visit multiple thrift shops

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- OpenAI API key (optional, for AI descriptions)

### Installation

#### Frontend (Mobile App)

1. Install dependencies:
```bash
npm install
```

2. Configure API endpoint in `services/api.js`:
   - For iOS Simulator/Android Emulator: `http://localhost:3000/api`
   - For physical device: Replace `YOUR_SERVER_IP` with your computer's local IP address
   - Find your IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)

3. Start the development server:
```bash
npm start
```

4. Run on your device:
   - Scan the QR code with Expo Go app (iOS/Android)
   - Or press `i` for iOS simulator / `a` for Android emulator

#### Backend (API Server)

1. Navigate to backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file (copy from `env.example`):
```bash
cp env.example .env
```

4. Add your OpenAI API key to `.env` (optional):
```
OPENAI_API_KEY=your-actual-api-key-here
```

5. Start the backend server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

The backend will run on `http://localhost:3000`

## Project Structure

```
JunkTrunk/
├── backend/
│   ├── routes/
│   │   ├── products.js      # Product scanning and management
│   │   ├── platforms.js     # Platform selection and posting
│   │   └── ai.js            # AI description generation
│   ├── server.js            # Express server setup
│   ├── database.sqlite      # SQLite database (auto-created)
│   └── package.json
├── screens/
│   ├── HomeScreen.js       # Main screen with scanner
│   ├── MapScreen.js         # Map with thrift shop locations
│   ├── PlatformSelectionScreen.js  # Platform selection modal
│   └── DescriptionScreen.js # AI description generator
├── services/
│   └── api.js               # API service layer
├── App.js                    # Main app component
├── package.json
└── app.json
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

## Configuration

### Backend API URL

Update `services/api.js` with your backend server URL:
- Local development: `http://localhost:3000/api`
- Physical device: `http://YOUR_IP:3000/api` (replace YOUR_IP with your computer's local IP)

### OpenAI API Key

Get your API key from: https://platform.openai.com/api-keys

Add it to `backend/.env`:
```
OPENAI_API_KEY=sk-your-actual-key-here
```

## Features in Detail

### Barcode Scanning
- Uses device camera to scan barcodes
- Automatically looks up product information from multiple APIs
- Stores products in local SQLite database
- Tracks scan history

### AI Description Generation
- Generates SEO-optimized product descriptions
- Uses OpenAI GPT-4o-mini model
- Includes product name, price, and additional context
- Can regenerate descriptions with different parameters

### Platform Integration
- Supports 8+ platforms: eBay, Craigslist, Facebook Marketplace, Mercari, Poshmark, Depop, OfferUp, Etsy
- Platform-specific posting URLs
- Ready for API integration with each platform

## Notes

- Backend must be running for app to function
- Barcode lookup uses free APIs (UPCItemDB, OpenFoodFacts)
- AI descriptions require OpenAI API key (falls back to mock if not configured)
- Database is SQLite (no additional setup required)

