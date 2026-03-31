-- ============================================================================
-- DATABASE SCHEMA SETUP - PART 2: ANALYTICAL VIEWS
-- Stock Market Analytics Platform - Database: Stock_Data
-- ============================================================================

-- ----------------------------------------------------------------------------
-- View: v_equity_stocks_latest
-- Latest trading data for active equity stocks
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_equity_stocks_latest AS
SELECT 
    s.symbol,
    s.company_name,
    s.sector,
    ser.name,
    d.trading_date,
    d.open_price,
    d.high_price,
    d.low_price,
    d.close_price,
    d.prev_close,
    d.close_price - d.prev_close AS price_change,
    ROUND(((d.close_price - d.prev_close) / NULLIF(d.prev_close, 0) * 100), 2) AS change_pct,
    d.total_traded_qty,
    d.turnover_lacs,
    d.delivery_qty,
    d.delivery_percent,
    d.no_of_trades
FROM daily_stock_data d
INNER JOIN security s ON d.symbol = s.symbol
INNER JOIN series ser ON d.code = ser.code
WHERE ser.code = 'EQ'
  AND d.trading_date = (SELECT MAX(trading_date) FROM daily_stock_data)
ORDER BY d.turnover_lacs DESC;

-- ----------------------------------------------------------------------------
-- View: v_weekly_performance
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_weekly_performance AS
SELECT 
    w.symbol,
    s.company_name,
    s.sector,
    w.year,
    w.week_number,
    w.open_price,
    w.high_price,
    w.low_price,
    w.close_price,
    w.prev_week_close,
    w.week_over_week_change,
    w.week_over_week_change_pct,
    w.total_turnover_lacs,
    w.total_delivery_qty,
    w.avg_delivery_percent
FROM weekly_analysis_data w
INNER JOIN security s ON w.symbol = s.symbol
ORDER BY w.year DESC, w.week_number DESC, w.week_over_week_change_pct DESC;

-- ----------------------------------------------------------------------------
-- View: v_monthly_performance
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_monthly_performance AS
SELECT 
    m.symbol,
    s.company_name,
    s.sector,
    m.year,
    m.month,
    m.month_name,
    m.open_price,
    m.high_price,
    m.low_price,
    m.close_price,
    m.prev_month_close,
    m.month_over_month_change,
    m.month_over_month_change_pct,
    m.total_turnover_lacs,
    m.volatility
FROM monthly_analysis_data m
INNER JOIN security s ON m.symbol = s.symbol
ORDER BY m.year DESC, m.month DESC, m.month_over_month_change_pct DESC;

-- ----------------------------------------------------------------------------
-- View: v_returns_performance
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_returns_performance AS
SELECT
    r.symbol,
    s.company_name,
    s.sector,
    r.calculation_date,
    r.current_price,
    r.return_3m,
    r.return_6m,
    r.return_9m,
    r.return_1y,
    r.volatility_30d,
    r.volatility_90d,
    r.volatility_1y
FROM returns_analysis r
INNER JOIN security s ON r.symbol = s.symbol
WHERE r.calculation_date = (SELECT MAX(calculation_date) FROM returns_analysis)
ORDER BY r.return_1y DESC;
