-- ============================================================================
-- MIGRATION: Slim Schema + 3-Year Data Retention
-- Run this ONCE against Stock_Data database.
-- PostgreSQL 15+
-- ============================================================================

-- ============================================================================
-- STEP 1: Delete data older than 3 years from all tables
-- ============================================================================

-- Clear returns_analysis fully (will be recalculated after schema change)
TRUNCATE TABLE returns_analysis;

-- Delete old daily data (keep last 3 years)
DELETE FROM daily_stock_data
WHERE trading_date < CURRENT_DATE - INTERVAL '3 years';

-- Delete old weekly aggregates
DELETE FROM weekly_analysis_data
WHERE MAKE_DATE(year, 1, 1) + (week_number - 1) * INTERVAL '1 week'
      < CURRENT_DATE - INTERVAL '3 years';

-- Delete old monthly aggregates
DELETE FROM monthly_analysis_data
WHERE MAKE_DATE(year, month, 1) < CURRENT_DATE - INTERVAL '3 years';

-- NOTE: Step 1 done: Old data deleted (keeping last 3 years)

-- ============================================================================
-- STEP 2: ALTER daily_stock_data — drop updated_at, data_source, file_name
-- ============================================================================

ALTER TABLE daily_stock_data
    DROP COLUMN IF EXISTS updated_at,
    DROP COLUMN IF EXISTS data_source,
    DROP COLUMN IF EXISTS file_name;

-- NOTE: Step 2 done: Dropped updated_at, data_source, file_name from daily_stock_data

-- ============================================================================
-- STEP 3: ALTER returns_analysis — keep only 3m/6m/9m/1y + volatility
-- Drop: return_1d, 1w, 1m, 2y, 3y, 5y, ytd, all log_returns,
--       sharpe_ratio_1y, max_drawdown_1y, price_*_ago, updated_at
-- Add:  return_9m (new)
-- ============================================================================

-- Drop dependent view first (will be recreated below with slim columns)
DROP VIEW IF EXISTS v_returns_performance;

ALTER TABLE returns_analysis
    DROP COLUMN IF EXISTS return_1d,
    DROP COLUMN IF EXISTS return_1w,
    DROP COLUMN IF EXISTS return_1m,
    DROP COLUMN IF EXISTS return_2y,
    DROP COLUMN IF EXISTS return_3y,
    DROP COLUMN IF EXISTS return_5y,
    DROP COLUMN IF EXISTS return_ytd,
    DROP COLUMN IF EXISTS log_return_1d,
    DROP COLUMN IF EXISTS log_return_1w,
    DROP COLUMN IF EXISTS log_return_1m,
    DROP COLUMN IF EXISTS log_return_3m,
    DROP COLUMN IF EXISTS log_return_1y,
    DROP COLUMN IF EXISTS sharpe_ratio_1y,
    DROP COLUMN IF EXISTS max_drawdown_1y,
    DROP COLUMN IF EXISTS price_1d_ago,
    DROP COLUMN IF EXISTS price_1w_ago,
    DROP COLUMN IF EXISTS price_1m_ago,
    DROP COLUMN IF EXISTS price_1y_ago,
    DROP COLUMN IF EXISTS updated_at;

-- Add return_9m (190 trading days ≈ 9 months)
ALTER TABLE returns_analysis
    ADD COLUMN IF NOT EXISTS return_9m DECIMAL(10,4);

-- NOTE: Step 3 done: returns_analysis slimmed, return_9m added

-- Recreate v_returns_performance with the new slim column set
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

-- NOTE: v_returns_performance recreated with slim columns

-- ============================================================================
-- STEP 4: Also remove updated_at from weekly and monthly aggregate tables
--         (to stay consistent — they were only set internally anyway)
-- ============================================================================

ALTER TABLE weekly_analysis_data
    DROP COLUMN IF EXISTS updated_at;

ALTER TABLE monthly_analysis_data
    DROP COLUMN IF EXISTS updated_at;

-- NOTE: Step 4 done: updated_at removed from aggregate tables


-- ============================================================================
-- STEP 5: UPDATE sp_import_daily_data — remove updated_at from ON CONFLICT SET
-- ============================================================================

CREATE OR REPLACE PROCEDURE sp_import_daily_data(
    p_symbol       VARCHAR(20),
    p_code         VARCHAR(5),
    p_trading_date DATE,
    p_prev_close   DECIMAL(12,2),
    p_open         DECIMAL(12,2),
    p_high         DECIMAL(12,2),
    p_low          DECIMAL(12,2),
    p_last         DECIMAL(12,2),
    p_close        DECIMAL(12,2),
    p_traded_qty   BIGINT,
    p_turnover     DECIMAL(18,2),
    p_trades       INTEGER,
    p_delivery_qty BIGINT,
    p_delivery_pct DECIMAL(5,2)
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_symbol_exists BOOLEAN;
    v_code_exists   BOOLEAN;
BEGIN
    SELECT EXISTS(SELECT 1 FROM security WHERE symbol = p_symbol) INTO v_symbol_exists;

    IF NOT v_symbol_exists THEN
        SELECT EXISTS(SELECT 1 FROM series WHERE code = p_code) INTO v_code_exists;
        IF NOT v_code_exists THEN
            RAISE EXCEPTION 'Invalid series code: %', p_code;
        END IF;
        INSERT INTO security (symbol, code) VALUES (p_symbol, p_code);
        RAISE NOTICE 'New security created: %', p_symbol;
    END IF;

    INSERT INTO daily_stock_data (
        symbol, trading_date, code, prev_close,
        open_price, high_price, low_price, last_price, close_price,
        total_traded_qty, turnover_lacs, no_of_trades,
        delivery_qty, delivery_percent
    ) VALUES (
        p_symbol, p_trading_date, p_code, p_prev_close,
        p_open, p_high, p_low, p_last, p_close,
        p_traded_qty, p_turnover, p_trades,
        p_delivery_qty, p_delivery_pct
    )
    ON CONFLICT (symbol, trading_date) DO UPDATE SET
        code             = EXCLUDED.code,
        prev_close       = EXCLUDED.prev_close,
        open_price       = EXCLUDED.open_price,
        high_price       = EXCLUDED.high_price,
        low_price        = EXCLUDED.low_price,
        last_price       = EXCLUDED.last_price,
        close_price      = EXCLUDED.close_price,
        total_traded_qty = EXCLUDED.total_traded_qty,
        turnover_lacs    = EXCLUDED.turnover_lacs,
        no_of_trades     = EXCLUDED.no_of_trades,
        delivery_qty     = EXCLUDED.delivery_qty,
        delivery_percent = EXCLUDED.delivery_percent;

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error importing data for % on %: %',
            p_symbol, p_trading_date, SQLERRM;
END;
$$;


-- ============================================================================
-- STEP 6: UPDATE sp_calculate_weekly_aggregates — remove updated_at
-- ============================================================================

CREATE OR REPLACE PROCEDURE sp_calculate_weekly_aggregates(
    p_start_date DATE,
    p_end_date DATE
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_rows_affected INTEGER;
BEGIN
    INSERT INTO weekly_analysis_data (
        symbol, code, year, week_number,
        open_price, high_price, low_price, close_price,
        total_traded_qty, total_turnover_lacs, no_of_trading_days,
        total_trades, total_delivery_qty, avg_delivery_percent
    )
    SELECT
        symbol,
        MAX(code) AS code,
        EXTRACT(YEAR FROM trading_date)::INTEGER   AS year,
        EXTRACT(WEEK FROM trading_date)::INTEGER   AS week_number,
        (ARRAY_AGG(open_price  ORDER BY trading_date ASC))[1]  AS open_price,
        MAX(high_price)                                         AS high_price,
        MIN(low_price)                                          AS low_price,
        (ARRAY_AGG(close_price ORDER BY trading_date DESC))[1] AS close_price,
        SUM(total_traded_qty)   AS total_traded_qty,
        SUM(turnover_lacs)      AS total_turnover_lacs,
        COUNT(*)                AS no_of_trading_days,
        SUM(no_of_trades)       AS total_trades,
        SUM(delivery_qty)       AS total_delivery_qty,
        CASE
            WHEN SUM(total_traded_qty) > 0
            THEN ROUND((SUM(delivery_qty)::DECIMAL / SUM(total_traded_qty) * 100), 2)
            ELSE NULL
        END AS avg_delivery_percent
    FROM daily_stock_data
    WHERE trading_date BETWEEN p_start_date AND p_end_date
    GROUP BY symbol,
             EXTRACT(YEAR FROM trading_date),
             EXTRACT(WEEK FROM trading_date)
    ON CONFLICT (symbol, year, week_number) DO UPDATE SET
        open_price           = EXCLUDED.open_price,
        high_price           = EXCLUDED.high_price,
        low_price            = EXCLUDED.low_price,
        close_price          = EXCLUDED.close_price,
        total_traded_qty     = EXCLUDED.total_traded_qty,
        total_turnover_lacs  = EXCLUDED.total_turnover_lacs,
        no_of_trading_days   = EXCLUDED.no_of_trading_days,
        total_trades         = EXCLUDED.total_trades,
        total_delivery_qty   = EXCLUDED.total_delivery_qty,
        avg_delivery_percent = EXCLUDED.avg_delivery_percent;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    RAISE NOTICE 'Weekly aggregates computed: % rows affected', v_rows_affected;

    UPDATE weekly_analysis_data w1
    SET
        prev_week_close           = w2.close_price,
        week_over_week_change     = w1.close_price - w2.close_price,
        week_over_week_change_pct = ROUND(
            ((w1.close_price - w2.close_price) / NULLIF(w2.close_price, 0) * 100), 2)
    FROM weekly_analysis_data w2
    WHERE w1.symbol = w2.symbol
      AND (
            (w1.year = w2.year AND w1.week_number = w2.week_number + 1)
            OR
            (w1.week_number = 1 AND w2.week_number >= 52 AND w1.year = w2.year + 1)
          )
      AND (DATE_TRUNC('year', MAKE_DATE(w1.year, 1, 1)) +
           (w1.week_number - 1) * INTERVAL '1 week')::DATE
           BETWEEN p_start_date AND p_end_date;
END;
$$;


-- ============================================================================
-- STEP 7: UPDATE sp_calculate_monthly_aggregates — remove updated_at
-- ============================================================================

CREATE OR REPLACE PROCEDURE sp_calculate_monthly_aggregates(
    p_start_date DATE,
    p_end_date DATE
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_rows_affected INTEGER;
BEGIN
    INSERT INTO monthly_analysis_data (
        symbol, code, year, month, month_name,
        month_start_date, month_end_date,
        open_price, high_price, low_price, close_price,
        total_traded_qty, total_turnover_lacs, avg_daily_turnover,
        no_of_trading_days, total_trades, total_delivery_qty,
        avg_delivery_percent, volatility
    )
    WITH daily_returns AS (
        SELECT
            symbol, trading_date, code,
            open_price, high_price, low_price, close_price,
            total_traded_qty, turnover_lacs, no_of_trades,
            delivery_qty, delivery_percent,
            (close_price
                - LAG(close_price) OVER (PARTITION BY symbol ORDER BY trading_date))
            / NULLIF(
                LAG(close_price) OVER (PARTITION BY symbol ORDER BY trading_date),
                0) * 100 AS daily_return_pct
        FROM daily_stock_data
        WHERE trading_date BETWEEN p_start_date AND p_end_date
    )
    SELECT
        symbol,
        MAX(code)                                                           AS code,
        EXTRACT(YEAR  FROM trading_date)::INTEGER                           AS year,
        EXTRACT(MONTH FROM trading_date)::INTEGER                           AS month,
        TO_CHAR(DATE_TRUNC('month', MIN(trading_date)), 'Month')            AS month_name,
        DATE_TRUNC('month', MIN(trading_date))::DATE                        AS month_start_date,
        (DATE_TRUNC('month', MIN(trading_date))
            + INTERVAL '1 month - 1 day')::DATE                            AS month_end_date,
        (ARRAY_AGG(open_price  ORDER BY trading_date ASC))[1]               AS open_price,
        MAX(high_price)                                                     AS high_price,
        MIN(low_price)                                                      AS low_price,
        (ARRAY_AGG(close_price ORDER BY trading_date DESC))[1]              AS close_price,
        SUM(total_traded_qty)                                               AS total_traded_qty,
        SUM(turnover_lacs)                                                  AS total_turnover_lacs,
        ROUND(AVG(turnover_lacs), 2)                                        AS avg_daily_turnover,
        COUNT(*)                                                            AS no_of_trading_days,
        SUM(no_of_trades)                                                   AS total_trades,
        SUM(delivery_qty)                                                   AS total_delivery_qty,
        CASE
            WHEN SUM(total_traded_qty) > 0
            THEN ROUND((SUM(delivery_qty)::DECIMAL / SUM(total_traded_qty) * 100), 2)
            ELSE NULL
        END                                                                 AS avg_delivery_percent,
        ROUND(STDDEV(daily_return_pct)::NUMERIC, 4)                         AS volatility
    FROM daily_returns
    GROUP BY symbol,
             EXTRACT(YEAR  FROM trading_date),
             EXTRACT(MONTH FROM trading_date)
    ON CONFLICT (symbol, year, month) DO UPDATE SET
        open_price           = EXCLUDED.open_price,
        high_price           = EXCLUDED.high_price,
        low_price            = EXCLUDED.low_price,
        close_price          = EXCLUDED.close_price,
        total_traded_qty     = EXCLUDED.total_traded_qty,
        total_turnover_lacs  = EXCLUDED.total_turnover_lacs,
        avg_daily_turnover   = EXCLUDED.avg_daily_turnover,
        no_of_trading_days   = EXCLUDED.no_of_trading_days,
        total_trades         = EXCLUDED.total_trades,
        total_delivery_qty   = EXCLUDED.total_delivery_qty,
        avg_delivery_percent = EXCLUDED.avg_delivery_percent,
        volatility           = EXCLUDED.volatility;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    RAISE NOTICE 'Monthly aggregates computed: % rows affected', v_rows_affected;

    -- Part A: consecutive months within same year
    UPDATE monthly_analysis_data m1
    SET
        prev_month_close            = m2.close_price,
        month_over_month_change     = m1.close_price - m2.close_price,
        month_over_month_change_pct = ROUND(
            ((m1.close_price - m2.close_price) / NULLIF(m2.close_price, 0) * 100), 2)
    FROM monthly_analysis_data m2
    WHERE m1.symbol = m2.symbol
      AND m1.year   = m2.year
      AND m1.month  = m2.month + 1
      AND m1.month_start_date BETWEEN p_start_date AND p_end_date;

    -- Part B: year boundary (Jan → Dec of prior year)
    UPDATE monthly_analysis_data m1
    SET
        prev_month_close            = m2.close_price,
        month_over_month_change     = m1.close_price - m2.close_price,
        month_over_month_change_pct = ROUND(
            ((m1.close_price - m2.close_price) / NULLIF(m2.close_price, 0) * 100), 2)
    FROM monthly_analysis_data m2
    WHERE m1.symbol = m2.symbol
      AND m1.month  = 1
      AND m2.month  = 12
      AND m1.year   = m2.year + 1
      AND m1.month_start_date BETWEEN p_start_date AND p_end_date;
END;
$$;


-- ============================================================================
-- STEP 8: UPDATE sp_calculate_returns (single-date) — slim returns columns
-- ============================================================================

CREATE OR REPLACE PROCEDURE sp_calculate_returns(
    p_calculation_date DATE DEFAULT CURRENT_DATE
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_rows_affected INTEGER;
BEGIN
    INSERT INTO returns_analysis (
        symbol, calculation_date, current_price,
        return_3m, return_6m, return_9m, return_1y,
        volatility_30d, volatility_90d, volatility_1y
    )
    WITH price_history AS (
        SELECT
            symbol,
            trading_date,
            close_price,
            LAG(close_price,  63) OVER w AS price_3m,
            LAG(close_price, 126) OVER w AS price_6m,
            LAG(close_price, 190) OVER w AS price_9m,
            LAG(close_price, 252) OVER w AS price_1y,
            LN(close_price / NULLIF(LAG(close_price, 1) OVER w, 0)) AS daily_log_ret
        FROM daily_stock_data
        WHERE trading_date <= p_calculation_date
          AND trading_date >= p_calculation_date - INTERVAL '1 year 3 months'
        WINDOW w AS (PARTITION BY symbol ORDER BY trading_date)
    ),
    price_points AS (
        SELECT * FROM price_history WHERE trading_date = p_calculation_date
    ),
    volatility_calc AS (
        SELECT
            symbol,
            STDDEV(CASE WHEN trading_date >= p_calculation_date - INTERVAL '30 days'
                        THEN daily_log_ret END) * SQRT(252) * 100 AS vol_30d,
            STDDEV(CASE WHEN trading_date >= p_calculation_date - INTERVAL '90 days'
                        THEN daily_log_ret END) * SQRT(252) * 100 AS vol_90d,
            STDDEV(daily_log_ret)              * SQRT(252) * 100 AS vol_1y
        FROM price_history
        WHERE trading_date >= p_calculation_date - INTERVAL '1 year'
          AND trading_date <= p_calculation_date
          AND daily_log_ret IS NOT NULL
        GROUP BY symbol
    )
    SELECT
        pp.symbol,
        p_calculation_date                                                                   AS calculation_date,
        pp.close_price                                                                       AS current_price,
        ROUND(((pp.close_price - pp.price_3m) / NULLIF(pp.price_3m, 0) * 100)::NUMERIC, 4) AS return_3m,
        ROUND(((pp.close_price - pp.price_6m) / NULLIF(pp.price_6m, 0) * 100)::NUMERIC, 4) AS return_6m,
        ROUND(((pp.close_price - pp.price_9m) / NULLIF(pp.price_9m, 0) * 100)::NUMERIC, 4) AS return_9m,
        ROUND(((pp.close_price - pp.price_1y) / NULLIF(pp.price_1y, 0) * 100)::NUMERIC, 4) AS return_1y,
        ROUND(vol.vol_30d::NUMERIC, 4)                                                      AS volatility_30d,
        ROUND(vol.vol_90d::NUMERIC, 4)                                                      AS volatility_90d,
        ROUND(vol.vol_1y::NUMERIC,  4)                                                      AS volatility_1y
    FROM price_points pp
    LEFT JOIN volatility_calc vol ON pp.symbol = vol.symbol
    ON CONFLICT (symbol, calculation_date) DO UPDATE SET
        current_price  = EXCLUDED.current_price,
        return_3m      = EXCLUDED.return_3m,
        return_6m      = EXCLUDED.return_6m,
        return_9m      = EXCLUDED.return_9m,
        return_1y      = EXCLUDED.return_1y,
        volatility_30d = EXCLUDED.volatility_30d,
        volatility_90d = EXCLUDED.volatility_90d,
        volatility_1y  = EXCLUDED.volatility_1y;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    RAISE NOTICE 'Returns calculated for %: % securities processed', p_calculation_date, v_rows_affected;
END;
$$;


-- ============================================================================
-- STEP 9: UPDATE sp_calculate_returns_bulk — slim returns columns + 3yr window
-- ============================================================================

CREATE OR REPLACE PROCEDURE sp_calculate_returns_bulk(
    p_start_date DATE,
    p_end_date   DATE
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_rows_affected INTEGER;
    v_history_start DATE;
BEGIN
    -- Only need 1y + buffer for LAG(252). 3-year data means this is always available.
    v_history_start := p_start_date - INTERVAL '1 year 3 months';

    RAISE NOTICE 'Bulk returns calculation: % → % (history from %)',
        p_start_date, p_end_date, v_history_start;

    INSERT INTO returns_analysis (
        symbol, calculation_date, current_price,
        return_3m, return_6m, return_9m, return_1y,
        volatility_30d, volatility_90d, volatility_1y
    )
    WITH price_history AS (
        SELECT
            symbol,
            trading_date,
            close_price,
            LAG(close_price,  63) OVER w AS price_3m,
            LAG(close_price, 126) OVER w AS price_6m,
            LAG(close_price, 190) OVER w AS price_9m,
            LAG(close_price, 252) OVER w AS price_1y,
            LN(close_price / NULLIF(LAG(close_price, 1) OVER w, 0)) AS daily_log_ret
        FROM daily_stock_data
        WHERE trading_date <= p_end_date
          AND trading_date >= v_history_start
        WINDOW w AS (PARTITION BY symbol ORDER BY trading_date)
    ),
    calc_dates AS (
        SELECT * FROM price_history
        WHERE trading_date BETWEEN p_start_date AND p_end_date
    ),
    vol_window AS (
        SELECT
            symbol,
            trading_date,
            STDDEV(daily_log_ret) OVER (
                PARTITION BY symbol ORDER BY trading_date
                ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
            ) * SQRT(252) * 100 AS vol_30d,
            STDDEV(daily_log_ret) OVER (
                PARTITION BY symbol ORDER BY trading_date
                ROWS BETWEEN 89 PRECEDING AND CURRENT ROW
            ) * SQRT(252) * 100 AS vol_90d,
            STDDEV(daily_log_ret) OVER (
                PARTITION BY symbol ORDER BY trading_date
                ROWS BETWEEN 251 PRECEDING AND CURRENT ROW
            ) * SQRT(252) * 100 AS vol_1y
        FROM price_history
        WHERE daily_log_ret IS NOT NULL
    )
    SELECT
        cd.symbol,
        cd.trading_date                                                                      AS calculation_date,
        cd.close_price                                                                       AS current_price,
        ROUND(((cd.close_price - cd.price_3m) / NULLIF(cd.price_3m, 0) * 100)::NUMERIC, 4) AS return_3m,
        ROUND(((cd.close_price - cd.price_6m) / NULLIF(cd.price_6m, 0) * 100)::NUMERIC, 4) AS return_6m,
        ROUND(((cd.close_price - cd.price_9m) / NULLIF(cd.price_9m, 0) * 100)::NUMERIC, 4) AS return_9m,
        ROUND(((cd.close_price - cd.price_1y) / NULLIF(cd.price_1y, 0) * 100)::NUMERIC, 4) AS return_1y,
        ROUND(vw.vol_30d::NUMERIC, 4)                                                       AS volatility_30d,
        ROUND(vw.vol_90d::NUMERIC, 4)                                                       AS volatility_90d,
        ROUND(vw.vol_1y::NUMERIC,  4)                                                       AS volatility_1y
    FROM calc_dates cd
    LEFT JOIN vol_window vw ON cd.symbol = vw.symbol AND cd.trading_date = vw.trading_date
    ON CONFLICT (symbol, calculation_date) DO UPDATE SET
        current_price  = EXCLUDED.current_price,
        return_3m      = EXCLUDED.return_3m,
        return_6m      = EXCLUDED.return_6m,
        return_9m      = EXCLUDED.return_9m,
        return_1y      = EXCLUDED.return_1y,
        volatility_30d = EXCLUDED.volatility_30d,
        volatility_90d = EXCLUDED.volatility_90d,
        volatility_1y  = EXCLUDED.volatility_1y;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    RAISE NOTICE 'Bulk returns complete: % rows upserted for % → %',
        v_rows_affected, p_start_date, p_end_date;

    COMMIT;
END;
$$;

-- ====== MIGRATION COMPLETE ======
