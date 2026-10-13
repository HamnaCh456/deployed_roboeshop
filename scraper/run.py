#!/usr/bin/env python
"""RobotEshop scraping pipeline - command line entry point.

You supply URLs; the pipeline detects the platform, deep-crawls, extracts every
field it can, derives the fields the vendor never states, and writes everything
to SQLite plus JSON/CSV exports.

    python run.py https://robo.pk
    python run.py https://robo.pk https://roboticpk.com --images
    python run.py --from-config            # crawl every site in config.yaml
    python run.py https://robo.pk --limit 10 --no-deep --fresh

No API key is required and nothing is billed per page: extraction is CSS and
regex driven throughout.
"""

from __future__ import annotations

import argparse
import sys
import traceback
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).parent))

# The Windows console defaults to cp1252, which cannot encode the characters
# real product titles contain - shop.unitree.com ships "Unitree H1（Contact us
# for the real price）" with full-width parentheses. Printing that raises
# UnicodeEncodeError and kills the run *after* the crawl has already been paid
# for. Exports were always written as UTF-8; this makes stdout match.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

from robotshop.adapters import pick_adapter          # noqa: E402
from robotshop.enrich import enrich                  # noqa: E402
from robotshop.export import (download_images, export_csv, export_json,   # noqa: E402
                              export_ui_products_csv, write_report)
from robotshop.http import Fetcher                   # noqa: E402
from robotshop.models import Robot                   # noqa: E402
from robotshop.store import Store                    # noqa: E402

ROOT = Path(__file__).parent
CONFIG_PATH = ROOT / "config.yaml"


def load_config() -> dict:
    if CONFIG_PATH.exists():
        return yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8")) or {}
    return {}


def crawl_site(url: str, fetcher: Fetcher, store: Store, args,
               site_config: dict) -> list[Robot]:
    print(f"\n=== {url} ===")
    adapter_name, adapter = pick_adapter(fetcher, url, args.adapter or
                                         site_config.get("adapter"))
    print(f"  adapter: {adapter_name}")

    run_id = store.start_run(url, adapter_name)

    kwargs = {"deep": not args.no_deep, "limit": args.limit}
    if adapter_name == "generic":
        kwargs.update(
            max_depth=site_config.get("max_depth", args.max_depth),
            max_pages=site_config.get("max_pages", args.max_pages),
            delay=args.delay,
        )
    elif adapter_name == "magento":
        kwargs["search"] = site_config.get("search", args.search)

    try:
        robots = adapter.scrape(fetcher, url, **kwargs)
    except Exception:
        traceback.print_exc()
        store.finish_run(run_id, 0, 0, 0, 1, "adapter raised")
        return []

    print(f"  enriching {len(robots)} products (category, platform, skill, ...)")
    for robot in robots:
        try:
            enrich(robot)
        except Exception as exc:
            robot.extraction_warnings.append(f"enrich_failed:{exc}")

    new = updated = unchanged = 0
    for robot in robots:
        try:
            status, robot_id = store.upsert(robot)
            robot.raw_payload = None          # keep exports lean
            new += status == "new"
            updated += status == "updated"
            unchanged += status == "unchanged"
        except Exception as exc:
            print(f"    ! store failed for {robot.source_url}: {exc}")

    print(f"  stored: {new} new, {updated} updated, {unchanged} unchanged")
    store.finish_run(run_id, len(robots), new, updated, fetcher.stats["errors"])
    return robots


def main() -> int:
    parser = argparse.ArgumentParser(
        description="RobotEshop scraper - give it URLs, get a normalized catalog.")
    parser.add_argument("urls", nargs="*", help="site or category URLs to crawl")
    parser.add_argument("--from-config", action="store_true",
                        help="crawl every enabled site listed in config.yaml")
    parser.add_argument("--from-html", metavar="PATH",
                        help="parse product pages you saved from your own browser "
                             "(a .html file or a folder of them) - for sites that "
                             "block automated access, e.g. robotshop.com")
    parser.add_argument("--adapter",
                        choices=["shopify", "woocommerce", "magento",
                                 "catalog_site", "generic"],
                        help="force an adapter instead of auto-detecting")
    parser.add_argument("--search", default="",
                        help="magento only: restrict the catalog to a search term")
    parser.add_argument("--limit", type=int, help="stop after N products per site")
    parser.add_argument("--no-deep", action="store_true",
                        help="skip the per-product page pass (faster, less data)")
    parser.add_argument("--images", action="store_true",
                        help="download product images into the UI's images folder")
    parser.add_argument("--fresh", action="store_true",
                        help="ignore the HTTP cache and refetch everything")
    parser.add_argument("--delay", type=float, default=1.0,
                        help="seconds between requests (default 1.0)")
    parser.add_argument("--max-depth", type=int, default=3,
                        help="generic adapter: link depth (default 3)")
    parser.add_argument("--max-pages", type=int, default=500,
                        help="generic adapter: page cap (default 500)")
    parser.add_argument("--out", default=str(ROOT / "data"),
                        help="output directory (default ./data)")
    args = parser.parse_args()

    config = load_config()
    sites = {}
    urls = list(args.urls)
    if args.from_config or not (urls or args.from_html):
        for site in config.get("sites", []):
            if site.get("enabled", True):
                urls.append(site["url"])
                sites[site["url"]] = site
    if not urls and not args.from_html:
        parser.error("give at least one URL, --from-html PATH, "
                     "or list sites in config.yaml")

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    fetcher = Fetcher(cache_dir=ROOT / ".cache", delay=args.delay,
                      use_cache=not args.fresh)
    store = Store(out_dir / "robots.db")

    all_robots: list[Robot] = []
    try:
        if args.from_html:
            from robotshop.adapters import local_html
            files = local_html.load_files(Path(args.from_html))
            print(f"\n=== saved HTML: {len(files)} file(s) from {args.from_html} ===")
            if not files:
                print("  no .html files found there")
            saved = local_html.scrape_files(files)
            for robot in saved:
                try:
                    enrich(robot)
                    store.upsert(robot)
                    robot.raw_payload = None
                except Exception as exc:
                    print(f"    ! {robot.source_url}: {exc}")
            all_robots += saved

        for url in urls:
            all_robots += crawl_site(url, fetcher, store, args, sites.get(url, {}))

        if not all_robots:
            print("\nNo products extracted.")
            return 1

        print(f"\n=== exporting {len(all_robots)} robots ===")
        if args.images:
            image_dir = Path(config.get("image_dir",
                                        ROOT.parent / "ui" / "public" / "images"))
            download_images(all_robots, fetcher, image_dir)
            # Persist the local paths recorded during download.
            for robot in all_robots:
                row = store.conn.execute(
                    "SELECT id FROM robots WHERE source_url = ?",
                    (robot.source_url,)).fetchone()
                if row:
                    for image in robot.images:
                        if image.local_path:
                            store.set_image_local_path(row["id"], image.url,
                                                       image.local_path)

        export_json(all_robots, out_dir / "robots.json")
        export_csv(all_robots, out_dir / "robots.csv")
        export_ui_products_csv(all_robots, out_dir / "products.csv")
        report = write_report(all_robots, out_dir / "report.txt")

        print("\n" + report)
        print("\nDatabase stats:", store.stats())
        print(f"\nHTTP: {fetcher.stats['network']} network, "
              f"{fetcher.stats['cache']} cached, {fetcher.stats['errors']} errors")
        return 0
    finally:
        fetcher.close()
        store.close()


if __name__ == "__main__":
    raise SystemExit(main())
