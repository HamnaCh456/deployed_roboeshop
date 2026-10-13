"""WooCommerce adapter.

Many WooCommerce stores leave the Store API open at
`/wp-json/wc/store/v1/products`, which returns the whole catalog as JSON with no
authentication. Where that is true it is the same win as Shopify's products.json:
complete, structured, cheap, and gentle on the vendor's server.

Where it is closed (a 401/404), `detect()` returns False and the site falls
through to the crawl4ai generic adapter instead.
"""

from __future__ import annotations

import hashlib
import html
from urllib.parse import urljoin, urlparse

from ..http import Fetcher
from ..models import Image, PricePoint, Robot, Variant
from ..parse_specs import normalize_specs, parse_description

STORE_API = "/wp-json/wc/store/v1/products"


def _text(value: str | None) -> str:
    """Store API strings are HTML-escaped; product names are not HTML.

    83 of robostan.pk's 830 titles carry raw entities - "ST-Link V2 Programmer
    &#038; Debugger", "LCD 20&#215;4". Unescaped, they reach the CSV, the UI and
    the keyword matcher exactly like that.
    """
    return html.unescape(value).strip() if value else ""


def detect(fetcher: Fetcher, base_url: str) -> bool:
    parsed = urlparse(base_url)
    base = f"{parsed.scheme}://{parsed.netloc}"
    data = fetcher.get_json(urljoin(base, f"{STORE_API}?per_page=1"))
    return isinstance(data, list) and len(data) > 0


def _price(value, minor_unit: int = 2) -> float | None:
    """Store API returns integer minor units, e.g. 125000 for Rs 1250.00."""
    if value in (None, ""):
        return None
    try:
        return float(value) / (10 ** minor_unit)
    except (TypeError, ValueError):
        return None


def scrape(fetcher: Fetcher, base_url: str, deep: bool = True,
           limit: int | None = None) -> list[Robot]:
    parsed = urlparse(base_url)
    base = f"{parsed.scheme}://{parsed.netloc}"
    site = parsed.netloc.replace("www.", "")

    raw_products: list[dict] = []
    page = 1
    while page <= 40:
        data = fetcher.get_json(urljoin(base, f"{STORE_API}?per_page=100&page={page}"))
        if not isinstance(data, list) or not data:
            break
        raw_products.extend(data)
        page += 1

    print(f"  [woocommerce] {len(raw_products)} products via Store API")
    if limit:
        raw_products = raw_products[:limit]

    robots: list[Robot] = []
    for raw in raw_products:
        prices = raw.get("prices") or {}
        minor = prices.get("currency_minor_unit", 2)

        desc_html = raw.get("description") or raw.get("short_description")
        parsed_desc = parse_description(desc_html)

        images = [
            Image(url=img.get("src", ""), alt=img.get("alt"), position=i)
            for i, img in enumerate(raw.get("images", []), 1) if img.get("src")
        ]

        specs_raw = dict(parsed_desc["specs_raw"])
        # WooCommerce attributes are the vendor's own structured spec table.
        for attr in raw.get("attributes", []):
            name = attr.get("name")
            terms = ", ".join(t.get("name", "") for t in attr.get("terms", []))
            if name and terms:
                specs_raw.setdefault(name, terms)

        robot = Robot(
            source_site=site,
            source_url=raw.get("permalink") or base,
            source_product_id=str(raw.get("id")),
            handle=raw.get("slug"),
            name=_text(raw.get("name")),
            sku=raw.get("sku") or None,
            source_categories=[_text(c.get("name")) for c in raw.get("categories", [])
                               if c.get("name")],
            tags=[_text(t.get("name")) for t in raw.get("tags", []) if t.get("name")],
            description_html=desc_html,
            description_text=parsed_desc["text"],
            specs_raw=specs_raw,
            specs=normalize_specs(specs_raw),
            features=list(parsed_desc["bullets"]),
            price=_price(prices.get("price"), minor),
            compare_at_price=_price(prices.get("regular_price"), minor),
            currency=prices.get("currency_code") or "PKR",
            in_stock=raw.get("is_in_stock"),
            stock_qty=raw.get("stock_quantity"),
            images=images,
            primary_image=images[0].url if images else None,
            variants=[Variant(variant_id=str(v.get("id")), title=str(v.get("attributes")))
                      for v in raw.get("variations", [])],
            seller_name=site,
            seller_url=base,
            raw_payload=raw,
        )

        if robot.price and robot.compare_at_price and robot.compare_at_price > robot.price:
            robot.discount_pct = round(
                (robot.compare_at_price - robot.price) / robot.compare_at_price * 100, 2)

        robot.price_history = [PricePoint(price=robot.price,
                                          compare_at_price=robot.compare_at_price,
                                          currency=robot.currency,
                                          in_stock=robot.in_stock)]
        payload = f"{robot.name}|{robot.price}|{robot.description_text}"
        robot.content_hash = hashlib.sha256(payload.encode()).hexdigest()[:32]
        if not robot.specs_raw:
            robot.extraction_warnings.append("no_specs_found")
        robots.append(robot)

    return robots
