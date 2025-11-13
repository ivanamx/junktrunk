-- Migration script to add prices column and migrate data
-- Run these commands in PostgreSQL:

-- 1. Add prices column (JSONB to store array of prices)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS prices JSONB DEFAULT '[]'::jsonb;

-- 2. Migrate existing amazon_price to prices array (if amazon_price exists and is not null)
UPDATE products 
SET prices = jsonb_build_array(
  jsonb_build_object(
    'source', 'Amazon',
    'price', amazon_price,
    'url', 'https://www.amazon.com'
  )
)
WHERE amazon_price IS NOT NULL 
  AND amazon_price != ''
  AND (prices IS NULL OR prices = '[]'::jsonb);

-- 3. Verify the migration
SELECT id, barcode, amazon_price, prices FROM products LIMIT 5;

