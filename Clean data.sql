-- ============================================================================
-- CLEAN ALL DATA (Keep Schema Intact)
-- ============================================================================

-- Delete data in reverse order of dependencies
TRUNCATE TABLE returns_analysis CASCADE;
TRUNCATE TABLE monthly_analysis_data CASCADE;
TRUNCATE TABLE weekly_analysis_data CASCADE;
TRUNCATE TABLE aggregation_queue CASCADE;
TRUNCATE TABLE daily_stock_data CASCADE;
TRUNCATE TABLE security CASCADE;

-- Keep series table (it has the 13 series codes we need)
-- TRUNCATE TABLE series CASCADE;

SELECT 'Data cleaned successfully!' AS status;

-- Verify counts
SELECT 'daily_stock_data' as table_name, count(*) as row_count FROM daily_stock_data
UNION ALL
SELECT 'security', count(*) FROM security
UNION ALL
SELECT 'weekly_analysis_data', count(*) FROM weekly_analysis_data
UNION ALL
SELECT 'monthly_analysis_data', count(*) FROM monthly_analysis_data
UNION ALL
SELECT 'returns_analysis', count(*) FROM returns_analysis
UNION ALL
SELECT 'aggregation_queue', count(*) FROM aggregation_queue
UNION ALL
SELECT 'series', count(*) FROM series;
