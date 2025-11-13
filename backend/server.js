const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import database (this will initialize the connection)
const { pool } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path}`, req.body || '');
  next();
});

// Import routes
const productRoutes = require('./routes/products');
const platformRoutes = require('./routes/platforms');
const aiRoutes = require('./routes/ai');
const authRoutes = require('./routes/auth');
// Choose maps implementation: maps.js (Google - paid) or maps-osm.js (OpenStreetMap - free)
const mapsRoutes = require('./routes/maps-osm'); // Using OpenStreetMap (FREE) instead of Google Maps

app.use('/api/products', productRoutes);
app.use('/api/platforms', platformRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/maps', mapsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'JunkTrunk API is running' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 JunkTrunk backend server running on port ${PORT}`);
  console.log(`📱 API available at http://localhost:${PORT}/api`);
  console.log(`📱 API available on local network at http://[your-ip]:${PORT}/api`);
});

// No need to export pool, routes will import it from db.js

