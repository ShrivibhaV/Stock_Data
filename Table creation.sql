-- ============================================================================
-- DATABASE SCHEMA SETUP - PART 1: TABLES AND REFERENCE DATA
-- Stock Market Analytics Platform - Database: Stock_Data
-- PostgreSQL 15+
-- ============================================================================

-- Drop existing tables if recreating (use with caution!)
-- DROP TABLE IF EXISTS returns_analysis CASCADE;
-- DROP TABLE IF EXISTS monthly_analysis_data CASCADE;
-- DROP TABLE IF EXISTS weekly_analysis_data CASCADE;
-- DROP TABLE IF EXISTS daily_stock_data CASCADE;
-- DROP TABLE IF EXISTS security CASCADE;
-- DROP TABLE IF EXISTS series CASCADE;

-- ============================================================================
-- SECTION 1: REFERENCE TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table: series
-- Master reference table for all trading series/segments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS series (
    code VARCHAR(5) PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    is_delivery_applicable BOOLEAN DEFAULT false
);

INSERT INTO series (code, name, description, is_delivery_applicable) VALUES
('EQ', 'Equity', 'Regular equity segment for trading stocks', true),
('BE', 'Book Entry', 'Book entry segment', false),
('BZ', 'Suspended', 'Trading suspended securities', false),
('IL', 'Illiquid', 'Illiquid securities', false),
('SM', 'SME', 'Small and Medium Enterprises segment', true),
('ST', 'Trade-to-Trade', 'Trade-to-trade settlement segment', true),
('E1', 'Trade-to-Trade Enhanced', 'Enhanced surveillance - Delivery only. No intraday. Stricter than BE.', true),
('IV', 'Institutional Variant', 'Restricted trading. Special regulatory handling.', false),
('RR', 'Rolling Settlement', 'Delivery focused. Stock under special rules.', true),
('N3', 'Non-clearing member', 'Special settlement. Regulatory/exchange-specific. Rare for retail.', false),
('SZ', 'Settlement Zone', 'Delivery only. Stock has settlement or compliance issues.', true),
('P1', 'Preferential', 'Partly Paid shares - Limited trading. Special corporate actions.', false),
('GB', 'Government Bonds', 'G-Secs trading (Not equity instrument).', false)
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Table: security (Reference table for listed securities)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS security (
    symbol VARCHAR(20) PRIMARY KEY,
    code VARCHAR(5) NOT NULL,
    company_name VARCHAR(255),
    sector VARCHAR(100),
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_series FOREIGN KEY (code) REFERENCES series(code),
    CONSTRAINT chk_status CHECK (status IN ('ACTIVE','SUSPENDED','DELISTED'))
);

CREATE INDEX IF NOT EXISTS idx_security_series ON security(code);
CREATE INDEX IF NOT EXISTS idx_security_sector ON security(sector);
CREATE INDEX IF NOT EXISTS idx_security_status ON security(status);


-- ----------------------------------------------------------------------------
-- Table: daily_stock_data
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_stock_data (
    id BIGSERIAL,
    symbol VARCHAR(20) NOT NULL,
    trading_date DATE NOT NULL,
    code VARCHAR(5) NOT NULL,
    prev_close DECIMAL(12,2),
    open_price DECIMAL(12,2) NOT NULL,
    high_price DECIMAL(12,2) NOT NULL,
    low_price DECIMAL(12,2) NOT NULL,
    last_price DECIMAL(12,2),
    close_price DECIMAL(12,2) NOT NULL,
    total_traded_qty BIGINT,
    turnover_lacs DECIMAL(18,2),
    no_of_trades INTEGER,
    delivery_qty BIGINT,
    delivery_percent DECIMAL(5,2),
    data_source VARCHAR(50) DEFAULT 'NSE_BHAV',
    file_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_security FOREIGN KEY (symbol) REFERENCES security(symbol) ON DELETE CASCADE,
    CONSTRAINT fk_daily_series FOREIGN KEY (code) REFERENCES series(code),
    CONSTRAINT uq_daily_data UNIQUE (symbol, trading_date)
);


-- ----------------------------------------------------------------------------
-- Table: weekly_analysis_data
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS weekly_analysis_data (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    code VARCHAR(5),
    year INTEGER NOT NULL,
    week_number INTEGER NOT NULL,
    open_price DECIMAL(12,2) NOT NULL,
    high_price DECIMAL(12,2) NOT NULL,
    low_price DECIMAL(12,2) NOT NULL,
    close_price DECIMAL(12,2) NOT NULL,
    total_traded_qty BIGINT,
    total_turnover_lacs DECIMAL(18,2),
    no_of_trading_days INTEGER,
    total_trades INTEGER,
    total_delivery_qty BIGINT,
    avg_delivery_percent DECIMAL(5,2),
    prev_week_close DECIMAL(12,2),
    week_over_week_change DECIMAL(12,2),
    week_over_week_change_pct DECIMAL(8,2),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_weekly_security FOREIGN KEY (symbol) REFERENCES security(symbol) ON DELETE CASCADE,
    CONSTRAINT uq_weekly_data UNIQUE (symbol, year, week_number)
);


-- ----------------------------------------------------------------------------
-- Table: monthly_analysis_data
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS monthly_analysis_data (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    code VARCHAR(5),
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    month_name VARCHAR(10),
    month_start_date DATE NOT NULL,
    month_end_date DATE NOT NULL,
    open_price DECIMAL(12,2) NOT NULL,
    high_price DECIMAL(12,2) NOT NULL,
    low_price DECIMAL(12,2) NOT NULL,
    close_price DECIMAL(12,2) NOT NULL,
    total_traded_qty BIGINT,
    total_turnover_lacs DECIMAL(18,2),
    avg_daily_turnover DECIMAL(18,2),
    no_of_trading_days INTEGER,
    total_trades BIGINT,
    total_delivery_qty BIGINT,
    avg_delivery_percent DECIMAL(5,2),
    volatility DECIMAL(8,4),
    prev_month_close DECIMAL(12,2),
    month_over_month_change DECIMAL(12,2),
    month_over_month_change_pct DECIMAL(8,2),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_monthly_security FOREIGN KEY (symbol) REFERENCES security(symbol) ON DELETE CASCADE,
    CONSTRAINT uq_monthly_data UNIQUE (symbol, year, month)
);


-- ----------------------------------------------------------------------------
-- Table: returns_analysis (Comprehensive returns and risk metrics)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS returns_analysis (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    calculation_date DATE NOT NULL,
    current_price DECIMAL(12,2) NOT NULL,
    
    -- Simple returns (percentage)
    return_1d DECIMAL(10,4),
    return_1w DECIMAL(10,4),
    return_1m DECIMAL(10,4),
    return_3m DECIMAL(10,4),
    return_6m DECIMAL(10,4),
    return_1y DECIMAL(10,4),
    return_2y DECIMAL(10,4),
    return_3y DECIMAL(10,4),
    return_5y DECIMAL(10,4),
    return_ytd DECIMAL(10,4),
    
    -- Logarithmic returns
    log_return_1d DECIMAL(10,6),
    log_return_1w DECIMAL(10,6),
    log_return_1m DECIMAL(10,6),
    log_return_3m DECIMAL(10,6),
    log_return_1y DECIMAL(10,6),
    
    -- Volatility metrics (annualized %)
    volatility_30d DECIMAL(8,4),
    volatility_90d DECIMAL(8,4),
    volatility_1y DECIMAL(8,4),
    
    -- Risk-adjusted metrics
    sharpe_ratio_1y DECIMAL(8,4),
    max_drawdown_1y DECIMAL(10,4),
    
    -- Reference prices for validation
    price_1d_ago DECIMAL(12,2),
    price_1w_ago DECIMAL(12,2),
    price_1m_ago DECIMAL(12,2),
    price_1y_ago DECIMAL(12,2),
    
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_returns_security FOREIGN KEY (symbol) REFERENCES security(symbol) ON DELETE CASCADE,
    CONSTRAINT uq_returns_data UNIQUE (symbol, calculation_date)
);

CREATE INDEX IF NOT EXISTS idx_returns_symbol ON returns_analysis(symbol);
CREATE INDEX IF NOT EXISTS idx_returns_date ON returns_analysis(calculation_date);
CREATE INDEX IF NOT EXISTS idx_returns_1y ON returns_analysis(return_1y DESC);
CREATE INDEX IF NOT EXISTS idx_returns_sharpe ON returns_analysis(sharpe_ratio_1y DESC);
