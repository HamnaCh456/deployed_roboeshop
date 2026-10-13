"""Parse product pages you saved from your own browser.

This exists for sites the pipeline is not able to fetch. robotshop.com is the
case in point: Cloudflare bot management answers the scraper, a headless browser
and even `/robots.txt` with HTTP 403, so there is no legitimate automated route
in and no way to read their stated crawl policy.

Opening the page yourself and saving it (Ctrl+S, "Webpage, Complete" or
"Webpage, HTML Only") is a normal human visit. Feeding that file here gets the
product into the catalog with every derived field the other adapters produce,
without the pipeline pretending to be a browser it is not.

    python run.py --from-html saved/thymio.html
    python run.py --from-html saved/            # every .html in the folder

The real source URL is recovered from the page's own canonical/og:url tag, so
rows land under the correct `source_site` and join price comparison normally.
"""

from __future__ import annotations

from pathlib import Path
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from ..models import Robot
from .generic import _build_robot


def _origin_url(html: str, fallback: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    for finder in (
        lambda: (soup.find("link", rel="canonical") or {}).get("href"),
        lambda: (soup.find("meta", attrs={"property": "og:url"}) or {}).get("content"),
    ):
        try:
            value = finder()
        except AttributeError:
            value = None
        if value and value.startswith("http"):
            return value
    return fallback


def load_files(path: Path) -> list[Path]:
    path = Path(path)
    if path.is_dir():
        return sorted(p for p in path.rglob("*") if p.suffix.lower() in (".html", ".htm"))
    return [path] if path.exists() else []


def scrape_files(paths: list[Path]) -> list[Robot]:
    robots: list[Robot] = []
    for file_path in paths:
        try:
            html = file_path.read_text(encoding="utf-8", errors="replace")
        except OSError as exc:
            print(f"    ! cannot read {file_path}: {exc}")
            continue

        url = _origin_url(html, fallback=file_path.resolve().as_uri())
        site = urlparse(url).netloc.replace("www.", "") or "local"

        try:
            robot = _build_robot(url, html, site)
        except Exception as exc:
            print(f"    ! parse error {file_path.name}: {exc}")
            continue

        if robot is None:
            print(f"    ! no product found in {file_path.name} "
                  f"(is it a saved product page?)")
            continue

        robot.extraction_warnings.append("from_saved_html")
        robots.append(robot)
        print(f"    parsed {file_path.name} -> {robot.name[:60]} "
              f"({robot.price if robot.price is not None else 'no price'})")

    return robots
