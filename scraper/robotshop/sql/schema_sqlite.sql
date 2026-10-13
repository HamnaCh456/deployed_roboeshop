-- RobotEshop scraped-catalog schema (SQLite, development).
-- Mirrors sql/schema_postgres.sql so migrating is a connection-string change.

CREATE TABLE IF NOT EXISTS robots (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    source_site           TEXT    NOT NULL,
    source_url            TEXT    NOT NULL UNIQUE,
    source_product_id     TEXT,
    handle                TEXT,
    scraped_at            TEXT    NOT NULL,
    content_hash          TEXT,

    name                  TEXT    NOT NULL,
    brand                 TEXT,
    vendor                TEXT,
    sku                   TEXT,
    model_number          TEXT,
    product_type          TEXT,
    category              TEXT,
    subcategory           TEXT,
    source_categories     TEXT,     -- JSON array
    tags                  TEXT,     -- JSON array

    description_html      TEXT,
    description_text      TEXT,
    summary               TEXT,
    features              TEXT,     -- JSON array
    applications          TEXT,     -- JSON array

    price                 REAL,
    compare_at_price      REAL,
    discount_pct          REAL,
    currency              TEXT DEFAULT 'PKR',
    in_stock              INTEGER,  -- 0/1/NULL
    stock_qty             INTEGER,
    availability_text     TEXT,

    primary_image         TEXT,
    video_urls            TEXT,     -- JSON array

    specs_raw             TEXT,     -- JSON object, verbatim from the page
    specs                 TEXT,     -- JSON object, normalized keys

    operating_voltage     TEXT,
    input_voltage         TEXT,
    interface             TEXT,     -- JSON array
    connectivity          TEXT,     -- JSON array
    sensors               TEXT,     -- JSON array
    processor             TEXT,
    dimensions            TEXT,
    weight_grams          REAL,
    degrees_of_freedom    INTEGER,
    motor_type            TEXT,
    battery               TEXT,
    max_speed             TEXT,
    payload               TEXT,

    supported_os          TEXT,     -- JSON array
    supported_platforms   TEXT,     -- JSON array
    programming_languages TEXT,     -- JSON array
    ides_tools            TEXT,     -- JSON array
    ros_support           INTEGER,
    ros_version           TEXT,

    age_min               INTEGER,
    age_max               INTEGER,
    skill_level           TEXT,
    use_case              TEXT,     -- JSON array

    seller_name           TEXT,
    seller_url            TEXT,
    seller_verified       INTEGER,
    warranty              TEXT,
    shipping_info         TEXT,
    return_policy         TEXT,

    match_key             TEXT,

    -- Editorial layer: empty after a crawl, filled by a later pass.
    tutorial_videos       TEXT,     -- JSON array
    documentation_links   TEXT,     -- JSON array
    community_links       TEXT,     -- JSON array
    getting_started_guide TEXT,
    editor_notes          TEXT,
    enrichment_status     TEXT DEFAULT 'pending',

    extraction_warnings   TEXT      -- JSON array
);

CREATE INDEX IF NOT EXISTS idx_robots_site      ON robots(source_site);
CREATE INDEX IF NOT EXISTS idx_robots_category  ON robots(category);
CREATE INDEX IF NOT EXISTS idx_robots_match_key ON robots(match_key);
CREATE INDEX IF NOT EXISTS idx_robots_price     ON robots(price);
CREATE INDEX IF NOT EXISTS idx_robots_skill     ON robots(skill_level);

-- Every observation of a price, so trends survive re-crawls.
CREATE TABLE IF NOT EXISTS price_history (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    robot_id         INTEGER NOT NULL REFERENCES robots(id) ON DELETE CASCADE,
    observed_at      TEXT    NOT NULL,
    price            REAL,
    compare_at_price REAL,
    currency         TEXT,
    in_stock         INTEGER
);
CREATE INDEX IF NOT EXISTS idx_price_history_robot ON price_history(robot_id, observed_at);

CREATE TABLE IF NOT EXISTS images (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    robot_id   INTEGER NOT NULL REFERENCES robots(id) ON DELETE CASCADE,
    url        TEXT NOT NULL,
    alt        TEXT,
    position   INTEGER,
    local_path TEXT,
    width      INTEGER,
    height     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_images_robot ON images(robot_id);

CREATE TABLE IF NOT EXISTS variants (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    robot_id         INTEGER NOT NULL REFERENCES robots(id) ON DELETE CASCADE,
    variant_id       TEXT,
    title            TEXT,
    sku              TEXT,
    price            REAL,
    compare_at_price REAL,
    available        INTEGER,
    grams            INTEGER,
    options          TEXT   -- JSON object
);
CREATE INDEX IF NOT EXISTS idx_variants_robot ON variants(robot_id);

-- Audit trail: one row per pipeline run.
CREATE TABLE IF NOT EXISTS crawl_runs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at     TEXT,
    finished_at    TEXT,
    source_url     TEXT,
    adapter        TEXT,
    products_found INTEGER,
    products_new   INTEGER,
    products_updated INTEGER,
    errors         INTEGER,
    notes          TEXT
);

-- Same product across sites, ready for the comparison view.
CREATE VIEW IF NOT EXISTS v_price_comparison AS
SELECT match_key,
       COUNT(*)                AS listing_count,
       MIN(price)              AS best_price,
       MAX(price)              AS worst_price,
       ROUND(AVG(price), 2)    AS avg_price,
       GROUP_CONCAT(source_site, ', ') AS sites
FROM robots
WHERE price IS NOT NULL AND match_key IS NOT NULL
GROUP BY match_key
HAVING COUNT(*) > 1;

-- What still needs the editorial pass the proposal calls for.
CREATE VIEW IF NOT EXISTS v_enrichment_queue AS
SELECT id, name, category, source_url, enrichment_status
FROM robots
WHERE enrichment_status = 'pending'
   OR tutorial_videos IN ('[]', '')
   OR tutorial_videos IS NULL;
