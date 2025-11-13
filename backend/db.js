const { Pool } = require('pg');
require('dotenv').config();

// Validate required environment variables
if (process.env.DB_PASSWORD === undefined) {
  console.error('❌ ERROR: DB_PASSWORD is not set in .env file');
  console.error('❌ Please create a .env file from env.example and set your PostgreSQL password');
  console.error('❌ If PostgreSQL requires no password, set DB_PASSWORD= (empty value) in your .env file');
  process.exit(1);
}

// Initialize PostgreSQL database connection pool
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'juntrunk',
  user: process.env.DB_USER || 'postgres',
  password: String(process.env.DB_PASSWORD || ''), // Ensure it's always a string
};

console.log(`🔌 Connecting to PostgreSQL database: ${dbConfig.database}@${dbConfig.host}:${dbConfig.port}`);

const pool = new Pool(dbConfig);

// Test database connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

// Initialize database tables
async function initializeDatabase() {
  try {
    // Create products table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        barcode VARCHAR(255) UNIQUE,
        name TEXT,
        price NUMERIC(10, 2),
        image_url TEXT,
        description TEXT,
        platform_suggestions TEXT,
        amazon_price VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add prices column if it doesn't exist (for existing databases)
    try {
      await pool.query(`
        ALTER TABLE products 
        ADD COLUMN IF NOT EXISTS prices JSONB DEFAULT '[]'::jsonb
      `);
    } catch (err) {
      // Column might already exist, ignore error
      console.log('Note: prices column may already exist');
    }

    // Create scan_history table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scan_history (
        id SERIAL PRIMARY KEY,
        product_id INTEGER,
        scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        latitude NUMERIC(10, 8),
        longitude NUMERIC(11, 8),
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      )
    `);

    // Add latitude and longitude columns if they don't exist (for existing databases)
    try {
      await pool.query(`
        ALTER TABLE scan_history 
        ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 8),
        ADD COLUMN IF NOT EXISTS longitude NUMERIC(11, 8)
      `);
    } catch (err) {
      // Columns might already exist, ignore error
      console.log('Note: Location columns may already exist');
    }

    // Create users table if it doesn't exist
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(255) UNIQUE NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          name VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Add username column if it doesn't exist (for existing databases)
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'username'
          ) THEN
            ALTER TABLE users ADD COLUMN username VARCHAR(255) UNIQUE;
          END IF;
        END $$;
      `);
      
      // Add password column if it doesn't exist (for existing databases)
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'password'
          ) THEN
            ALTER TABLE users ADD COLUMN password VARCHAR(255);
          END IF;
        END $$;
      `);
    } catch (err) {
      console.log('Note: Users table may already exist:', err.message);
    }

    // Add user_id column to scan_history if it doesn't exist
    try {
      await pool.query(`
        ALTER TABLE scan_history 
        ADD COLUMN IF NOT EXISTS user_id INTEGER
      `);
      
      // Add foreign key constraint if it doesn't exist
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'scan_history_user_id_fkey'
          ) THEN
            ALTER TABLE scan_history 
            ADD CONSTRAINT scan_history_user_id_fkey 
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
          END IF;
        END $$;
      `);
    } catch (err) {
      console.log('Note: user_id column or constraint may already exist:', err.message);
    }

    // Create indexes for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_scan_history_product_id ON scan_history(product_id)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_scan_history_scanned_at ON scan_history(scanned_at)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_scan_history_user_id ON scan_history(user_id)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_scan_history_user_scanned_at ON scan_history(user_id, scanned_at DESC)
    `);

    console.log('✅ Database tables initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    throw error;
  }
}

// Initialize database on module load
initializeDatabase().catch((err) => {
  console.error('❌ Failed to initialize database:', err.message);
  if (err.code === '3D000') {
    console.error(`\n💡 TIP: Make sure the database "${dbConfig.database}" exists.`);
    console.error(`💡 Create it with: CREATE DATABASE ${dbConfig.database};`);
  }
  process.exit(1);
});

module.exports = { pool, initializeDatabase };

