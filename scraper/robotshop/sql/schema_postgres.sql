-- RobotEshop scraped-catalog schema (PostgreSQL, per the proposal's stack).
-- Same shape as schema_sqlite.sql, with real JSONB, arrays and full-text search.

CREATE TABLE IF NOT EXISTS robots (
    id                    BIGSERIAL PRIMARY KEY,
    source_site           TEXT    NOT NULL,
    source_url            TEXT    NOT NULL UNIQUE,
    source_product_id     TEXT,
    handle                TEXT,
    scraped_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    content_hash          TEXT,

    name                  TEXT    NOT NULL,
    brand                 TEXT,
    vendor                TEXT,
    sku                   TEXT,
    model_number          TEXT,
    product_type          TEXT,
    category              TEXT,
    subcategory           TEXT,
    source_categories     TEXT[]  DEFAULT '{}',
    tags                  TEXT[]  DEFAULT '{}',

    description_html      TEXT,
    description_text      TEXT,
    summary               TEXT,
    features              TEXT[]  DEFAULT '{}',
    applications          TEXT[]  DEFAULT '{}',

    price                 NUMERIC(12,2),
    compare_at_price      NUMERIC(12,2),
    discount_pct          NUMERIC(5,2),
    currency              TEXT    DEFAULT 'PKR',
    in_stock              BOOLEAN,
    stock_qty             INTEGER,
    availability_text     TEXT,

    primary_image         TEXT,
    video_urls            TEXT[]  DEFAULT '{}',

    specs_raw             JSONB   DEFAULT '{}'::jsonb,
    specs                 JSONB   DEFAULT '{}'::jsonb,

    operating_voltage     TEXT,
    input_voltage         TEXT,
    interface             TEXT[]  DEFAULT '{}',
    connectivity          TEXT[]  DEFAULT '{}',
    sensors               TEXT[]  DEFAULT '{}',
    processor             TEXT,
    dimensions            TEXT,
    weight_grams          NUMERIC(10,2),
    degrees_of_freedom    INTEGER,
    motor_type            TEXT,
    battery               TEXT,
    max_speed             TEXT,
    payload               TEXT,

    supported_os          TEXT[]  DEFAULT '{}',
    supported_platforms   TEXT[]  DEFAULT '{}',
    programming_languages TEXT[]  DEFAULT '{}',
    ides_tools            TEXT[]  DEFAULT '{}',
    ros_support           BOOLEAN,
    ros_version           TEXT,

    age_min               INTEGER,
    age_max               INTEGER,
    skill_level           TEXT CHECK (skill_level IN ('beginner','intermediate','advanced')),
    use_case              TEXT[]  DEFAULT '{}',

    seller_name           TEXT,
    seller_url            TEXT,
    seller_verified       BOOLEAN,
    warranty              TEXT,
    shipping_info         TEXT,
    return_policy         TEXT,

    match_key             TEXT,

    tutorial_videos       JSONB   DEFAULT '[]'::jsonb,
    documentation_links   JSONB   DEFAULT '[]'::jsonb,
    community_links       JSONB   DEFAULT '[]'::jsonb,
    getting_started_guide TEXT,
    editor_notes          TEXT,
    enrichment_status     TEXT    DEFAULT 'pending',

    extraction_warnings   TEXT[]  DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_robots_site      ON robots(source_site);
CREATE INDEX IF NOT EXISTS idx_robots_category  ON robots(category, subcategory);
CREATE INDEX IF NOT EXISTS idx_robots_match_key ON robots(match_key);
CREATE INDEX IF NOT EXISTS idx_robots_price     ON robots(price);
CREATE INDEX IF NOT EXISTS idx_robots_specs     ON robots USING GIN (specs);
CREATE INDEX IF NOT EXISTS idx_robots_platforms ON robots USING GIN (supported_platforms);

-- Powers the site's search box.
CREATE INDEX IF NOT EXISTS idx_robots_fts ON robots
    USING GIN (to_tsvector('english',
        coalesce(name,'') || ' ' || coalesce(description_text,'') || ' ' ||
        coalesce(brand,'') || ' ' || coalesce(category,'')));

CREATE TABLE IF NOT EXISTS price_history (
    id               BIGSERIAL PRIMARY KEY,
    robot_id         BIGINT NOT NULL REFERENCES robots(id) ON DELETE CASCADE,
    observed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    price            NUMERIC(12,2),
    compare_at_price NUMERIC(12,2),
    currency         TEXT,
    in_stock         BOOLEAN
);
CREATE INDEX IF NOT EXISTS idx_price_history_robot ON price_history(robot_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS images (
    id         BIGSERIAL PRIMARY KEY,
    robot_id   BIGINT NOT NULL REFERENCES robots(id) ON DELETE CASCADE,
    url        TEXT NOT NULL,
    alt        TEXT,
    position   INTEGER,
    local_path TEXT,
    width      INTEGER,
    height     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_images_robot ON images(robot_id);

CREATE TABLE IF NOT EXISTS variants (
    id               BIGSERIAL PRIMARY KEY,
    robot_id         BIGINT NOT NULL REFERENCES robots(id) ON DELETE CASCADE,
    variant_id       TEXT,
    title            TEXT,
    sku              TEXT,
    price            NUMERIC(12,2),
    compare_at_price NUMERIC(12,2),
    available        BOOLEAN,
    grams            INTEGER,
    options          JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_variants_robot ON variants(robot_id);

CREATE TABLE IF NOT EXISTS crawl_runs (
    id               BIGSERIAL PRIMARY KEY,
    started_at       TIMESTAMPTZ,
    finished_at      TIMESTAMPTZ,
    source_url       TEXT,
    adapter          TEXT,
    products_found   INTEGER,
    products_new     INTEGER,
    products_updated INTEGER,
    errors           INTEGER,
    notes            TEXT
);

CREATE OR REPLACE VIEW v_price_comparison AS
SELECT match_key,
       COUNT(*)                     AS listing_count,
       MIN(price)                   AS best_price,
       MAX(price)                   AS worst_price,
       ROUND(AVG(price), 2)         AS avg_price,
       array_agg(DISTINCT source_site) AS sites
FROM robots
WHERE price IS NOT NULL AND match_key IS NOT NULL
GROUP BY match_key
HAVING COUNT(*) > 1;

CREATE OR REPLACE VIEW v_enrichment_queue AS
SELECT id, name, category, source_url, enrichment_status
FROM robots
WHERE enrichment_status = 'pending' OR tutorial_videos = '[]'::jsonb;
