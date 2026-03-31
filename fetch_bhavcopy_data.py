"""
NSE Bhavcopy Data Fetcher and Database Populator
=================================================
Fetches NSE Bhavcopy CSV data for a given date range, populates daily_stock_data,
then automatically triggers weekly/monthly aggregations and returns calculation.

Usage:
  python fetch_bhavcopy_data.py                  # interactive mode
  python fetch_bhavcopy_data.py --scheduled      # headless (Task Scheduler / cron)
  python fetch_bhavcopy_data.py --setup-scheduler  # create .bat + print setup steps

Config file : config.json  (same folder as script)
Log file    : bhavcopy_fetch.log (same folder as script)
"""

import os
import sys
import csv
import json
import zipfile
import requests
import logging
from datetime import datetime, timedelta, date as date_type
from typing import List, Dict, Optional, Tuple
from io import StringIO, BytesIO
import psycopg2
from psycopg2.extras import execute_values
from psycopg2.extensions import connection

# ---------------------------------------------------------------------------
# Logging
# File handler always uses UTF-8.
# Stream handler uses the system default but with errors='replace' so Windows
# CP1252 terminals never crash on special characters.
# ---------------------------------------------------------------------------
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE    = os.path.join(_SCRIPT_DIR, 'bhavcopy_fetch.log')

_file_handler   = logging.FileHandler(LOG_FILE, encoding='utf-8')
_stream_handler = logging.StreamHandler(sys.stdout)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[_file_handler, _stream_handler]
)
logger = logging.getLogger(__name__)


# ===========================================================================
# SECTION 1 : BHAVCOPY FETCHER
# ===========================================================================

class BhavcopyFetcher:
    """Downloads and parses NSE Bhavcopy CSV files."""

    # New format (Aug 2024–present): plain CSV
    BASE_URL = (
        "https://nsearchives.nseindia.com/products/content/"
        "sec_bhavdata_full_{date}.csv"
    )

    # Old format (up to ~Jul 2024): ZIP containing CSV with different columns
    # URL parts: year=YYYY, month=JAN, date_str=04JAN2016
    OLD_URL = (
        "https://nsearchives.nseindia.com/content/historical/EQUITIES/"
        "{year}/{month}/cm{date_str}bhav.csv.zip"
    )

    # Transition date: new format became available around 2024-08-01.
    # For any date before this, we use the old ZIP format.
    NEW_FORMAT_START = datetime(2024, 8, 1)

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': (
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                'AppleWebKit/537.36 (KHTML, like Gecko) '
                'Chrome/120.0.0.0 Safari/537.36'
            ),
            'Accept':          'text/html,application/xhtml+xml,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection':      'keep-alive',
            'Referer':         'https://www.nseindia.com/',
        })

    def fetch_bhavcopy(self, date: datetime) -> Optional[str]:
        """
        Download bhavcopy CSV for one date.
        Tries new format first (Aug 2024+); falls back to old ZIP format for
        older dates. Returns CSV string, or None if unavailable.
        """
        if date >= self.NEW_FORMAT_START:
            return self._fetch_new_format(date)
        else:
            return self._fetch_old_format(date)

    def _fetch_new_format(self, date: datetime) -> Optional[str]:
        """Fetch plain CSV (Aug 2024–present)."""
        url = self.BASE_URL.format(date=date.strftime('%d%m%Y'))
        try:
            logger.info(f"Fetching {date.strftime('%Y-%m-%d')} [new format] ...")
            response = self.session.get(url, timeout=30)
            if response.status_code == 404:
                logger.warning(f"  404 for {date.strftime('%Y-%m-%d')} - holiday or market closed")
                return None
            response.raise_for_status()
            if not response.text.strip().startswith('SYMBOL'):
                logger.error(f"  Unexpected content for {date.strftime('%Y-%m-%d')}")
                return None
            logger.info(f"  [OK] Fetched {date.strftime('%Y-%m-%d')}")
            return response.text
        except requests.exceptions.HTTPError as e:
            logger.error(f"  HTTP error for {date.strftime('%Y-%m-%d')}: {e}")
            return None
        except requests.exceptions.RequestException as e:
            logger.error(f"  Network error for {date.strftime('%Y-%m-%d')}: {e}")
            return None
        except Exception as e:
            logger.error(f"  Unexpected error for {date.strftime('%Y-%m-%d')}: {e}")
            return None

    def _fetch_old_format(self, date: datetime) -> Optional[str]:
        """Fetch old ZIP format (up to ~Jul 2024)."""
        date_str = date.strftime('%d') + date.strftime('%b').upper() + date.strftime('%Y')
        url = self.OLD_URL.format(
            year=date.strftime('%Y'),
            month=date.strftime('%b').upper(),
            date_str=date_str
        )
        try:
            logger.info(f"Fetching {date.strftime('%Y-%m-%d')} [old ZIP format] ...")
            response = self.session.get(url, timeout=30)
            if response.status_code == 404:
                logger.warning(f"  404 for {date.strftime('%Y-%m-%d')} - holiday or market closed")
                return None
            response.raise_for_status()
            # Extract CSV from ZIP
            with zipfile.ZipFile(BytesIO(response.content)) as zf:
                csv_filename = zf.namelist()[0]
                csv_content  = zf.read(csv_filename).decode('utf-8', errors='replace')
            logger.info(f"  [OK] Fetched {date.strftime('%Y-%m-%d')} (ZIP → {csv_filename})")
            return csv_content
        except requests.exceptions.HTTPError as e:
            logger.error(f"  HTTP error for {date.strftime('%Y-%m-%d')}: {e}")
            return None
        except requests.exceptions.RequestException as e:
            logger.error(f"  Network error for {date.strftime('%Y-%m-%d')}: {e}")
            return None
        except zipfile.BadZipFile as e:
            logger.error(f"  Bad ZIP for {date.strftime('%Y-%m-%d')}: {e}")
            return None
        except Exception as e:
            logger.error(f"  Unexpected error for {date.strftime('%Y-%m-%d')}: {e}")
            return None

    def parse_bhavcopy(self, csv_content: str) -> List[Dict]:
        """
        Parse a bhavcopy CSV string into a list of record dicts.
        Auto-detects old vs new format by inspecting the header row.
        """
        # Peek at the first header to detect format
        first_line = csv_content.strip().split('\n')[0]
        if 'TOTTRDVAL' in first_line or 'PREVCLOSE' in first_line:
            return self._parse_old_bhavcopy(csv_content)
        return self._parse_new_bhavcopy(csv_content)

    def _parse_new_bhavcopy(self, csv_content: str) -> List[Dict]:
        """Parse new format (Aug 2024+): sec_bhavdata_full_DDMMYYYY.csv"""
        records = []
        reader  = csv.DictReader(StringIO(csv_content), skipinitialspace=True)

        # NSE headers sometimes have trailing spaces — normalise all keys once.
        if reader.fieldnames:
            reader.fieldnames = [f.strip() for f in reader.fieldnames]

        for row in reader:
            try:
                if not row.get('SYMBOL', '').strip():
                    continue
                deliv_per_raw = self._dec(row.get('DELIV_PER'))
                record = {
                    'symbol':        row['SYMBOL'].strip(),
                    'series':        row.get('SERIES', '').strip(),
                    'date':          row.get('DATE1', '').strip(),
                    'prev_close':    self._dec(row.get('PREV_CLOSE')),
                    'open_price':    self._dec(row.get('OPEN_PRICE')),
                    'high_price':    self._dec(row.get('HIGH_PRICE')),
                    'low_price':     self._dec(row.get('LOW_PRICE')),
                    'last_price':    self._dec(row.get('LAST_PRICE')),
                    'close_price':   self._dec(row.get('CLOSE_PRICE')),
                    'ttl_trd_qnty':  self._int(row.get('TTL_TRD_QNTY')),
                    'turnover_lacs': self._dec(row.get('TURNOVER_LACS')),
                    'no_of_trades':  self._int(row.get('NO_OF_TRADES')),
                    'deliv_qty':     self._int(row.get('DELIV_QTY')),
                    # DECIMAL(5,2) max = 999.99 — round to 2dp to avoid overflow
                    'deliv_per':     round(deliv_per_raw, 2) if deliv_per_raw is not None else None,
                }
                if record['symbol'] and record['series'] and record['close_price'] is not None:
                    records.append(record)
            except Exception as e:
                logger.warning(f"  Skipping malformed row: {e}")
        logger.info(f"  Parsed {len(records)} valid records [new format]")
        return records

    def _parse_old_bhavcopy(self, csv_content: str) -> List[Dict]:
        """
        Parse old ZIP format (up to ~Jul 2024).
        Old columns: SYMBOL, SERIES, OPEN, HIGH, LOW, CLOSE, LAST, PREVCLOSE,
                     TOTTRDQTY, TOTTRDVAL, TIMESTAMP, TOTALTRADES, ISIN
        Key differences:
          - TOTTRDVAL is in RUPEES → divide by 100,000 to get Lakhs
          - No DELIV_QTY, DELIV_PER, NO_OF_TRADES (set to None)
          - Date from TIMESTAMP column (format: DD-MMM-YYYY e.g. 04-JAN-2016)
        """
        records = []
        reader  = csv.DictReader(StringIO(csv_content), skipinitialspace=True)

        # Normalise header keys — strip any accidental whitespace.
        if reader.fieldnames:
            reader.fieldnames = [f.strip() for f in reader.fieldnames]

        for row in reader:
            try:
                if not row.get('SYMBOL', '').strip():
                    continue
                # TOTTRDVAL is in Rupees — convert to Lakhs (÷ 100,000)
                tottrdval  = self._dec(row.get('TOTTRDVAL'))
                turnover_lacs = round(tottrdval / 100000, 4) if tottrdval is not None else None

                record = {
                    'symbol':        row['SYMBOL'].strip(),
                    'series':        row.get('SERIES', '').strip(),
                    'date':          row.get('TIMESTAMP', '').strip(),  # DD-MMM-YYYY
                    'prev_close':    self._dec(row.get('PREVCLOSE')),
                    'open_price':    self._dec(row.get('OPEN')),
                    'high_price':    self._dec(row.get('HIGH')),
                    'low_price':     self._dec(row.get('LOW')),
                    'last_price':    self._dec(row.get('LAST')),
                    'close_price':   self._dec(row.get('CLOSE')),
                    'ttl_trd_qnty':  self._int(row.get('TOTTRDQTY')),
                    'turnover_lacs': turnover_lacs,
                    'no_of_trades':  self._int(row.get('TOTALTRADES')),
                    'deliv_qty':     None,   # not in old format
                    'deliv_per':     None,   # not in old format
                }
                if record['symbol'] and record['series'] and record['close_price'] is not None:
                    records.append(record)
            except Exception as e:
                logger.warning(f"  Skipping malformed row: {e}")
        logger.info(f"  Parsed {len(records)} valid records [old format, delivery=NULL]")
        return records

    @staticmethod
    def _dec(v) -> Optional[float]:
        if not v or str(v).strip() in ('', '-', 'null', 'NULL'):
            return None
        try:
            return float(str(v).strip())
        except (ValueError, AttributeError):
            return None

    @staticmethod
    def _int(v) -> Optional[int]:
        if not v or str(v).strip() in ('', '-', 'null', 'NULL'):
            return None
        try:
            return int(float(str(v).strip()))
        except (ValueError, AttributeError):
            return None


# ===========================================================================
# SECTION 2 : DATABASE POPULATOR
# ===========================================================================

class DatabasePopulator:
    """Handles all database interactions."""

    def __init__(self, db_config: Dict):
        self.db_config = db_config
        self.conn: Optional[connection] = None

    # ---- connection management -------------------------------------------

    def connect(self, autocommit: bool = False):
        """Open a connection. autocommit=True for procedure calls."""
        self.conn = psycopg2.connect(**self.db_config)
        self.conn.autocommit = autocommit
        mode = "autocommit" if autocommit else "manual-commit"
        logger.info(f"DB connected ({mode})")

    def disconnect(self):
        if hasattr(self, '_ref_conn') and not self._ref_conn.closed:
            self._ref_conn.close()
        if self.conn and not self.conn.closed:
            self.conn.close()
            logger.info("DB disconnected")

    def _set_autocommit(self, value: bool):
        if self.conn:
            self.conn.autocommit = value

    # ---- reference data -------------------------------------------------

    def _get_ref_conn(self):
        """
        Return a dedicated autocommit connection for reference-data writes
        (series + security). Using a separate connection means these inserts
        are immediately committed and NEVER rolled back when the main data
        connection rolls back on a bulk-insert failure.
        """
        if not hasattr(self, '_ref_conn') or self._ref_conn.closed:
            self._ref_conn = psycopg2.connect(**self.db_config)
            self._ref_conn.autocommit = True
        return self._ref_conn

    def _ensure_series(self, code: str):
        """Insert series code via the dedicated autocommit ref connection."""
        conn = self._get_ref_conn()
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO series (code, name, description, is_delivery_applicable) "
                "VALUES (%s, %s, %s, %s) ON CONFLICT (code) DO NOTHING",
                (code, f'Series {code}', f'Auto-created for {code}', True)
            )

    def _ensure_security(self, symbol: str, code: str):
        """Insert security row via the dedicated autocommit ref connection."""
        self._ensure_series(code)
        conn = self._get_ref_conn()
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO security (symbol, code, company_name, status) "
                "VALUES (%s, %s, %s, 'ACTIVE') "
                "ON CONFLICT (symbol) DO UPDATE "
                "SET code = EXCLUDED.code, updated_at = CURRENT_TIMESTAMP",
                (symbol, code, symbol)
            )

    def _ensure_all_series_and_securities(self, unique: Dict[str, Dict]):
        """
        Pre-insert ALL series + security rows for a batch via the autocommit
        ref connection. Because autocommit=True, every row is instantly visible
        to other connections — including the FK check in the bulk insert — and
        is NEVER rolled back if the bulk insert fails.
        """
        for r in unique.values():
            self._ensure_security(r['symbol'], r['series'])

    # ---- daily data insert -----------------------------------------------

    def insert_daily_data(
        self,
        records: List[Dict],
        trading_date: datetime
    ):
        """
        Bulk-upsert a day's bhavcopy records.
        De-duplicates within the file, preferring EQ series.
        Connection must be in manual-commit mode.
        """
        if not records:
            return

        unique: Dict[str, Dict] = {}
        for r in records:
            sym = r['symbol']
            if sym not in unique or r['series'] == 'EQ':
                unique[sym] = r

        logger.info(
            f"  Upserting {len(unique)} records for {trading_date.strftime('%Y-%m-%d')} "
            f"(from {len(records)})"
        )

        # Pre-insert and COMMIT all series + security reference rows first.
        # Without this commit, the FK constraint on daily_stock_data.code fails
        # for any series code that was just auto-created in this transaction
        # (e.g. NJ, NL, N8, NB, ND from old-format NSE data).
        self._ensure_all_series_and_securities(unique)

        rows = [
            (
                r['symbol'],        trading_date,    r['series'],
                r['prev_close'],    r['open_price'],  r['high_price'],
                r['low_price'],     r['last_price'],  r['close_price'],
                r['ttl_trd_qnty'],  r['turnover_lacs'], r['no_of_trades'],
                r['deliv_qty'],     r['deliv_per']
            )
            for r in unique.values()
        ]

        try:
            with self.conn.cursor() as cur:
                execute_values(cur, """
                    INSERT INTO daily_stock_data (
                        symbol, trading_date, code, prev_close,
                        open_price, high_price, low_price, last_price, close_price,
                        total_traded_qty, turnover_lacs, no_of_trades,
                        delivery_qty, delivery_percent
                    ) VALUES %s
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
                        delivery_percent = EXCLUDED.delivery_percent
                """, rows)
            self.conn.commit()
            logger.info(f"  [OK] {len(rows)} rows committed")
        except Exception as e:
            self.conn.rollback()
            logger.error(f"  Insert failed: {e}")
            raise

    # ---- stored procedure callers ----------------------------------------
    #
    # IMPORTANT — autocommit=True is REQUIRED when calling these procedures.
    #
    # All three SQL procedures contain internal COMMIT statements (they manage
    # their own transactions to allow partial progress on large datasets).
    # PostgreSQL raises "invalid transaction termination" if a procedure with
    # an internal COMMIT is called while the client connection is already
    # inside an open transaction (autocommit=False).
    #
    # Solution: switch the connection to autocommit=True before calling, then
    # switch back to autocommit=False for subsequent INSERT operations.

    def run_aggregation_queue(self, batch_size: int = 500):
        """
        Run sp_process_aggregation_queue — computes weekly + monthly aggregates
        for all dates queued since the last run.
        """
        logger.info("Running aggregation queue (weekly + monthly)...")
        self._set_autocommit(True)          # <-- required: procedure has internal COMMITs
        try:
            with self.conn.cursor() as cur:
                cur.execute("CALL sp_process_aggregation_queue(%s)", (batch_size,))
            logger.info("[OK] Aggregation queue complete")
        except Exception as e:
            logger.error(f"Aggregation error: {e}")
            raise
        finally:
            self._set_autocommit(False)     # restore for any subsequent inserts

    def run_returns_bulk(self, start_date: datetime, end_date: datetime):
        """
        Run sp_calculate_returns_bulk — fills returns_analysis for the full range.
        """
        sd = start_date.date() if isinstance(start_date, datetime) else start_date
        ed = end_date.date()   if isinstance(end_date,   datetime) else end_date
        logger.info(f"Calculating returns {sd} -> {ed} ...")
        self._set_autocommit(True)          # <-- required: procedure has internal COMMIT
        try:
            with self.conn.cursor() as cur:
                cur.execute("CALL sp_calculate_returns_bulk(%s, %s)", (sd, ed))
            logger.info("[OK] Returns calculation complete")
        except Exception as e:
            logger.error(f"Returns error: {e}")
            raise
        finally:
            self._set_autocommit(False)


# ===========================================================================
# SECTION 3 : CORE PIPELINE
# ===========================================================================

def run_pipeline(
    start_date: datetime,
    end_date: datetime,
    db_config: Dict,
    auto_aggregate: bool = True
) -> bool:
    """
    Full end-to-end pipeline:
      1. Fetch + insert daily bhavcopy data
      2. Weekly + monthly aggregations      (if auto_aggregate)
      3. Returns analysis (bulk)            (if auto_aggregate)
    Returns True on success, False on fatal failure.
    """
    logger.info("=" * 70)
    logger.info("PIPELINE START")
    logger.info(f"  Range : {start_date.strftime('%Y-%m-%d')} -> {end_date.strftime('%Y-%m-%d')}")
    logger.info(f"  Auto-aggregate : {auto_aggregate}")
    logger.info("=" * 70)

    fetcher   = BhavcopyFetcher()
    populator = DatabasePopulator(db_config)
    inserted  = 0
    skipped   = 0
    errors    = 0

    try:
        populator.connect(autocommit=False)
        current = start_date

        # ------------------------------------------------------------------
        # Steps 1 + 2 : fetch + insert
        # ------------------------------------------------------------------
        while current <= end_date:
            # Weekends are attempted too — NSE returns 404 for normal Sat/Sun
            # and 200 for genuine special trading sessions (e.g. Budget Day).
            # This means we never miss a special session without any manual config.
            if current.weekday() >= 5:
                logger.debug(f"  Weekend {current.strftime('%Y-%m-%d')} — attempting fetch (NSE decides)")

            csv_text = fetcher.fetch_bhavcopy(current)
            if csv_text is None:
                skipped += 1
                current += timedelta(days=1)
                continue

            records = fetcher.parse_bhavcopy(csv_text)
            if not records:
                logger.warning(f"  No valid records for {current.strftime('%Y-%m-%d')}")
                errors += 1
                current += timedelta(days=1)
                continue

            try:
                populator.insert_daily_data(records, current)
                inserted += 1
            except Exception as e:
                logger.error(f"  Insert failed for {current.strftime('%Y-%m-%d')}: {e}")
                errors += 1

            current += timedelta(days=1)

        # ------------------------------------------------------------------
        # Summary
        # ------------------------------------------------------------------
        logger.info("=" * 70)
        logger.info("FETCH SUMMARY")
        logger.info(f"  Inserted  : {inserted} days")
        logger.info(f"  Skipped   : {skipped}  days (holiday/weekend/404)")
        logger.info(f"  Errors    : {errors}   days")
        logger.info("=" * 70)

        if inserted == 0:
            logger.info("No new data — skipping aggregations.")
            return True

        if not auto_aggregate:
            logger.info("auto_aggregate=False — done.")
            return True

        # ------------------------------------------------------------------
        # Step 3 : weekly + monthly aggregations
        # (autocommit switch handled inside run_aggregation_queue)
        # ------------------------------------------------------------------
        logger.info("")
        logger.info("=" * 70)
        logger.info("STEP 3 : AGGREGATIONS (weekly + monthly)")
        logger.info("=" * 70)
        try:
            populator.run_aggregation_queue(batch_size=500)
        except Exception as e:
            logger.error(f"Aggregation failed: {e}")
            logger.warning("Daily data is safe. Re-run manually:")
            logger.warning("  CALL sp_process_aggregation_queue(500);")
            # Continue — returns are independent of aggregations

        # ------------------------------------------------------------------
        # Step 4 : returns analysis
        # (autocommit switch handled inside run_returns_bulk)
        # ------------------------------------------------------------------
        logger.info("")
        logger.info("=" * 70)
        logger.info("STEP 4 : RETURNS ANALYSIS")
        logger.info("=" * 70)
        try:
            populator.run_returns_bulk(start_date, end_date)
        except Exception as e:
            logger.error(f"Returns calculation failed: {e}")
            logger.warning("Re-run manually:")
            logger.warning(
                f"  CALL sp_calculate_returns_bulk("
                f"'{start_date.strftime('%Y-%m-%d')}', "
                f"'{end_date.strftime('%Y-%m-%d')}');"
            )

        logger.info("")
        logger.info("=" * 70)
        logger.info("PIPELINE COMPLETE")
        logger.info("=" * 70)
        return True

    except Exception as e:
        logger.error(f"FATAL pipeline error: {e}")
        return False
    finally:
        populator.disconnect()


# ===========================================================================
# SECTION 4 : HELPERS
# ===========================================================================

def parse_date(s: str) -> datetime:
    for fmt in ('%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y', '%Y/%m/%d'):
        try:
            return datetime.strptime(s.strip(), fmt)
        except ValueError:
            pass
    raise ValueError(f"Cannot parse '{s}'. Use YYYY-MM-DD or DD-MM-YYYY.")


def get_auto_date_range(db_config: Dict) -> Tuple[Optional[datetime], Optional[datetime], str]:
    """Determine start (day after last DB row) and end (today) automatically."""
    try:
        conn = psycopg2.connect(**db_config)
        cur  = conn.cursor()
        cur.execute("SELECT MAX(trading_date) FROM daily_stock_data;")
        last = cur.fetchone()[0]
        cur.close()
        conn.close()

        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

        if last is None:
            return datetime(2024, 1, 1), today, "empty DB — starting 2024-01-01"

        if isinstance(last, date_type) and not isinstance(last, datetime):
            last = datetime(last.year, last.month, last.day)

        return last + timedelta(days=1), today, f"continuing from {last.strftime('%Y-%m-%d')}"

    except Exception as e:
        return None, None, f"DB check failed: {e}"


def load_config(path: str) -> Optional[Dict]:
    try:
        with open(path, 'r') as f:
            cfg = json.load(f)
        if 'db_config' not in cfg:
            raise KeyError("'db_config' missing from config.json")
        return cfg
    except FileNotFoundError:
        return None
    except Exception as e:
        logger.error(f"Cannot load config: {e}")
        return None


# ===========================================================================
# SECTION 5 : INTERACTIVE MAIN
# ===========================================================================

def main():
    print("=" * 70)
    print("NSE BHAVCOPY DATA FETCHER")
    print("=" * 70)
    print()

    config_path          = os.path.join(_SCRIPT_DIR, 'config.json')
    db_config            = None
    start_date           = None
    end_date             = None
    auto_aggregate       = True
    special_trading_days = []

    # ---- Phase 1: config.json -------------------------------------------
    cfg = load_config(config_path)
    if cfg is not None:
        print(f"[OK] Loaded {config_path}")
        db_config            = cfg['db_config']
        auto_aggregate       = cfg.get('auto_aggregate', True)
        special_trading_days = cfg.get('special_trading_days', [])

        cfg_start = cfg.get('start_date', 'auto').strip()
        cfg_end   = cfg.get('end_date',   'auto').strip()

        if cfg_start.lower() in ('auto', '') or cfg_end.lower() in ('auto', ''):
            print("[AUTO] Detecting date range from database...")
            start_date, end_date, reason = get_auto_date_range(db_config)
            if start_date:
                print(f"  [OK] {reason}")
                print(f"  Range: {start_date.strftime('%Y-%m-%d')} -> {end_date.strftime('%Y-%m-%d')}")
            else:
                print(f"  [WARN] {reason} — will prompt for dates")
                start_date = end_date = None
        else:
            try:
                start_date = parse_date(cfg_start)
                end_date   = parse_date(cfg_end)
                print(
                    f"[CONFIG] Dates: "
                    f"{start_date.strftime('%Y-%m-%d')} -> {end_date.strftime('%Y-%m-%d')}"
                )
            except ValueError as e:
                print(f"[ERROR] Bad date in config.json: {e}")
                start_date = end_date = None
    else:
        print(f"[INFO] No config.json at {config_path}")

    print()

    # ---- Phase 2: prompt for DB if needed --------------------------------
    if db_config is None:
        print("Database configuration:")
        db_config = {
            'host':     input("  Host     [localhost]: ").strip() or 'localhost',
            'port':     input("  Port     [5432]     : ").strip() or '5432',
            'database': input("  Database [Stock_Data]: ").strip() or 'Stock_Data',
            'user':     input("  User     [postgres] : ").strip() or 'postgres',
            'password': input("  Password            : ").strip(),
        }
        print()

    # ---- Phase 3: prompt for dates if needed -----------------------------
    if start_date is None or end_date is None:
        print("Date range:")
        while True:
            try:
                start_date = parse_date(input("  Start (YYYY-MM-DD): ").strip())
                break
            except ValueError as e:
                print(f"  {e}")
        while True:
            try:
                end_date = parse_date(input("  End   (YYYY-MM-DD): ").strip())
                if end_date < start_date:
                    print("  End must be >= start.")
                    continue
                break
            except ValueError as e:
                print(f"  {e}")
        print()

    # ---- Confirm ---------------------------------------------------------
    print()
    print("=" * 70)
    print("CONFIGURATION")
    print("=" * 70)
    print(f"  Start Date          : {start_date.strftime('%Y-%m-%d')}")
    print(f"  End Date            : {end_date.strftime('%Y-%m-%d')}")
    print(f"  Database            : {db_config['user']}@{db_config['host']}:{db_config.get('port','5432')}/{db_config['database']}")
    print(f"  Auto-aggregate      : {auto_aggregate}")
    print(f"  Special trading days: {special_trading_days if special_trading_days else 'none'}")
    print("=" * 70)
    print()

    if input("Proceed? (yes/no): ").strip().lower() not in ('yes', 'y'):
        print("Cancelled.")
        return

    print()
    ok = run_pipeline(start_date, end_date, db_config, auto_aggregate, special_trading_days)

    if ok:
        print()
        print("[SUCCESS] Done. Check bhavcopy_fetch.log for details.")
        print()
        print("Useful queries:")
        print("  SELECT * FROM v_equity_stocks_latest;")
        print("  SELECT * FROM v_weekly_performance  LIMIT 20;")
        print("  SELECT * FROM v_monthly_performance LIMIT 20;")
        print("  SELECT * FROM v_returns_performance LIMIT 20;")
        print("  SELECT * FROM fn_get_queue_status();")
    else:
        print("[FAILED] Check bhavcopy_fetch.log for details.")
        sys.exit(1)


# ===========================================================================
# SECTION 6 : HEADLESS / SCHEDULED MODE
# ===========================================================================

def run_scheduled():
    """
    Fully headless — no prompts. Reads everything from config.json.
    Called by Task Scheduler / cron via:  python fetch_bhavcopy_data.py --scheduled
    """
    logger.info("=" * 70)
    logger.info("SCHEDULED RUN - %s", datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    logger.info("=" * 70)

    config_path = os.path.join(_SCRIPT_DIR, 'config.json')
    cfg         = load_config(config_path)
    if cfg is None:
        logger.error(f"config.json not found at {config_path} -- cannot run headless.")
        sys.exit(1)

    db_config            = cfg['db_config']
    auto_aggregate       = cfg.get('auto_aggregate', True)
    special_trading_days = cfg.get('special_trading_days', [])

    cfg_start = cfg.get('start_date', 'auto').strip()
    cfg_end   = cfg.get('end_date',   'auto').strip()

    if cfg_start.lower() in ('auto', '') or cfg_end.lower() in ('auto', ''):
        start_date, end_date, reason = get_auto_date_range(db_config)
        if not start_date:
            logger.error(f"Auto date detection failed: {reason}")
            sys.exit(1)
        logger.info(f"Date range: {reason}")
    else:
        try:
            start_date = parse_date(cfg_start)
            end_date   = parse_date(cfg_end)
        except ValueError as e:
            logger.error(f"Bad date in config.json: {e}")
            sys.exit(1)

    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    if start_date > today:
        logger.info("Start date is in the future — nothing to fetch.")
        sys.exit(0)

    ok = run_pipeline(start_date, end_date, db_config, auto_aggregate, special_trading_days)
    sys.exit(0 if ok else 1)


# ===========================================================================
# SECTION 7 : TASK SCHEDULER SETUP HELPER
# ===========================================================================

def setup_task_scheduler():
    """
    Creates run_bhavcopy_scheduled.bat and prints Windows Task Scheduler steps.
    """
    bat_path    = os.path.join(_SCRIPT_DIR, 'run_bhavcopy_scheduled.bat')
    script_path = os.path.abspath(__file__)
    python_path = sys.executable
    log_path    = os.path.join(_SCRIPT_DIR, 'scheduler.log')

    bat = (
        "@echo off\n"
        "REM ================================================================\n"
        "REM  NSE Bhavcopy Daily Auto-Fetch\n"
        "REM  Scheduled via Windows Task Scheduler.\n"
        "REM  Runs every weekday at 7:00 PM IST (after NSE close + ~3h delay)\n"
        "REM ================================================================\n"
        f'cd /d "{_SCRIPT_DIR}"\n'
        f'"{python_path}" "{script_path}" --scheduled >> "{log_path}" 2>&1\n'
    )

    with open(bat_path, 'w') as f:
        f.write(bat)

    ps_action  = f'$a = New-ScheduledTaskAction -Execute \\"{bat_path}\\"'
    ps_trigger = '$t = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At 19:00'
    ps_reg     = 'Register-ScheduledTask -TaskName "NSE Bhavcopy Daily" -Action $a -Trigger $t -RunLevel Highest'

    print()
    print("=" * 70)
    print("WINDOWS TASK SCHEDULER SETUP")
    print("=" * 70)
    print()
    print(f"[OK] Created: {bat_path}")
    print()
    print("OPTION A — Manual Task Scheduler setup:")
    print("  1. Open Task Scheduler (search Start menu)")
    print("  2. Create Basic Task  -> Name: 'NSE Bhavcopy Daily'")
    print("  3. Trigger: Weekly, Mon-Fri")
    print("  4. Time: 7:00 PM  (NSE closes 3:30 PM IST, data available ~6 PM)")
    print(f"  5. Action: Start a program -> {bat_path}")
    print("  6. Finish")
    print()
    print("OPTION B — One PowerShell command (run as Administrator):")
    print(f"  {ps_action}")
    print(f"  {ps_trigger}")
    print(f"  {ps_reg}")
    print()
    print("IMPORTANT: Make sure config.json has:")
    print('  "start_date": "auto"')
    print('  "end_date":   "auto"')
    print("  So each run picks up from the last DB date automatically.")
    print()
    print("Logs:")
    print(f"  Fetch detail : {LOG_FILE}")
    print(f"  Scheduler    : {log_path}")
    print("=" * 70)


# ===========================================================================
# ENTRY POINT
# ===========================================================================

if __name__ == "__main__":
    if '--scheduled' in sys.argv:
        run_scheduled()
    elif '--setup-scheduler' in sys.argv:
        setup_task_scheduler()
    else:
        main()