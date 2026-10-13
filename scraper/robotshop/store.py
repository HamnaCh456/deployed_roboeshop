"""SQLite persistence with upsert-by-URL semantics.

Re-running the pipeline must be safe. A product is identified by its
`source_url`; on a second run an existing row is updated in place, and a new
`price_history` row is appended only when the price actually moved. That is what
turns repeated crawls into the price-trend data the proposal asks for.

Editorial fields (tutorial_videos, documentation_links, editor_notes, ...) are
never overwritten by a crawl - scraping must not wipe human work.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .models import Robot

SCHEMA_PATH = Path(__file__).parent / "sql" / "schema_sqlite.sql"

# Columns written straight from the model as JSON text.
_JSON_COLUMNS = [
    "source_categories", "tags", "features", "applications", "video_urls",
    "specs_raw", "specs", "interface", "connectivity", "sensors", "supported_os",
    "supported_platforms", "programming_languages", "ides_tools", "use_case",
    "extraction_warnings",
]

_SCALAR_COLUMNS = [
    "source_site", "source_url", "source_product_id", "handle", "scraped_at",
    "content_hash", "name", "brand", "vendor", "sku", "model_number",
    "product_type", "category", "subcategory", "description_html",
    "description_text", "summary", "price", "compare_at_price", "discount_pct",
    "currency", "in_stock", "stock_qty", "availability_text", "primary_image",
    "operating_voltage", "input_voltage", "processor", "dimensions",
    "weight_grams", "degrees_of_freedom", "motor_type", "battery", "max_speed",
    "payload", "ros_support", "ros_version", "age_min", "age_max", "skill_level",
    "seller_name", "seller_url", "seller_verified", "warranty", "shipping_info",
    "return_policy", "match_key",
]

# Written once on insert, then left alone so a re-crawl never destroys them.
_EDITORIAL_COLUMNS = [
    "tutorial_videos", "documentation_links", "community_links",
    "getting_started_guide", "editor_notes", "enrichment_status",
]


class Store:
    def __init__(self, db_path: Path) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")
        self.conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        self.conn.commit()

    # -- helpers ----------------------------------------------------------
    @staticmethod
    def _row_values(robot: Robot) -> dict:
        data = robot.model_dump()
        row = {col: data.get(col) for col in _SCALAR_COLUMNS}
        for col in _JSON_COLUMNS:
            row[col] = json.dumps(data.get(col) or ([] if col not in ("specs", "specs_raw") else {}),
                                  ensure_ascii=False)
        for key in ("in_stock", "ros_support", "seller_verified"):
            if row.get(key) is not None:
                row[key] = int(bool(row[key]))
        return row

    # -- writes -----------------------------------------------------------
    def upsert(self, robot: Robot) -> tuple[str, int]:
        """Insert or update one robot. Returns ('new'|'updated'|'unchanged', id)."""
        cur = self.conn.cursor()
        existing = cur.execute(
            "SELECT id, content_hash, price FROM robots WHERE source_url = ?",
            (robot.source_url,),
        ).fetchone()

        row = self._row_values(robot)

        if existing is None:
            editorial = {
                "tutorial_videos": json.dumps(robot.tutorial_videos, ensure_ascii=False),
                "documentation_links": json.dumps(robot.documentation_links, ensure_ascii=False),
                "community_links": json.dumps(robot.community_links, ensure_ascii=False),
                "getting_started_guide": robot.getting_started_guide,
                "editor_notes": robot.editor_notes,
                "enrichment_status": robot.enrichment_status,
            }
            row.update(editorial)
            cols = list(row)
            cur.execute(
                f"INSERT INTO robots ({', '.join(cols)}) "
                f"VALUES ({', '.join('?' * len(cols))})",
                [row[c] for c in cols],
            )
            robot_id = cur.lastrowid
            status = "new"
        else:
            robot_id = existing["id"]
            if existing["content_hash"] == robot.content_hash:
                status = "unchanged"
            else:
                status = "updated"
            # Editorial columns are intentionally absent from this SET list.
            cols = [c for c in row if c != "source_url"]
            cur.execute(
                f"UPDATE robots SET {', '.join(f'{c} = ?' for c in cols)} WHERE id = ?",
                [row[c] for c in cols] + [robot_id],
            )

        self._write_price_history(cur, robot_id, robot, existing)
        self._replace_children(cur, robot_id, robot)
        self.conn.commit()
        return status, robot_id

    @staticmethod
    def _write_price_history(cur, robot_id: int, robot: Robot, existing) -> None:
        last = cur.execute(
            "SELECT price, in_stock FROM price_history WHERE robot_id = ? "
            "ORDER BY observed_at DESC LIMIT 1", (robot_id,)).fetchone()
        in_stock = int(bool(robot.in_stock)) if robot.in_stock is not None else None
        # Only record a point when something actually changed, so the table
        # stays a record of movements rather than of how often we ran.
        if last is not None and last["price"] == robot.price and last["in_stock"] == in_stock:
            return
        cur.execute(
            "INSERT INTO price_history (robot_id, observed_at, price, "
            "compare_at_price, currency, in_stock) VALUES (?, ?, ?, ?, ?, ?)",
            (robot_id, datetime.now(timezone.utc).isoformat(), robot.price,
             robot.compare_at_price, robot.currency, in_stock),
        )

    @staticmethod
    def _replace_children(cur, robot_id: int, robot: Robot) -> None:
        cur.execute("DELETE FROM images WHERE robot_id = ?", (robot_id,))
        cur.executemany(
            "INSERT INTO images (robot_id, url, alt, position, local_path, width, height) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            [(robot_id, i.url, i.alt, i.position, i.local_path, i.width, i.height)
             for i in robot.images],
        )
        cur.execute("DELETE FROM variants WHERE robot_id = ?", (robot_id,))
        cur.executemany(
            "INSERT INTO variants (robot_id, variant_id, title, sku, price, "
            "compare_at_price, available, grams, options) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [(robot_id, v.variant_id, v.title, v.sku, v.price, v.compare_at_price,
              int(v.available) if v.available is not None else None, v.grams,
              json.dumps(v.options, ensure_ascii=False))
             for v in robot.variants],
        )

    def start_run(self, source_url: str, adapter: str) -> int:
        cur = self.conn.cursor()
        cur.execute(
            "INSERT INTO crawl_runs (started_at, source_url, adapter) VALUES (?, ?, ?)",
            (datetime.now(timezone.utc).isoformat(), source_url, adapter))
        self.conn.commit()
        return cur.lastrowid

    def finish_run(self, run_id: int, found: int, new: int, updated: int,
                   errors: int, notes: str = "") -> None:
        self.conn.execute(
            "UPDATE crawl_runs SET finished_at = ?, products_found = ?, "
            "products_new = ?, products_updated = ?, errors = ?, notes = ? WHERE id = ?",
            (datetime.now(timezone.utc).isoformat(), found, new, updated, errors,
             notes, run_id))
        self.conn.commit()

    def set_image_local_path(self, robot_id: int, url: str, path: str) -> None:
        self.conn.execute(
            "UPDATE images SET local_path = ? WHERE robot_id = ? AND url = ?",
            (path, robot_id, url))
        self.conn.commit()

    # -- reads ------------------------------------------------------------
    def stats(self) -> dict:
        cur = self.conn.cursor()
        one = lambda q: cur.execute(q).fetchone()[0]  # noqa: E731
        return {
            "total": one("SELECT COUNT(*) FROM robots"),
            "with_price": one("SELECT COUNT(*) FROM robots WHERE price IS NOT NULL"),
            "with_specs": one("SELECT COUNT(*) FROM robots WHERE specs_raw NOT IN ('{}','')"),
            "categorized": one("SELECT COUNT(*) FROM robots WHERE category IS NOT NULL"),
            "in_stock": one("SELECT COUNT(*) FROM robots WHERE in_stock = 1"),
            "with_images": one("SELECT COUNT(*) FROM robots WHERE primary_image IS NOT NULL"),
            "sites": one("SELECT COUNT(DISTINCT source_site) FROM robots"),
            "price_points": one("SELECT COUNT(*) FROM price_history"),
        }

    def close(self) -> None:
        self.conn.close()
