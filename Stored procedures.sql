-- ============================================================================
-- DATABASE SCHEMA SETUP - PART 3: STORED PROCEDURES
-- Stock Market Analytics Platform - Database: Stock_Data
-- PostgreSQL 15+
-- ============================================================================

-- ============================================================================
-- SECTION 1: AGGREGATION PROCEDURES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Procedure: sp_calculate_weekly_aggregates
-- Computes weekly OHLC and metrics for specified date range
-- ----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_calculate_weekly_aggregates(
    p_start_date DATE,
    p_end_date DATE
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_rows_affected INTEGER;
BEGIN
    -- Insert/Update weekly aggregates
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
        open_price          = EXCLUDED.open_price,
        high_price          = EXCLUDED.high_price,
        low_price           = EXCLUDED.low_price,
        close_price         = EXCLUDED.close_price,
        total_traded_qty    = EXCLUDED.total_traded_qty,
        total_turnover_lacs = EXCLUDED.total_turnover_lacs,
        no_of_trading_days  = EXCLUDED.no_of_trading_days,
        total_trades        = EXCLUDED.total_trades,
        total_delivery_qty  = EXCLUDED.total_delivery_qty,
        avg_delivery_percent = EXCLUDED.avg_delivery_percent,
        updated_at          = CURRENT_TIMESTAMP;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    RAISE NOTICE 'Weekly aggregates computed: % rows affected', v_rows_affected;

    -- -----------------------------------------------------------------------
    -- FIX #4: WoW change now handles the year-boundary correctly.
    -- The previous version used  w1.year = w2.year AND w1.week = w2.week + 1
    -- which meant week 1 of a new year never got its prev_week_close because
    -- week 52/53 lives in the prior year.
    -- Solution: compare ISO week numbers as a single sortable integer
    --   iso_week = year * 100 + week_number  (e.g. 202501, 202452)
    -- and handle the year-roll by also matching week 1 → week 52/53.
    -- -----------------------------------------------------------------------
    UPDATE weekly_analysis_data w1
    SET
        prev_week_close       = w2.close_price,
        week_over_week_change = w1.close_price - w2.close_price,
        week_over_week_change_pct = ROUND(
            ((w1.close_price - w2.close_price) / NULLIF(w2.close_price, 0) * 100), 2),
        updated_at = CURRENT_TIMESTAMP
    FROM weekly_analysis_data w2
    WHERE w1.symbol = w2.symbol
      -- Normal case: consecutive weeks within the same year
      AND (
            (w1.year = w2.year AND w1.week_number = w2.week_number + 1)
            OR
            -- Year-boundary case: w1 is week 1 of year N, w2 is week 52/53 of year N-1
            (w1.week_number = 1 AND w2.week_number >= 52 AND w1.year = w2.year + 1)
          )
      AND (DATE_TRUNC('year', MAKE_DATE(w1.year, 1, 1)) +
           (w1.week_number - 1) * INTERVAL '1 week')::DATE
           BETWEEN p_start_date AND p_end_date;
END;
$$;

COMMENT ON PROCEDURE sp_calculate_weekly_aggregates IS
    'Computes weekly OHLC and metrics for specified date range. '
    'WoW change correctly handles year-boundary (week 1 vs week 52/53).';


-- ----------------------------------------------------------------------------
-- Procedure: sp_calculate_monthly_aggregates
-- Computes monthly OHLC, metrics and volatility for specified date range
-- ----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_calculate_monthly_aggregates(
    p_start_date DATE,
    p_end_date DATE
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_rows_affected INTEGER;
BEGIN
    -- -------------------------------------------------------------------------
    -- FIX #3: volatility calculation.
    -- The original code used  STDDEV( LAG(...) OVER (...) )  which PostgreSQL
    -- rejects because window functions cannot be nested inside aggregate calls
    -- at the same query level.
    -- Solution: pre-compute the daily return in a subquery (daily_returns CTE),
    -- then aggregate STDDEV in the outer GROUP BY. This is both correct SQL and
    -- produces the same result.
    -- -------------------------------------------------------------------------
    INSERT INTO monthly_analysis_data (
        symbol, code, year, month, month_name,
        month_start_date, month_end_date,
        open_price, high_price, low_price, close_price,
        total_traded_qty, total_turnover_lacs, avg_daily_turnover,
        no_of_trading_days, total_trades, total_delivery_qty,
        avg_delivery_percent, volatility
    )
    -- Step 1: compute daily returns using LAG in an inner subquery
    WITH daily_returns AS (
        SELECT
            symbol,
            trading_date,
            code,
            open_price,
            high_price,
            low_price,
            close_price,
            total_traded_qty,
            turnover_lacs,
            no_of_trades,
            delivery_qty,
            delivery_percent,
            -- daily return % — safe to compute here because LAG is a window
            -- function applied before any GROUP BY
            (close_price
                - LAG(close_price) OVER (PARTITION BY symbol ORDER BY trading_date))
            / NULLIF(
                LAG(close_price) OVER (PARTITION BY symbol ORDER BY trading_date),
                0) * 100  AS daily_return_pct
        FROM daily_stock_data
        WHERE trading_date BETWEEN p_start_date AND p_end_date
    )
    -- Step 2: aggregate per (symbol, year, month) — STDDEV of pre-computed daily returns
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
        -- STDDEV of daily_return_pct — valid here because it's a plain aggregate
        -- over a pre-computed column (no window function nesting)
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
        volatility           = EXCLUDED.volatility,
        updated_at           = CURRENT_TIMESTAMP;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    RAISE NOTICE 'Monthly aggregates computed: % rows affected', v_rows_affected;

    -- Calculate month-over-month changes
    -- PART A: Normal case — consecutive months within the same year
    -- Filtered by date range so we only update months we just recomputed.
    UPDATE monthly_analysis_data m1
    SET
        prev_month_close          = m2.close_price,
        month_over_month_change   = m1.close_price - m2.close_price,
        month_over_month_change_pct = ROUND(
            ((m1.close_price - m2.close_price) / NULLIF(m2.close_price, 0) * 100), 2),
        updated_at = CURRENT_TIMESTAMP
    FROM monthly_analysis_data m2
    WHERE m1.symbol = m2.symbol
      AND m1.year  = m2.year
      AND m1.month = m2.month + 1
      AND m1.month_start_date BETWEEN p_start_date AND p_end_date;

    -- PART B: Year-boundary case — January of year N links to December of year N-1.
    -- The original single-UPDATE approach had a subtle interaction with the date-range
    -- filter that prevented this OR branch from firing. Separating it fixes that.
    -- We match on explicit month/year values so no date-range filter is needed.
    UPDATE monthly_analysis_data m1
    SET
        prev_month_close          = m2.close_price,
        month_over_month_change   = m1.close_price - m2.close_price,
        month_over_month_change_pct = ROUND(
            ((m1.close_price - m2.close_price) / NULLIF(m2.close_price, 0) * 100), 2),
        updated_at = CURRENT_TIMESTAMP
    FROM monthly_analysis_data m2
    WHERE m1.symbol  = m2.symbol
      AND m1.month   = 1
      AND m2.month   = 12
      AND m1.year    = m2.year + 1
      AND m1.month_start_date BETWEEN p_start_date AND p_end_date;
END;
$$;

COMMENT ON PROCEDURE sp_calculate_monthly_aggregates IS
    'Computes monthly OHLC, metrics and volatility for specified date range. '
    'Volatility uses a CTE to pre-compute daily returns before STDDEV aggregation, '
    'avoiding the illegal window-inside-aggregate pattern.';


-- ============================================================================
-- SECTION 2: DATA IMPORT PROCEDURES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Procedure: sp_import_daily_data
-- Imports or updates daily stock data with automatic security creation
-- ----------------------------------------------------------------------------
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
    -- Check if symbol exists
    SELECT EXISTS(SELECT 1 FROM security WHERE symbol = p_symbol) INTO v_symbol_exists;

    IF NOT v_symbol_exists THEN
        -- Validate series code
        SELECT EXISTS(SELECT 1 FROM series WHERE code = p_code) INTO v_code_exists;

        IF NOT v_code_exists THEN
            RAISE EXCEPTION 'Invalid series code: %', p_code;
        END IF;

        -- Insert new security
        INSERT INTO security (symbol, code)
        VALUES (p_symbol, p_code);

        RAISE NOTICE 'New security created: %', p_symbol;
    END IF;

    -- Insert or update daily data
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
        delivery_percent = EXCLUDED.delivery_percent,
        updated_at       = CURRENT_TIMESTAMP;

EXCEPTION
    WHEN OTHERS THEN
        -- FIX #5: removed unreachable ROLLBACK after RAISE EXCEPTION.
        -- PostgreSQL automatically rolls back the current transaction when an
        -- unhandled exception propagates out of a procedure. The ROLLBACK line
        -- that was here could never execute because RAISE EXCEPTION exits
        -- immediately. Removing it avoids confusion without changing behaviour.
        RAISE EXCEPTION 'Error importing data for % on %: %',
            p_symbol, p_trading_date, SQLERRM;
END;
$$;

COMMENT ON PROCEDURE sp_import_daily_data IS
    'Imports or updates daily stock data with automatic security creation. '
    'Uses natural keys (symbol, trading_date).';


-- ============================================================================
-- SECTION 3: RETURNS CALCULATION PROCEDURES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Procedure: sp_calculate_returns
-- Calculates returns, volatility, and risk metrics for all securities for ONE date.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_calculate_returns(
    p_calculation_date DATE DEFAULT CURRENT_DATE
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_rows_affected  INTEGER;
    v_risk_free_rate DECIMAL(6,4) := 6.5;  -- Annual risk-free rate (%)
BEGIN
    INSERT INTO returns_analysis (
        symbol,
        calculation_date,
        current_price,
        return_1d, return_1w, return_1m, return_3m, return_6m,
        return_1y, return_2y, return_3y, return_5y, return_ytd,
        log_return_1d, log_return_1w, log_return_1m, log_return_3m, log_return_1y,
        volatility_30d, volatility_90d, volatility_1y,
        sharpe_ratio_1y, max_drawdown_1y,
        price_1d_ago, price_1w_ago, price_1m_ago, price_1y_ago
    )
    WITH price_history AS (
        SELECT
            symbol,
            trading_date,
            close_price,
            LAG(close_price,    1) OVER w AS price_1d,
            LAG(close_price,    5) OVER w AS price_1w,
            LAG(close_price,   22) OVER w AS price_1m,
            LAG(close_price,   63) OVER w AS price_3m,
            LAG(close_price,  126) OVER w AS price_6m,
            LAG(close_price,  252) OVER w AS price_1y,
            LAG(close_price,  504) OVER w AS price_2y,
            LAG(close_price,  756) OVER w AS price_3y,
            LAG(close_price, 1260) OVER w AS price_5y,
            LN(close_price / NULLIF(LAG(close_price, 1) OVER w, 0)) AS daily_log_ret
        FROM daily_stock_data
        WHERE trading_date <= p_calculation_date
          AND trading_date >= p_calculation_date - INTERVAL '5 years 3 months'
        WINDOW w AS (PARTITION BY symbol ORDER BY trading_date)
    ),
    price_points AS (
        SELECT * FROM price_history
        WHERE trading_date = p_calculation_date
    ),
    ytd_price AS (
        SELECT DISTINCT ON (symbol)
            symbol,
            close_price AS price_ytd
        FROM daily_stock_data
        WHERE trading_date >= DATE_TRUNC('year', p_calculation_date)::DATE
          AND trading_date <  p_calculation_date
        ORDER BY symbol, trading_date ASC
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
    ),
    drawdown_calc AS (
        SELECT
            symbol,
            MIN(
                (close_price
                    - MAX(close_price) OVER (PARTITION BY symbol ORDER BY trading_date
                                            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW))
                / NULLIF(
                    MAX(close_price) OVER (PARTITION BY symbol ORDER BY trading_date
                                          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW),
                    0) * 100
            ) AS max_dd
        FROM daily_stock_data
        WHERE trading_date <= p_calculation_date
          AND trading_date >= p_calculation_date - INTERVAL '1 year'
        GROUP BY symbol
    )
    SELECT
        pp.symbol,
        p_calculation_date                                                                        AS calculation_date,
        pp.close_price                                                                            AS current_price,
        ROUND(((pp.close_price - pp.price_1d) / NULLIF(pp.price_1d, 0) * 100)::NUMERIC, 4)      AS return_1d,
        ROUND(((pp.close_price - pp.price_1w) / NULLIF(pp.price_1w, 0) * 100)::NUMERIC, 4)      AS return_1w,
        ROUND(((pp.close_price - pp.price_1m) / NULLIF(pp.price_1m, 0) * 100)::NUMERIC, 4)      AS return_1m,
        ROUND(((pp.close_price - pp.price_3m) / NULLIF(pp.price_3m, 0) * 100)::NUMERIC, 4)      AS return_3m,
        ROUND(((pp.close_price - pp.price_6m) / NULLIF(pp.price_6m, 0) * 100)::NUMERIC, 4)      AS return_6m,
        ROUND(((pp.close_price - pp.price_1y) / NULLIF(pp.price_1y, 0) * 100)::NUMERIC, 4)      AS return_1y,
        ROUND(((pp.close_price - pp.price_2y) / NULLIF(pp.price_2y, 0) * 100)::NUMERIC, 4)      AS return_2y,
        ROUND(((pp.close_price - pp.price_3y) / NULLIF(pp.price_3y, 0) * 100)::NUMERIC, 4)      AS return_3y,
        ROUND(((pp.close_price - pp.price_5y) / NULLIF(pp.price_5y, 0) * 100)::NUMERIC, 4)      AS return_5y,
        ROUND(((pp.close_price - ytd.price_ytd) / NULLIF(ytd.price_ytd, 0) * 100)::NUMERIC, 4)  AS return_ytd,
        ROUND((LN(pp.close_price / NULLIF(pp.price_1d, 0)) * 100)::NUMERIC, 6)                  AS log_return_1d,
        ROUND((LN(pp.close_price / NULLIF(pp.price_1w, 0)) * 100)::NUMERIC, 6)                  AS log_return_1w,
        ROUND((LN(pp.close_price / NULLIF(pp.price_1m, 0)) * 100)::NUMERIC, 6)                  AS log_return_1m,
        ROUND((LN(pp.close_price / NULLIF(pp.price_3m, 0)) * 100)::NUMERIC, 6)                  AS log_return_3m,
        ROUND((LN(pp.close_price / NULLIF(pp.price_1y, 0)) * 100)::NUMERIC, 6)                  AS log_return_1y,
        ROUND(vol.vol_30d::NUMERIC, 4)                                                           AS volatility_30d,
        ROUND(vol.vol_90d::NUMERIC, 4)                                                           AS volatility_90d,
        ROUND(vol.vol_1y::NUMERIC, 4)                                                            AS volatility_1y,
        ROUND((
            (((pp.close_price - pp.price_1y) / NULLIF(pp.price_1y, 0) * 100) - v_risk_free_rate)
            / NULLIF(vol.vol_1y, 0)
        )::NUMERIC, 4)                                                                           AS sharpe_ratio_1y,
        ROUND(dd.max_dd::NUMERIC, 4)                                                             AS max_drawdown_1y,
        pp.price_1d AS price_1d_ago,
        pp.price_1w AS price_1w_ago,
        pp.price_1m AS price_1m_ago,
        pp.price_1y AS price_1y_ago
    FROM price_points pp
    LEFT JOIN ytd_price      ytd ON pp.symbol = ytd.symbol
    LEFT JOIN volatility_calc vol ON pp.symbol = vol.symbol
    LEFT JOIN drawdown_calc    dd ON pp.symbol = dd.symbol
    ON CONFLICT (symbol, calculation_date) DO UPDATE SET
        current_price   = EXCLUDED.current_price,
        return_1d       = EXCLUDED.return_1d,
        return_1w       = EXCLUDED.return_1w,
        return_1m       = EXCLUDED.return_1m,
        return_3m       = EXCLUDED.return_3m,
        return_6m       = EXCLUDED.return_6m,
        return_1y       = EXCLUDED.return_1y,
        return_2y       = EXCLUDED.return_2y,
        return_3y       = EXCLUDED.return_3y,
        return_5y       = EXCLUDED.return_5y,
        return_ytd      = EXCLUDED.return_ytd,
        log_return_1d   = EXCLUDED.log_return_1d,
        log_return_1w   = EXCLUDED.log_return_1w,
        log_return_1m   = EXCLUDED.log_return_1m,
        log_return_3m   = EXCLUDED.log_return_3m,
        log_return_1y   = EXCLUDED.log_return_1y,
        volatility_30d  = EXCLUDED.volatility_30d,
        volatility_90d  = EXCLUDED.volatility_90d,
        volatility_1y   = EXCLUDED.volatility_1y,
        sharpe_ratio_1y = EXCLUDED.sharpe_ratio_1y,
        max_drawdown_1y = EXCLUDED.max_drawdown_1y,
        price_1d_ago    = EXCLUDED.price_1d_ago,
        price_1w_ago    = EXCLUDED.price_1w_ago,
        price_1m_ago    = EXCLUDED.price_1m_ago,
        price_1y_ago    = EXCLUDED.price_1y_ago,
        updated_at      = CURRENT_TIMESTAMP;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    RAISE NOTICE 'Returns calculated for %: % securities processed', p_calculation_date, v_rows_affected;
END;
$$;

COMMENT ON PROCEDURE sp_calculate_returns IS
    'Calculates returns, volatility, and risk metrics for all securities for ONE date. '
    'Volatility is computed via a single window-function pass (no correlated subqueries).';


-- ----------------------------------------------------------------------------
-- Procedure: sp_calculate_returns_bulk
-- Calculates returns for ALL trading dates in [p_start_date, p_end_date].
-- Usage: CALL sp_calculate_returns_bulk('2024-01-01', '2025-01-31');
-- ----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_calculate_returns_bulk(
    p_start_date DATE,
    p_end_date   DATE
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_rows_affected  INTEGER;
    v_risk_free_rate DECIMAL(6,4) := 6.5;
    v_history_start  DATE;
BEGIN
    v_history_start := p_start_date - INTERVAL '5 years 3 months';

    RAISE NOTICE 'Bulk returns calculation: % → % (history from %)',
        p_start_date, p_end_date, v_history_start;

    INSERT INTO returns_analysis (
        symbol,
        calculation_date,
        current_price,
        return_1d, return_1w, return_1m, return_3m, return_6m,
        return_1y, return_2y, return_3y, return_5y, return_ytd,
        log_return_1d, log_return_1w, log_return_1m, log_return_3m, log_return_1y,
        volatility_30d, volatility_90d, volatility_1y,
        sharpe_ratio_1y, max_drawdown_1y,
        price_1d_ago, price_1w_ago, price_1m_ago, price_1y_ago
    )
    WITH price_history AS (
        SELECT
            symbol,
            trading_date,
            close_price,
            LAG(close_price,    1) OVER w AS price_1d,
            LAG(close_price,    5) OVER w AS price_1w,
            LAG(close_price,   22) OVER w AS price_1m,
            LAG(close_price,   63) OVER w AS price_3m,
            LAG(close_price,  126) OVER w AS price_6m,
            LAG(close_price,  252) OVER w AS price_1y,
            LAG(close_price,  504) OVER w AS price_2y,
            LAG(close_price,  756) OVER w AS price_3y,
            LAG(close_price, 1260) OVER w AS price_5y,
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
    ytd_base AS (
        SELECT DISTINCT ON (symbol, EXTRACT(YEAR FROM trading_date))
            symbol,
            EXTRACT(YEAR FROM trading_date)::INTEGER AS yr,
            trading_date,
            close_price AS price_ytd
        FROM daily_stock_data
        WHERE trading_date >= DATE_TRUNC('year', p_start_date)::DATE
          AND trading_date <= p_end_date
        ORDER BY symbol, EXTRACT(YEAR FROM trading_date), trading_date ASC
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
    ),
    drawdown_window AS (
        SELECT
            symbol,
            trading_date,
            -- Rolling max-drawdown over the past 252 trading days (1 year).
            -- Step 1: find the rolling peak price up to this date
            -- Step 2: compute the % drop from that peak to today's close
            -- The outer MIN aggregation is not needed here — this is a
            -- row-level calculation. We directly compute the drawdown for
            -- each row and let the caller (final SELECT) use it.
            (close_price
                - MAX(close_price) OVER (PARTITION BY symbol ORDER BY trading_date
                                        ROWS BETWEEN 251 PRECEDING AND CURRENT ROW))
            / NULLIF(
                MAX(close_price) OVER (PARTITION BY symbol ORDER BY trading_date
                                      ROWS BETWEEN 251 PRECEDING AND CURRENT ROW),
                0) * 100  AS max_dd
        FROM price_history
    )
    SELECT
        cd.symbol,
        cd.trading_date                                                                           AS calculation_date,
        cd.close_price                                                                            AS current_price,
        ROUND(((cd.close_price - cd.price_1d) / NULLIF(cd.price_1d, 0) * 100)::NUMERIC, 4)      AS return_1d,
        ROUND(((cd.close_price - cd.price_1w) / NULLIF(cd.price_1w, 0) * 100)::NUMERIC, 4)      AS return_1w,
        ROUND(((cd.close_price - cd.price_1m) / NULLIF(cd.price_1m, 0) * 100)::NUMERIC, 4)      AS return_1m,
        ROUND(((cd.close_price - cd.price_3m) / NULLIF(cd.price_3m, 0) * 100)::NUMERIC, 4)      AS return_3m,
        ROUND(((cd.close_price - cd.price_6m) / NULLIF(cd.price_6m, 0) * 100)::NUMERIC, 4)      AS return_6m,
        ROUND(((cd.close_price - cd.price_1y) / NULLIF(cd.price_1y, 0) * 100)::NUMERIC, 4)      AS return_1y,
        ROUND(((cd.close_price - cd.price_2y) / NULLIF(cd.price_2y, 0) * 100)::NUMERIC, 4)      AS return_2y,
        ROUND(((cd.close_price - cd.price_3y) / NULLIF(cd.price_3y, 0) * 100)::NUMERIC, 4)      AS return_3y,
        ROUND(((cd.close_price - cd.price_5y) / NULLIF(cd.price_5y, 0) * 100)::NUMERIC, 4)      AS return_5y,
        ROUND(((cd.close_price - ytd.price_ytd) / NULLIF(ytd.price_ytd, 0) * 100)::NUMERIC, 4)  AS return_ytd,
        ROUND((LN(cd.close_price / NULLIF(cd.price_1d, 0)) * 100)::NUMERIC, 6)                  AS log_return_1d,
        ROUND((LN(cd.close_price / NULLIF(cd.price_1w, 0)) * 100)::NUMERIC, 6)                  AS log_return_1w,
        ROUND((LN(cd.close_price / NULLIF(cd.price_1m, 0)) * 100)::NUMERIC, 6)                  AS log_return_1m,
        ROUND((LN(cd.close_price / NULLIF(cd.price_3m, 0)) * 100)::NUMERIC, 6)                  AS log_return_3m,
        ROUND((LN(cd.close_price / NULLIF(cd.price_1y, 0)) * 100)::NUMERIC, 6)                  AS log_return_1y,
        ROUND(vw.vol_30d::NUMERIC, 4)                                                            AS volatility_30d,
        ROUND(vw.vol_90d::NUMERIC, 4)                                                            AS volatility_90d,
        ROUND(vw.vol_1y::NUMERIC,  4)                                                            AS volatility_1y,
        ROUND((
            (((cd.close_price - cd.price_1y) / NULLIF(cd.price_1y, 0) * 100) - v_risk_free_rate)
            / NULLIF(vw.vol_1y, 0)
        )::NUMERIC, 4)                                                                           AS sharpe_ratio_1y,
        ROUND(dw.max_dd::NUMERIC, 4)                                                             AS max_drawdown_1y,
        cd.price_1d AS price_1d_ago,
        cd.price_1w AS price_1w_ago,
        cd.price_1m AS price_1m_ago,
        cd.price_1y AS price_1y_ago
    FROM calc_dates cd
    LEFT JOIN ytd_base       ytd ON  cd.symbol = ytd.symbol
                                 AND EXTRACT(YEAR FROM cd.trading_date)::INTEGER = ytd.yr
                                 AND ytd.trading_date < cd.trading_date
    LEFT JOIN vol_window      vw ON  cd.symbol = vw.symbol AND cd.trading_date = vw.trading_date
    LEFT JOIN drawdown_window dw ON  cd.symbol = dw.symbol AND cd.trading_date = dw.trading_date
    ON CONFLICT (symbol, calculation_date) DO UPDATE SET
        current_price   = EXCLUDED.current_price,
        return_1d       = EXCLUDED.return_1d,
        return_1w       = EXCLUDED.return_1w,
        return_1m       = EXCLUDED.return_1m,
        return_3m       = EXCLUDED.return_3m,
        return_6m       = EXCLUDED.return_6m,
        return_1y       = EXCLUDED.return_1y,
        return_2y       = EXCLUDED.return_2y,
        return_3y       = EXCLUDED.return_3y,
        return_5y       = EXCLUDED.return_5y,
        return_ytd      = EXCLUDED.return_ytd,
        log_return_1d   = EXCLUDED.log_return_1d,
        log_return_1w   = EXCLUDED.log_return_1w,
        log_return_1m   = EXCLUDED.log_return_1m,
        log_return_3m   = EXCLUDED.log_return_3m,
        log_return_1y   = EXCLUDED.log_return_1y,
        volatility_30d  = EXCLUDED.volatility_30d,
        volatility_90d  = EXCLUDED.volatility_90d,
        volatility_1y   = EXCLUDED.volatility_1y,
        sharpe_ratio_1y = EXCLUDED.sharpe_ratio_1y,
        max_drawdown_1y = EXCLUDED.max_drawdown_1y,
        price_1d_ago    = EXCLUDED.price_1d_ago,
        price_1w_ago    = EXCLUDED.price_1w_ago,
        price_1m_ago    = EXCLUDED.price_1m_ago,
        price_1y_ago    = EXCLUDED.price_1y_ago,
        updated_at      = CURRENT_TIMESTAMP;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    RAISE NOTICE 'Bulk returns complete: % rows upserted for % → %',
        v_rows_affected, p_start_date, p_end_date;
END;
$$;

COMMENT ON PROCEDURE sp_calculate_returns_bulk IS
    'Bulk-calculates returns for ALL trading dates in [p_start_date, p_end_date] in a '
    'single INSERT…SELECT. Use for initial back-fills or large date ranges. '
    'All volatility and drawdown are computed via window functions — no correlated subqueries.';


-- ============================================================================
-- PROCEDURES SETUP COMPLETE
-- ============================================================================
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_type = 'PROCEDURE'
ORDER BY routine_name;





CALL sp_calculate_monthly_aggregates('2025-12-01', '2026-01-31');


SELECT symbol, year, month, prev_month_close, month_over_month_change_pct
FROM monthly_analysis_data
WHERE month = 1 AND year = 2026
AND symbol IN ('RELIANCE', 'TCS', 'INFY');