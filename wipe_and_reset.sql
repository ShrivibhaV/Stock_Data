-- ============================================================================
-- WIPE ALL STOCK DATA (keeps schema, security & series reference data intact)
-- Run this ONCE in pgAdmin before re-fetching from Python script.
-- ============================================================================

-- Truncate in dependency order (child tables first)
TRUNCATE TABLE returns_analysis       RESTART IDENTITY CASCADE;
TRUNCATE TABLE weekly_analysis_data   RESTART IDENTITY CASCADE;
TRUNCATE TABLE monthly_analysis_data  RESTART IDENTITY CASCADE;
TRUNCATE TABLE daily_stock_data       RESTART IDENTITY CASCADE;

-- Verify everything is empty
SELECT 'daily_stock_data'    AS tbl, COUNT(*) AS rows FROM daily_stock_data
UNION ALL
SELECT 'weekly_analysis_data',        COUNT(*) FROM weekly_analysis_data
UNION ALL
SELECT 'monthly_analysis_data',       COUNT(*) FROM monthly_analysis_data
UNION ALL
SELECT 'returns_analysis',            COUNT(*) FROM returns_analysis;
