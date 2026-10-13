"""Shopify adapter.

Shopify publishes its own catalog as JSON on every storefront:

    /products.json                        -> full catalog, paginated
    /collections.json                     -> collection list
    /collections/<handle>/products.json   -> membership, i.e. real categories
    /products/<handle>.js                 -> per-product, includes stock counts

Reading those is strictly better than scraping rendered HTML: it is complete,
already structured, cheap, and it puts far less load on the vendor. We still
deep-crawl the product pages afterwards, because breadcrumbs, spec tables added
by Shopify apps, embedded videos and stock wording live only in the HTML.

robots.txt on robo.pk explicitly permits crawling product and collection pages.
"""

from __future__ import annotations

import hashlib
import json
import re
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from ..http import Fetcher
from ..models import Image, PricePoint, Robot, Variant
from ..parse_specs import clean_html, html_to_text, parse_description


def detect(fetcher: Fetcher, base_url: str) -> bool:
    html = fetcher.get_text(base_url)
    if not html:
        return False
    return "cdn.shopify.com" in html or "Shopify.theme" in html or "shopify" in html.lower()


def _to_float(value) -> float | None:
    if value is None:
        return None
    try:
        return float(str(value).replace(",", "").strip())
    except ValueError:
        return None


def shop_currency(fetcher: Fetcher, base: str) -> str | None:
    """The store's own currency, from Shopify's `/meta.json`.

    products.json states prices as bare decimal strings and never says what
    currency they are in. `Robot.currency` defaults to PKR, which is right for
    the Pakistani stores and silently wrong for shop.unitree.com - it would have
    filed a USD 13,500 humanoid as 13,500 rupees, and then compared it against
    genuinely-PKR rows. One request per store settles it.
    """
    meta = fetcher.get_json(urljoin(base, "/meta.json"))
    if isinstance(meta, dict) and isinstance(meta.get("currency"), str):
        return meta["currency"].upper()
    return None


def _collection_map(fetcher: Fetcher, base: str) -> dict[int, list[str]]:
    """product id -> the collections it belongs to.

    This is the only real source of category on robo.pk, since every product
    ships with an empty `product_type` and no tags.
    """
    mapping: dict[int, list[str]] = {}
    data = fetcher.get_json(urljoin(base, "/collections.json?limit=250"))
    if not data:
        return mapping

    for coll in data.get("collections", []):
        handle = coll.get("handle")
        title = coll.get("title") or handle
        if not handle or not coll.get("products_count"):
            continue
        page = 1
        while page <= 20:
            url = urljoin(base, f"/collections/{handle}/products.json?limit=250&page={page}")
            payload = fetcher.get_json(url)
            products = (payload or {}).get("products", [])
            if not products:
                break
            for product in products:
                mapping.setdefault(product["id"], []).append(title)
            page += 1
    return mapping


def list_products(fetcher: Fetcher, base: str) -> list[dict]:
    products: list[dict] = []
    page = 1
    while page <= 40:
        payload = fetcher.get_json(urljoin(base, f"/products.json?limit=250&page={page}"))
        batch = (payload or {}).get("products", [])
        if not batch:
            break
        products.extend(batch)
        page += 1
    return products


def _enrich_from_product_page(fetcher: Fetcher, robot: Robot) -> None:
    """Second pass over the rendered page for what the JSON endpoint omits."""
    html = fetcher.get_text(robot.source_url)
    if not html:
        robot.extraction_warnings.append("product_page_unreachable")
        return
    soup = BeautifulSoup(html, "lxml")

    # Breadcrumbs give a human-facing category path.
    crumbs = [
        a.get_text(strip=True)
        for a in soup.select('nav[aria-label*="readcrumb" i] a, .breadcrumb a, .breadcrumbs a')
        if a.get_text(strip=True)
    ]
    # The last crumb is the product itself, not a category. Left in, it made
    # "Unitree A1 Motor" its own collection, and every such pseudo-category is
    # then fed to the classifier and the keyword haystack as if the vendor had
    # filed the product somewhere.
    for crumb in crumbs:
        if crumb.lower() in ("home", "all products"):
            continue
        if crumb.strip().lower() == (robot.name or "").strip().lower():
            continue
        if crumb not in robot.source_categories:
            robot.source_categories.append(crumb)

    # JSON-LD is the most reliable place for availability and rating.
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            blob = json.loads(tag.string or "{}")
        except (json.JSONDecodeError, TypeError):
            continue
        for node in blob if isinstance(blob, list) else [blob]:
            if not isinstance(node, dict) or node.get("@type") != "Product":
                continue
            offers = node.get("offers")
            offer = offers[0] if isinstance(offers, list) and offers else offers
            if isinstance(offer, dict):
                availability = str(offer.get("availability", ""))
                if availability:
                    robot.availability_text = availability.rsplit("/", 1)[-1]
                    robot.in_stock = "InStock" in availability
                robot.currency = offer.get("priceCurrency") or robot.currency
            if node.get("sku"):
                robot.sku = robot.sku or str(node["sku"])
            brand = node.get("brand")
            if isinstance(brand, dict) and brand.get("name"):
                robot.brand = robot.brand or brand["name"]

    # Embedded tutorial/demo videos, which is exactly the content the proposal
    # says these stores fail to provide - so any hit here is valuable.
    for iframe in soup.find_all("iframe"):
        src = iframe.get("src") or ""
        if any(host in src for host in ("youtube.com", "youtu.be", "vimeo.com")):
            full = src if src.startswith("http") else f"https:{src}"
            if full not in robot.video_urls:
                robot.video_urls.append(full)

    # Spec tables injected by Shopify apps live outside body_html.
    for table in soup.select("table"):
        for row in table.find_all("tr"):
            cells = row.find_all(["td", "th"])
            if len(cells) == 2:
                key = cells[0].get_text(" ", strip=True)
                value = cells[1].get_text(" ", strip=True)
                if key and value and len(key) < 60:
                    robot.specs_raw.setdefault(key, value)

    # Stock wording ("Only 3 left") never appears in products.json.
    text = soup.get_text(" ", strip=True)
    m = re.search(r"only\s+(\d+)\s+(?:left|in stock|remaining)", text, re.IGNORECASE)
    if m:
        robot.stock_qty = int(m.group(1))
    elif re.search(r"\bsold out\b|\bout of stock\b", text, re.IGNORECASE):
        robot.in_stock = False


def _exact_stock(fetcher: Fetcher, base: str, robot: Robot) -> None:
    """/products/<handle>.js exposes inventory_quantity that products.json hides."""
    if not robot.handle:
        return
    data = fetcher.get_json(urljoin(base, f"/products/{robot.handle}.js"))
    if not isinstance(data, dict):
        return
    total = 0
    seen = False
    for variant in data.get("variants", []):
        qty = variant.get("inventory_quantity")
        if isinstance(qty, int):
            total += max(qty, 0)
            seen = True
    if seen and robot.stock_qty is None:
        robot.stock_qty = total


def scrape(fetcher: Fetcher, base_url: str, deep: bool = True,
           limit: int | None = None) -> list[Robot]:
    parsed = urlparse(base_url)
    base = f"{parsed.scheme}://{parsed.netloc}"
    site = parsed.netloc.replace("www.", "")

    print(f"  [shopify] catalog for {site}")
    currency = shop_currency(fetcher, base)
    print(f"  [shopify] shop currency: {currency or 'unstated, keeping default'}")
    raw_products = list_products(fetcher, base)
    print(f"  [shopify] {len(raw_products)} products in products.json")

    print("  [shopify] mapping collections -> categories")
    collections = _collection_map(fetcher, base)
    print(f"  [shopify] {len(collections)} products have a collection")

    if limit:
        raw_products = raw_products[:limit]

    robots: list[Robot] = []
    for index, raw in enumerate(raw_products, 1):
        handle = raw.get("handle")
        url = urljoin(base, f"/products/{handle}")

        variants = []
        for v in raw.get("variants", []):
            options = {}
            for i in (1, 2, 3):
                val = v.get(f"option{i}")
                if val and val != "Default Title":
                    options[f"option{i}"] = val
            variants.append(Variant(
                variant_id=str(v.get("id")) if v.get("id") else None,
                title=v.get("title"),
                sku=v.get("sku") or None,
                price=_to_float(v.get("price")),
                compare_at_price=_to_float(v.get("compare_at_price")),
                available=v.get("available"),
                grams=v.get("grams"),
                options=options,
            ))

        images = [
            Image(url=img.get("src", ""), alt=img.get("alt"), position=img.get("position"),
                  width=img.get("width"), height=img.get("height"))
            for img in raw.get("images", []) if img.get("src")
        ]

        parsed_desc = parse_description(raw.get("body_html"))
        cheapest = min((v.price for v in variants if v.price is not None), default=None)
        compare_at = next((v.compare_at_price for v in variants
                           if v.compare_at_price), None)
        in_stock = any(v.available for v in variants) if variants else None

        robot = Robot(
            source_site=site,
            source_url=url,
            source_product_id=str(raw.get("id")),
            handle=handle,
            name=raw.get("title") or "",
            vendor=raw.get("vendor"),
            product_type=raw.get("product_type") or None,
            source_categories=collections.get(raw.get("id"), []),
            tags=raw.get("tags") or [],
            description_html=raw.get("body_html"),
            description_text=parsed_desc["text"],
            specs_raw=dict(parsed_desc["specs_raw"]),
            specs=dict(parsed_desc["specs"]),
            features=list(parsed_desc["bullets"]),
            price=cheapest,
            compare_at_price=compare_at,
            **({"currency": currency} if currency else {}),
            in_stock=in_stock,
            variants=variants,
            images=images,
            primary_image=images[0].url if images else None,
            sku=next((v.sku for v in variants if v.sku), None),
            weight_grams=next((float(v.grams) for v in variants if v.grams), None),
            seller_name=raw.get("vendor") or site,
            seller_url=base,
            raw_payload=raw,
        )

        if deep:
            _enrich_from_product_page(fetcher, robot)
            _exact_stock(fetcher, base, robot)
            # Re-normalize: the page pass may have added spec rows.
            from ..parse_specs import normalize_specs
            robot.specs = normalize_specs(robot.specs_raw)

        if robot.price and robot.compare_at_price and robot.compare_at_price > robot.price:
            robot.discount_pct = round(
                (robot.compare_at_price - robot.price) / robot.compare_at_price * 100, 2)

        robot.price_history = [PricePoint(
            price=robot.price, compare_at_price=robot.compare_at_price,
            currency=robot.currency, in_stock=robot.in_stock)]

        payload = f"{robot.name}|{robot.price}|{robot.description_text}|{sorted(robot.specs_raw.items())}"
        robot.content_hash = hashlib.sha256(payload.encode()).hexdigest()[:32]

        if not robot.description_text:
            robot.extraction_warnings.append("empty_description")
        if not robot.specs_raw:
            robot.extraction_warnings.append("no_specs_found")
        if robot.price is None:
            robot.extraction_warnings.append("no_price")

        robots.append(robot)
        if index % 20 == 0 or index == len(raw_products):
            print(f"    {index}/{len(raw_products)} parsed")

    return robots
