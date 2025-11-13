// Simple script to create placeholder assets
// Run with: node scripts/generate-assets.js

const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'assets');

// Create a simple SVG icon (will be converted to PNG by Expo)
const iconSvg = `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="#1a1a1a"/>
  <text x="512" y="600" font-family="Arial, sans-serif" font-size="300" font-weight="bold" fill="#fff" text-anchor="middle">JT</text>
</svg>`;

// Create a simple SVG splash (will be converted to PNG by Expo)
const splashSvg = `<svg width="2048" height="2048" xmlns="http://www.w3.org/2000/svg">
  <rect width="2048" height="2048" fill="#1a1a1a"/>
  <text x="1024" y="1200" font-family="Arial, sans-serif" font-size="400" font-weight="bold" fill="#fff" text-anchor="middle">JunkTrunk</text>
</svg>`;

if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// Note: Expo requires PNG files, not SVG
// For now, we'll create a note file explaining what's needed
const readme = `# Assets Directory

This directory should contain the following image files:

- icon.png (1024x1024) - App icon
- splash.png (2048x2048) - Splash screen
- adaptive-icon.png (1024x1024) - Android adaptive icon
- favicon.png (48x48) - Web favicon

For development, you can:
1. Use online tools like https://www.appicon.co/ to generate these
2. Or create simple colored PNG files as placeholders
3. Or temporarily comment out the icon/splash in app.json

The app will work without these, but Expo will show warnings.
`;

fs.writeFileSync(path.join(assetsDir, 'README.md'), readme);
console.log('Assets directory created. Please add icon.png, splash.png, etc.');

