-- ============================================================================
-- AGGREGATION QUEUE v2 — efficient batch processing
-- Stock Market Analytics Platform
-- PostgreSQL 15+
--
-- KEY REDESIGN: sp_process_aggregation_queue no longer calls weekly/monthly
-- aggregation once per queued DATE. Instead it:
--   1. Collects all PENDING dates
--   2. Derives the unique WEEKS and MONTHS that contain those dates
--   3. Calls sp_calculate_weekly_aggregates  ONCE per unique week
--   4. Calls sp_calculate_monthly_aggregates ONCE per unique month
--   5. Marks all processed dates as COMPLETED in one UPDATE
--
-- This eliminates the repeated recalculation you saw (same week recomputed
-- 5 times because it had 5 queued trading days).
--
-- NO COMMIT inside procedures — caller manages the transaction:
--   pgAdmin / psql : top-level CALL auto-commits
--   Python         : set autocommit=True before calling (already done)
-- ============================================================================


-- ============================================================================
-- TABLE: aggregation_queue  (unchanged schema)
-- ============================================================================
CREATE TABLE IF NOT EXISTS aggregation_queue (
    id              BIGSERIAL    PRIMARY KEY,
    trading_date    DATE         NOT NULL UNIQUE,
    needs_weekly    BOOLEAN      NOT NULL DEFAULT TRUE,
    needs_monthly   BOOLEAN      NOT NULL DEFAULT TRUE,
    needs_returns   BOOLEAN      NOT NULL DEFAULT TRUE,
    status          VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    queued_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at    TIMESTAMP,
    error_message   TEXT,
    CONSTRAINT chk_aq_status
        CHECK (status IN ('PENDING','PROCESSING','COMPLETED','FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_aq_status       ON aggregation_queue(status);
CREATE INDEX IF NOT EXISTS idx_aq_trading_date ON aggregation_queue(trading_date);


-- ============================================================================
-- TRIGGER: queue a date when daily_stock_data is written
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_queue_aggregations()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO aggregation_queue
        (trading_date, needs_weekly, needs_monthly, needs_returns, status)
    VALUES
        (NEW.trading_date, TRUE, TRUE, TRUE, 'PENDING')
    ON CONFLICT (trading_date) DO UPDATE
        SET needs_weekly  = TRUE,
            needs_monthly = TRUE,
            needs_returns = TRUE,
            status        = 'PENDING',
            error_message = NULL;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_queue_aggregations ON daily_stock_data;
CREATE TRIGGER trg_queue_aggregations
    AFTER INSERT OR UPDATE ON daily_stock_data
    FOR EACH ROW
    EXECUTE FUNCTION fn_queue_aggregations();


-- ============================================================================
-- PROCEDURE: sp_process_aggregation_queue
--
-- Efficiently processes the queue by computing each unique week/month ONCE,
-- regardless of how many trading days from that period are in the queue.
--
-- Example: 5 queued dates all in the same week -> 1 weekly aggregation call
--          20 queued dates all in the same month -> 1 monthly aggregation call
-- ============================================================================
CREATE OR REPLACE PROCEDURE sp_process_aggregation_queue(
    p_batch_size INTEGER DEFAULT 500
)
LANGUAGE plpgsql AS $$
DECLARE
    v_period    RECORD;
    v_count     INTEGER := 0;
    v_wk_count  INTEGER := 0;
    v_mo_count  INTEGER := 0;
BEGIN
    -- ------------------------------------------------------------------
    -- Step 1: snapshot the PENDING dates into a temp table
    -- ------------------------------------------------------------------
    CREATE TEMP TABLE IF NOT EXISTS _aq_pending (
        trading_date  DATE,
        needs_weekly  BOOLEAN,
        needs_monthly BOOLEAN
    ) ON COMMIT DROP;

    DELETE FROM _aq_pending;

    INSERT INTO _aq_pending (trading_date, needs_weekly, needs_monthly)
    SELECT trading_date, needs_weekly, needs_monthly
    FROM   aggregation_queue
    WHERE  status = 'PENDING'
    ORDER  BY trading_date
    LIMIT  p_batch_size;

    SELECT COUNT(*) INTO v_count FROM _aq_pending;
    RAISE NOTICE 'Queued dates to process: %', v_count;

    IF v_count = 0 THEN
        RAISE NOTICE 'Nothing pending — done.';
        RETURN;
    END IF;

    -- Mark them all as PROCESSING up front
    UPDATE aggregation_queue
       SET status = 'PROCESSING'
     WHERE trading_date IN (SELECT trading_date FROM _aq_pending);

    -- ------------------------------------------------------------------
    -- Step 2: weekly aggregations — ONE call per unique ISO week
    -- A week is identified by (year, week_number). We compute the Monday
    -- and Sunday of that week and call sp_calculate_weekly_aggregates once.
    -- ------------------------------------------------------------------
    FOR v_period IN
        SELECT DISTINCT
            DATE_TRUNC('week', trading_date)::DATE                            AS week_start,
            (DATE_TRUNC('week', trading_date) + INTERVAL '6 days')::DATE      AS week_end
        FROM  _aq_pending
        WHERE needs_weekly = TRUE
        ORDER BY week_start
    LOOP
        BEGIN
            CALL sp_calculate_weekly_aggregates(v_period.week_start, v_period.week_end);
            v_wk_count := v_wk_count + 1;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Weekly aggregation failed for week starting %: %',
                v_period.week_start, SQLERRM;
            -- Mark affected dates as FAILED
            UPDATE aggregation_queue
               SET status        = 'FAILED',
                   processed_at  = CURRENT_TIMESTAMP,
                   error_message = 'Weekly: ' || SQLERRM
             WHERE trading_date IN (
                 SELECT trading_date FROM _aq_pending
                 WHERE  trading_date BETWEEN v_period.week_start AND v_period.week_end
             );
        END;
    END LOOP;

    RAISE NOTICE 'Weekly: % unique weeks processed', v_wk_count;

    -- ------------------------------------------------------------------
    -- Step 3: monthly aggregations — ONE call per unique calendar month
    -- ------------------------------------------------------------------
    FOR v_period IN
        SELECT DISTINCT
            DATE_TRUNC('month', trading_date)::DATE                                   AS month_start,
            (DATE_TRUNC('month', trading_date) + INTERVAL '1 month - 1 day')::DATE   AS month_end
        FROM  _aq_pending
        WHERE needs_monthly = TRUE
        ORDER BY month_start
    LOOP
        BEGIN
            CALL sp_calculate_monthly_aggregates(v_period.month_start, v_period.month_end);
            v_mo_count := v_mo_count + 1;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Monthly aggregation failed for month starting %: %',
                v_period.month_start, SQLERRM;
            UPDATE aggregation_queue
               SET status        = 'FAILED',
                   processed_at  = CURRENT_TIMESTAMP,
                   error_message = 'Monthly: ' || SQLERRM
             WHERE trading_date IN (
                 SELECT trading_date FROM _aq_pending
                 WHERE  trading_date BETWEEN v_period.month_start AND v_period.month_end
             );
        END;
    END LOOP;

    RAISE NOTICE 'Monthly: % unique months processed', v_mo_count;

    -- ------------------------------------------------------------------
    -- Step 4: mark all successfully processed dates as COMPLETED
    -- (only the ones not already set to FAILED above)
    -- ------------------------------------------------------------------
    UPDATE aggregation_queue
       SET status       = 'COMPLETED',
           processed_at = CURRENT_TIMESTAMP,
           error_message = NULL
     WHERE trading_date IN (SELECT trading_date FROM _aq_pending)
       AND status = 'PROCESSING';

    RAISE NOTICE 'Done: % dates marked COMPLETED (%  weekly runs, % monthly runs)',
        v_count, v_wk_count, v_mo_count;
END;
$$;

COMMENT ON PROCEDURE sp_process_aggregation_queue IS
    'Processes PENDING aggregation_queue rows efficiently: '
    'computes each unique week/month ONCE regardless of how many queued '
    'dates fall in that period. No internal COMMITs — caller manages transaction.';


-- ============================================================================
-- FUNCTION: fn_get_queue_status
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_get_queue_status()
RETURNS TABLE (
    status        VARCHAR(20),
    date_count    BIGINT,
    earliest_date DATE,
    latest_date   DATE
)
LANGUAGE sql STABLE AS $$
    SELECT
        status,
        COUNT(*)          AS date_count,
        MIN(trading_date) AS earliest_date,
        MAX(trading_date) AS latest_date
    FROM  aggregation_queue
    GROUP BY status
    ORDER BY status;
$$;


-- ============================================================================
-- IMMEDIATE FIX: reset queue and reprocess all existing dates cleanly
-- Run this after applying the procedure above.
-- ============================================================================

-- 1. Reset queue
DELETE FROM aggregation_queue;

-- 2. Re-queue all dates (weekly + monthly only; returns already done separately)
INSERT INTO aggregation_queue
    (trading_date, needs_weekly, needs_monthly, needs_returns, status)
SELECT DISTINCT trading_date, TRUE, TRUE, FALSE, 'PENDING'
FROM   daily_stock_data
ON CONFLICT (trading_date) DO UPDATE
    SET needs_weekly  = TRUE,
        needs_monthly = TRUE,
        status        = 'PENDING';

-- 3. Confirm count
SELECT
    COUNT(*)              AS total_dates,
    MIN(trading_date)     AS from_date,
    MAX(trading_date)     AS to_date
FROM aggregation_queue
WHERE status = 'PENDING';

-- 4. Process — each unique week runs once, each unique month runs once
--    For 251 queued dates: ~51 weekly calls + ~13 monthly calls (not 502!)
CALL sp_process_aggregation_queue(500);

-- 5. Verify
SELECT * FROM fn_get_queue_status();

SELECT 'Weekly'  AS table_name, COUNT(*) AS rows FROM weekly_analysis_data
UNION ALL
SELECT 'Monthly',               COUNT(*) FROM monthly_analysis_data;




-- Check if January rows have NULL prev_month_close
SELECT symbol, year, month, prev_month_close, month_over_month_change_pct
FROM monthly_analysis_data
WHERE month = 1
LIMIT 10;