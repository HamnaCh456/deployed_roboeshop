"""Magento 2 adapter, via the public GraphQL endpoint.

instock.pk is Magento. Its REST API answers 401 and its sitemap times out, but
`/graphql` is open and unauthenticated - which is normal, because Magento's own
storefront JavaScript uses it. That endpoint hands over the entire 2,244-product
catalog with prices, stock, images, categories and descriptions, structured.

That makes it the same class of win as Shopify's products.json: no browser, no
LLM, no HTML guessing, and far less load on the vendor than crawling 2,244 pages.

Two quirks this adapter has to deal with:

  * Descriptions are Magento Page Builder output, wrapped in layout `<div>`s and
    an inline `<style>` block. Several were also pasted out of Google/ChatGPT and
    still carry `data-sfc-*` attributes and `<!--TgQPHd|||[]-->` comments. All of
    that is stripped before parsing, or every spec sheet fills with UI debris.
  * The catalog is not purely robotics - it also stocks 3D printers, components
    and even medical supplies. `--category` scopes a crawl to the relevant part
    of the tree rather than pulling all 2,244 rows.
"""

from __future__ import annotations

import hashlib
import re
from urllib.parse import urljoin, urlparse

from ..http import Fetcher
from ..models import Image, PricePoint, Robot
from ..parse_specs import normalize_specs, parse_description

DETECT_QUERY = '{products(search:"",pageSize:1){total_count}}'

# Everything worth having, in one round trip per page of 50.
PRODUCT_QUERY = """
query Catalog($pageSize: Int!, $page: Int!, $search: String!) {
  products(search: $search, pageSize: $pageSize, currentPage: $page) {
    total_count
    page_info { total_pages current_page }
    items {
      __typename sku name url_key uid
      stock_status only_x_left_in_stock
      short_description { html }
      description { html }
      image { url label }
      media_gallery { url label }
      categories { name url_path }
      price_range {
        minimum_price {
          regular_price { value currency }
          final_price { value currency }
          discount { amount_off percent_off }
        }
      }
      ... on PhysicalProductInterface { weight }
    }
  }
}
"""

CATEGORY_QUERY = """
{
  categoryList(filters: {}) {
    id name url_path
    children { id name url_path product_count
      children { id name url_path product_count } }
  }
}
"""

# Page Builder / pasted-from-a-chat-window debris.
_JUNK_ATTR = re.compile(r'\s(?:data-(?:pb-style|content-type|appearance|element|'
                        r'enable-parallax|parallax-speed|background-\w+|video-\w+|'
                        r'sfc-\w+|ved|hveid|complete|processed|sae|copy-service-\w+)|'
                        r'jsaction|jscontroller|jsuid)="[^"]*"', re.IGNORECASE)
_JUNK_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)


def _graphql_url(base_url: str) -> str:
    parsed = urlparse(base_url)
    return urljoin(f"{parsed.scheme}://{parsed.netloc}", "/graphql")


def detect(fetcher: Fetcher, base_url: str) -> bool:
    data = fetcher.post_json(_graphql_url(base_url), {"query": DETECT_QUERY},
                             cache_key="detect")
    return bool(data and (data.get("data") or {}).get("products"))


def _clean_pagebuilder(html: str | None) -> str | None:
    """Strip layout scaffolding so only the vendor's actual copy remains."""
    if not html:
        return None
    html = _JUNK_COMMENT.sub("", html)
    html = re.sub(r"(?is)<style.*?</style>", "", html)
    html = _JUNK_ATTR.sub("", html)
    html = re.sub(r'\sstyle="[^"]*"', "", html)
    html = re.sub(r'\sclass="[^"]*"', "", html)
    return html


def _price(node: dict | None) -> tuple[float | None, str | None]:
    if not isinstance(node, dict):
        return None, None
    value = node.get("value")
    return (float(value) if isinstance(value, (int, float)) else None,
            node.get("currency"))


def fetch_categories(fetcher: Fetcher, base_url: str) -> dict[str, int]:
    """url_path -> product_count, flattened over the tree."""
    data = fetcher.post_json(_graphql_url(base_url), {"query": CATEGORY_QUERY},
                             cache_key="categories")
    out: dict[str, int] = {}

    def walk(node: dict) -> None:
        path = node.get("url_path")
        if path:
            out[path] = node.get("product_count") or 0
        for child in node.get("children") or []:
            walk(child)

    for root in ((data or {}).get("data") or {}).get("categoryList") or []:
        walk(root)
    return out


def _build_robot(raw: dict, site: str, base: str) -> Robot | None:
    name = raw.get("name")
    if not name:
        return None

    url_key = raw.get("url_key") or ""
    url = urljoin(base, f"/{url_key}") if url_key else base

    price_node = ((raw.get("price_range") or {}).get("minimum_price") or {})
    final_price, currency = _price(price_node.get("final_price"))
    regular_price, _ = _price(price_node.get("regular_price"))
    discount = (price_node.get("discount") or {}).get("percent_off")

    description_html = _clean_pagebuilder(
        (raw.get("description") or {}).get("html")
        or (raw.get("short_description") or {}).get("html"))
    parsed = parse_description(description_html)

    images: list[Image] = []
    main = raw.get("image") or {}
    if main.get("url"):
        images.append(Image(url=main["url"], alt=main.get("label"), position=1))
    for index, media in enumerate(raw.get("media_gallery") or [], 2):
        if media.get("url") and media["url"] not in [i.url for i in images]:
            images.append(Image(url=media["url"], alt=media.get("label"),
                                position=index))

    categories = [c.get("name") for c in (raw.get("categories") or []) if c.get("name")]
    stock_status = raw.get("stock_status")

    weight = raw.get("weight")
    robot = Robot(
        source_site=site,
        source_url=url,
        source_product_id=str(raw.get("uid") or raw.get("sku") or ""),
        handle=url_key or None,
        name=name,
        sku=raw.get("sku") or None,
        source_categories=categories,
        description_html=description_html,
        description_text=parsed["text"],
        specs_raw=dict(parsed["specs_raw"]),
        specs=dict(parsed["specs"]),
        features=list(parsed["bullets"]),
        price=final_price,
        compare_at_price=regular_price if (regular_price and final_price
                                           and regular_price > final_price) else None,
        discount_pct=round(float(discount), 2) if discount else None,
        currency=currency or "PKR",
        in_stock=(stock_status == "IN_STOCK") if stock_status else None,
        stock_qty=raw.get("only_x_left_in_stock"),
        availability_text=stock_status,
        images=images,
        primary_image=images[0].url if images else None,
        weight_grams=float(weight) * 1000 if isinstance(weight, (int, float)) else None,
        seller_name=site,
        seller_url=base,
        raw_payload=raw,
    )

    robot.specs = normalize_specs(robot.specs_raw)
    robot.price_history = [PricePoint(price=robot.price,
                                      compare_at_price=robot.compare_at_price,
                                      currency=robot.currency,
                                      in_stock=robot.in_stock)]
    payload = f"{robot.name}|{robot.price}|{robot.description_text}"
    robot.content_hash = hashlib.sha256(payload.encode()).hexdigest()[:32]

    if not robot.description_text:
        robot.extraction_warnings.append("empty_description")
    if not robot.specs_raw:
        robot.extraction_warnings.append("no_specs_found")
    if robot.price is None:
        robot.extraction_warnings.append("no_price")
    return robot


def scrape(fetcher: Fetcher, base_url: str, deep: bool = True,
           limit: int | None = None, search: str = "",
           page_size: int = 50, **_ignored) -> list[Robot]:
    parsed = urlparse(base_url)
    base = f"{parsed.scheme}://{parsed.netloc}"
    site = parsed.netloc.replace("www.", "")
    endpoint = _graphql_url(base_url)

    print(f"  [magento] GraphQL catalog for {site}")
    robots: list[Robot] = []
    page = 1
    total_pages = 1

    while page <= total_pages:
        data = fetcher.post_json(
            endpoint,
            {"query": PRODUCT_QUERY,
             "variables": {"pageSize": page_size, "page": page, "search": search}},
            cache_key=f"products|{search}|{page_size}|{page}")

        products = ((data or {}).get("data") or {}).get("products")
        if not products:
            errors = (data or {}).get("errors")
            if errors:
                print(f"    ! GraphQL error on page {page}: {str(errors)[:160]}")
            break

        if page == 1:
            total = products.get("total_count", 0)
            total_pages = (products.get("page_info") or {}).get("total_pages", 1)
            print(f"  [magento] {total} products across {total_pages} pages")

        for raw in products.get("items") or []:
            robot = _build_robot(raw, site, base)
            if robot:
                robots.append(robot)
            if limit and len(robots) >= limit:
                print(f"  [magento] stopping at --limit {limit}")
                return robots

        if page % 5 == 0 or page == total_pages:
            print(f"    page {page}/{total_pages}  ({len(robots)} products)")
        page += 1

    return robots
