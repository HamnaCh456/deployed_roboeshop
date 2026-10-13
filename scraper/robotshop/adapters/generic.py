"""Generic deep-crawl adapter, built on crawl4ai.

Used for any site that is not a Shopify/WooCommerce storefront with a JSON API -
sites where the only way in is to walk the links and read rendered HTML. This is
the path for RoboticPK, IndusRoboTix and anything else added later.

Cost note: extraction here uses `JsonCssExtractionStrategy`, which is pure CSS
selectors evaluated locally. crawl4ai *also* ships `LLMExtractionStrategy`, which
would call OpenAI and bill per page. We deliberately never use it. The pipeline
has no API key and no per-page cost, by design.

crawl4ai drives a real Chromium via Playwright, so JavaScript-rendered catalogs
(infinite scroll, client-side price widgets) still yield their data.
"""

from __future__ import annotations

import asyncio
import hashlib
import re
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from ..models import Image, PricePoint, Robot
from ..parse_specs import normalize_specs, parse_description

# Selector candidates, tried in order. Different themes name things differently,
# so each field lists several fallbacks rather than assuming one layout.
PRODUCT_SELECTORS = {
    "name": ["h1.product_title", "h1.product-title", "h1.entry-title",
             ".product-name h1", "h1[itemprop='name']", "h1"],
    "price": ["p.price .woocommerce-Price-amount bdi", ".price .amount",
              "[itemprop='price']", ".product-price", ".price", ".money"],
    "compare_at": ["p.price del .amount", ".price del", ".compare-at-price",
                   ".was-price"],
    "sku": [".sku", "[itemprop='sku']", ".product_meta .sku"],
    "brand": ["[itemprop='brand']", ".product-brand", ".brand"],
    "stock": [".stock", ".availability", "[itemprop='availability']"],
    "description": ["#tab-description", ".woocommerce-Tabs-panel--description",
                    ".product-description", "[itemprop='description']",
                    ".product__description", ".rte"],
    "categories": [".posted_in a", ".product_meta a[rel='tag']",
                   ".breadcrumb a", ".breadcrumbs a"],
    "images": [".woocommerce-product-gallery__image img", ".product-gallery img",
               "[itemprop='image']", ".product__media img"],
}

# URL shapes that look like a product page across common store platforms.
PRODUCT_URL_PATTERNS = ["*/product/*", "*/products/*", "*/shop/*/*", "*/item/*",
                        "*product_id*", "*/p/*"]


def _first_text(soup: BeautifulSoup, selectors: list[str]) -> str | None:
    for sel in selectors:
        node = soup.select_one(sel)
        if node:
            text = node.get_text(" ", strip=True)
            if text:
                return text
    return None


def _parse_price(text: str | None) -> float | None:
    if not text:
        return None
    # Grab the first number, tolerating "Rs. 1,250.00" / "PKR 1250" / "₨1,250".
    m = re.search(r"(\d[\d,]*\.?\d*)", text.replace(" ", ""))
    if not m:
        return None
    try:
        return float(m.group(1).replace(",", ""))
    except ValueError:
        return None


def _detect_currency(text: str | None) -> str:
    if not text:
        return "PKR"
    lowered = text.lower()
    if "rs" in lowered or "pkr" in lowered or "₨" in text:
        return "PKR"
    if "$" in text or "usd" in lowered:
        return "USD"
    if "€" in text or "eur" in lowered:
        return "EUR"
    return "PKR"


def _build_robot(url: str, html: str, site: str) -> Robot | None:
    soup = BeautifulSoup(html, "lxml")

    name = _first_text(soup, PRODUCT_SELECTORS["name"])
    if not name:
        return None

    price_text = _first_text(soup, PRODUCT_SELECTORS["price"])
    desc_node = None
    for sel in PRODUCT_SELECTORS["description"]:
        desc_node = soup.select_one(sel)
        if desc_node:
            break
    desc_html = desc_node.decode() if desc_node else None
    parsed = parse_description(desc_html)

    images: list[Image] = []
    for sel in PRODUCT_SELECTORS["images"]:
        for pos, img in enumerate(soup.select(sel), 1):
            src = img.get("data-src") or img.get("data-large_image") or img.get("src")
            if src and not src.startswith("data:"):
                full = urljoin(url, src)
                if full not in [i.url for i in images]:
                    images.append(Image(url=full, alt=img.get("alt"), position=pos))
        if images:
            break

    categories = []
    for sel in PRODUCT_SELECTORS["categories"]:
        for a in soup.select(sel):
            text = a.get_text(strip=True)
            if text and text.lower() not in ("home", "shop") and text not in categories:
                categories.append(text)
        if categories:
            break

    stock_text = _first_text(soup, PRODUCT_SELECTORS["stock"])
    in_stock = None
    if stock_text:
        in_stock = "out of stock" not in stock_text.lower() and "sold out" not in stock_text.lower()

    videos = [
        (src if src.startswith("http") else f"https:{src}")
        for iframe in soup.find_all("iframe")
        if (src := iframe.get("src") or "")
        and any(h in src for h in ("youtube.com", "youtu.be", "vimeo.com"))
    ]

    robot = Robot(
        source_site=site,
        source_url=url,
        handle=urlparse(url).path.rstrip("/").rsplit("/", 1)[-1] or None,
        name=name,
        brand=_first_text(soup, PRODUCT_SELECTORS["brand"]),
        sku=_first_text(soup, PRODUCT_SELECTORS["sku"]),
        source_categories=categories,
        description_html=desc_html,
        description_text=parsed["text"],
        specs_raw=dict(parsed["specs_raw"]),
        specs=dict(parsed["specs"]),
        features=list(parsed["bullets"]),
        price=_parse_price(price_text),
        compare_at_price=_parse_price(_first_text(soup, PRODUCT_SELECTORS["compare_at"])),
        currency=_detect_currency(price_text),
        in_stock=in_stock,
        availability_text=stock_text,
        images=images,
        primary_image=images[0].url if images else None,
        video_urls=videos,
        seller_name=site,
        seller_url=f"https://{site}",
    )

    # Spec tables anywhere on the page (WooCommerce "Additional information").
    for row in soup.find_all("tr"):
        cells = row.find_all(["td", "th"])
        if len(cells) == 2:
            key = cells[0].get_text(" ", strip=True)
            value = cells[1].get_text(" ", strip=True)
            if key and value and len(key) < 60:
                robot.specs_raw.setdefault(key, value)
    robot.specs = normalize_specs(robot.specs_raw)

    if robot.price and robot.compare_at_price and robot.compare_at_price > robot.price:
        robot.discount_pct = round(
            (robot.compare_at_price - robot.price) / robot.compare_at_price * 100, 2)

    robot.price_history = [PricePoint(price=robot.price,
                                      compare_at_price=robot.compare_at_price,
                                      currency=robot.currency, in_stock=robot.in_stock)]
    payload = f"{robot.name}|{robot.price}|{robot.description_text}"
    robot.content_hash = hashlib.sha256(payload.encode()).hexdigest()[:32]
    if not robot.specs_raw:
        robot.extraction_warnings.append("no_specs_found")
    if robot.price is None:
        robot.extraction_warnings.append("no_price")
    return robot


async def _deep_crawl(base_url: str, max_depth: int, max_pages: int,
                      delay: float) -> list[tuple[str, str]]:
    from crawl4ai import (AsyncWebCrawler, BFSDeepCrawlStrategy, BrowserConfig,
                          CacheMode, CrawlerRunConfig, DomainFilter, FilterChain,
                          URLPatternFilter)

    domain = urlparse(base_url).netloc
    filter_chain = FilterChain([
        DomainFilter(allowed_domains=[domain, domain.replace("www.", "")]),
        URLPatternFilter(patterns=PRODUCT_URL_PATTERNS + ["*/collections/*",
                                                          "*/category/*",
                                                          "*/shop*", "*page*"]),
    ])

    run_config = CrawlerRunConfig(
        deep_crawl_strategy=BFSDeepCrawlStrategy(
            max_depth=max_depth,
            include_external=False,
            filter_chain=filter_chain,
            max_pages=max_pages,
        ),
        cache_mode=CacheMode.BYPASS,
        stream=False,
        mean_delay=delay,
        page_timeout=45000,
        verbose=False,
    )

    pages: list[tuple[str, str]] = []
    async with AsyncWebCrawler(config=BrowserConfig(headless=True, verbose=False)) as crawler:
        results = await crawler.arun(url=base_url, config=run_config)
        for result in results if isinstance(results, list) else [results]:
            if getattr(result, "success", False) and getattr(result, "html", None):
                pages.append((result.url, result.html))
    return pages


def scrape(fetcher, base_url: str, deep: bool = True, limit: int | None = None,
           max_depth: int = 3, max_pages: int = 500, delay: float = 1.0) -> list[Robot]:
    site = urlparse(base_url).netloc.replace("www.", "")
    print(f"  [generic] crawl4ai deep crawl of {site} (depth={max_depth}, cap={max_pages})")

    try:
        pages = asyncio.run(_deep_crawl(base_url, max_depth, max_pages, delay))
    except Exception as exc:
        print(f"  [generic] crawl4ai failed ({exc}); falling back to single page")
        html = fetcher.get_text(base_url)
        pages = [(base_url, html)] if html else []

    print(f"  [generic] {len(pages)} pages fetched; identifying product pages")

    robots: list[Robot] = []
    seen: set[str] = set()
    for url, html in pages:
        if url in seen:
            continue
        seen.add(url)
        try:
            robot = _build_robot(url, html, site)
        except Exception as exc:
            print(f"    ! parse error {url}: {exc}")
            continue
        # A page with a name but no price is usually a category page, not a product.
        if robot and (robot.price is not None or robot.specs_raw):
            robots.append(robot)
            if limit and len(robots) >= limit:
                break

    print(f"  [generic] {len(robots)} product pages extracted")
    return robots
