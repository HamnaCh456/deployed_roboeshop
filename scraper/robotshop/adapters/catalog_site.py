"""Adapter for brochure sites: vendors that showcase robots but do not sell online.

nexarobots.com is the case this was written for. It looked like WooCommerce
because it is WordPress, but it has zero `add-to-cart` markup and no WooCommerce
classes at all - it is a Pudu/Pepper distributor's marketing site. Each robot is
an ordinary WordPress *page* (`/bellabot/`, `/pepper-robot/`, `/swiftbot/`), with
no price, no SKU and no cart.

Two things in the main generic adapter make it useless here, so this exists:

  1. It discovers products by BFS over `*/product/*`-shaped URLs. These pages are
     at the site root, so nothing matches.
  2. It discards any page with no price and no spec table - which is every page
     on this site.

Instead this reads the Yoast sitemap index, treats the listed pages as candidate
robots, and keeps rows that have no price. That is correct rather than sloppy:
these are exactly the industrial and service robots the proposal wants alongside
the hobby components, and "price on request" is how that market actually sells.
Rows are marked `availability_text = "Enquiry / POA"` so the UI never renders a
misleading empty price.
"""

from __future__ import annotations

import hashlib
import re
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from ..http import Fetcher
from ..models import Image, Robot
from ..parse_specs import normalize_specs, parse_description

# Pages that exist on every brochure site and are never products.
_NON_PRODUCT = {
    "", "news", "blog", "about", "about-us", "contact", "contact-us", "solutions",
    "book-a-demo", "privacy-policy", "terms", "terms-of-service", "cart",
    "checkout", "my-account", "faq", "support", "careers", "sitemap",
    "smart-catering", "smart-retail", "smart-manufacture", "case-studies",
}

_NON_PRODUCT_HINTS = ("category", "tag", "author", "wp-content", "wp-json",
                      "feed", "?", "#")

# "Delivery Robots" / "Cleaning Robots" are section landing pages that list the
# real products; "SwiftBot" and "BellaBot" are the products. A bare plural
# category phrase is the reliable tell, and it generalises better than listing
# every slug a given site happens to use.
_CATEGORY_PAGE_NAME = re.compile(
    r"^\s*[\w\s&-]*\b(robots|solutions|products|series|range)\s*$", re.IGNORECASE)

# Below this, a page is almost certainly client-rendered rather than genuinely
# short: the static HTML of nexarobots' thin pages measured 413 characters of
# pure navigation chrome, while every real page cleared 3,000.
THIN_PAGE_CHARS = 900


def detect(fetcher: Fetcher, base_url: str) -> bool:
    """A WordPress site with pages but no shop is a brochure site."""
    html = fetcher.get_text(base_url)
    if not html:
        return False
    lowered = html.lower()
    is_wordpress = "wp-content" in lowered or "wp-json" in lowered
    has_shop = ("add-to-cart" in lowered or "woocommerce-page" in lowered
                or "/product/" in lowered)
    return is_wordpress and not has_shop


def _sitemap_urls(fetcher: Fetcher, base: str) -> list[str]:
    """Follow the sitemap index down to page URLs."""
    index = fetcher.get_text(urljoin(base, "/sitemap_index.xml"))
    sitemaps: list[str] = []
    if index:
        sitemaps = re.findall(r"<loc>([^<]+)</loc>", index)
    else:
        for candidate in ("/sitemap.xml", "/page-sitemap.xml", "/wp-sitemap.xml"):
            if fetcher.get_text(urljoin(base, candidate)):
                sitemaps.append(urljoin(base, candidate))

    # Only page/post sitemaps hold products; skip category/author/template ones.
    wanted = [s for s in sitemaps
              if re.search(r"(page|post|product)-sitemap", s)
              or s.endswith(("/sitemap.xml", "/wp-sitemap.xml"))]

    urls: list[str] = []
    for sitemap in wanted or sitemaps:
        body = fetcher.get_text(sitemap)
        if body:
            urls += re.findall(r"<loc>([^<]+)</loc>", body)
    return urls


def _looks_like_product(url: str, base_netloc: str) -> bool:
    parsed = urlparse(url)
    if parsed.netloc.replace("www.", "") != base_netloc.replace("www.", ""):
        return False
    path = parsed.path.strip("/")
    if not path or "/" in path:          # products sit at the root on this site
        return False
    if path.lower() in _NON_PRODUCT:
        return False
    return not any(hint in url.lower() for hint in _NON_PRODUCT_HINTS)


def _render_with_browser(urls: list[str]) -> dict[str, str]:
    """Re-fetch pages through crawl4ai's headless Chromium.

    Some Elementor pages ship almost nothing in the static HTML and build their
    content client-side: /temibot/, /platform-p200/ and /nexamt1max/ each yielded
    413 characters via plain HTTP - navigation chrome and nothing else. Rendering
    them in a real browser is the only way to see the copy, so those few pages
    pay the cost of a browser while the rest stay on cheap HTTP.
    """
    try:
        import asyncio

        from crawl4ai import (AsyncWebCrawler, BrowserConfig, CacheMode,
                              CrawlerRunConfig)
    except ImportError:
        print("    ! crawl4ai not installed; leaving thin pages as-is")
        return {}

    async def run() -> dict[str, str]:
        config = CrawlerRunConfig(cache_mode=CacheMode.BYPASS, page_timeout=60000,
                                  wait_until="networkidle", verbose=False)
        out: dict[str, str] = {}
        async with AsyncWebCrawler(config=BrowserConfig(headless=True,
                                                       verbose=False)) as crawler:
            for url in urls:
                try:
                    result = await crawler.arun(url=url, config=config)
                    result = result[0] if isinstance(result, list) else result
                    if getattr(result, "success", False) and getattr(result, "html", ""):
                        out[url] = result.html
                except Exception as exc:
                    print(f"    ! render failed {url}: {exc}")
        return out

    try:
        return asyncio.run(run())
    except Exception as exc:
        print(f"    ! browser fallback unavailable: {exc}")
        return {}


def _extract(fetcher: Fetcher, url: str, site: str,
             html_override: str | None = None) -> Robot | None:
    html = html_override or fetcher.get_text(url)
    if not html:
        return None
    soup = BeautifulSoup(html, "lxml")

    # Only ever strip these unconditionally. Removing header/footer/nav as well
    # looked sensible and silently destroyed three whole pages: Elementor's theme
    # builder wraps the *entire* page template in a <header>, so decomposing it
    # left 413 characters of chrome. A browser render showed the same 413 - the
    # content was never missing, this line was eating it. Chrome is dropped
    # further down, but only when doing so does not gut the page.
    for junk in soup.select("script, style, noscript"):
        junk.decompose()

    heading = soup.find("h1")
    title_tag = soup.find("title")
    name = (heading.get_text(" ", strip=True) if heading else "") or (
        title_tag.get_text(strip=True).split("-")[0].strip() if title_tag else "")
    if not name or len(name) < 2:
        return None
    if _CATEGORY_PAGE_NAME.match(name):
        return None

    # The page's own <meta description> is the cleanest one-line summary.
    meta = soup.find("meta", attrs={"name": "description"}) or \
        soup.find("meta", attrs={"property": "og:description"})
    summary = (meta.get("content") or "").strip() if meta else None

    # Pick the container holding the most text rather than trusting one tag.
    # These are Elementor pages: every one has a <main> and an <article>, but on
    # /temibot/ the <main> is an empty shell and the real content lives outside
    # it. Selecting `main or article or body` returned zero text for 5 of 6
    # pages; measuring and taking the richest fixes all of them and is theme
    # agnostic, which matters because the next brochure site will differ again.
    candidates = [soup.find("main"), soup.find("article"),
                  soup.select_one("[data-elementor-type]"), soup.body]
    container = max(
        (c for c in candidates if c is not None),
        key=lambda c: len(c.get_text(" ", strip=True)),
        default=None)

    # Now drop site chrome from inside the chosen container - but only if that
    # leaves most of the text behind. On a theme where the template lives inside
    # <header>, this would remove everything, so we keep the original instead.
    if container is not None:
        before = len(container.get_text(" ", strip=True))
        trimmed = BeautifulSoup(container.decode(), "lxml")
        for chrome in trimmed.select("nav, header, footer"):
            chrome.decompose()
        after = len(trimmed.get_text(" ", strip=True))
        if before and after / before >= 0.5:
            container = trimmed

    parsed = parse_description(container.decode() if container else None)

    images: list[Image] = []
    og_image = soup.find("meta", attrs={"property": "og:image"})
    if og_image and og_image.get("content"):
        images.append(Image(url=urljoin(url, og_image["content"]), position=1))
    # Fall back to the whole document when the container has no images of its
    # own - header/footer/nav are already stripped, so this stays on-topic.
    sources = container.find_all("img") if container else []
    if not sources:
        sources = soup.find_all("img")
    for index, img in enumerate(sources[:8], 2):
        src = (img.get("data-src") or img.get("data-lazy-src")
               or img.get("data-large_image") or img.get("src"))
        if src and not src.startswith("data:"):
            full = urljoin(url, src)
            if full not in [i.url for i in images]:
                images.append(Image(url=full, alt=img.get("alt"), position=index))

    videos = []
    for iframe in soup.find_all("iframe"):
        src = iframe.get("src") or ""
        if any(host in src for host in ("youtube.com", "youtu.be", "vimeo.com")):
            videos.append(src if src.startswith("http") else f"https:{src}")

    robot = Robot(
        source_site=site,
        source_url=url,
        handle=urlparse(url).path.strip("/") or None,
        name=name,
        summary=summary,
        description_html=None,
        description_text=parsed["text"][:8000],
        specs_raw=dict(parsed["specs_raw"]),
        specs=dict(parsed["specs"]),
        features=list(parsed["bullets"])[:30],
        images=images,
        primary_image=images[0].url if images else None,
        video_urls=videos,
        # No price is the truth here, not a parse failure. Say so explicitly so
        # the UI can render "Price on request" instead of a blank or a zero.
        price=None,
        availability_text="Enquiry / POA",
        seller_name=site,
        seller_url=f"https://{site}",
    )
    robot.specs = normalize_specs(robot.specs_raw)
    robot.extraction_warnings.append("no_public_price")

    payload = f"{robot.name}|{robot.description_text}"
    robot.content_hash = hashlib.sha256(payload.encode()).hexdigest()[:32]
    return robot


def scrape(fetcher: Fetcher, base_url: str, deep: bool = True,
           limit: int | None = None, **_ignored) -> list[Robot]:
    parsed = urlparse(base_url)
    base = f"{parsed.scheme}://{parsed.netloc}"
    site = parsed.netloc.replace("www.", "")

    print(f"  [catalog] brochure site {site} - discovering pages via sitemap")
    urls = _sitemap_urls(fetcher, base)
    candidates = [u for u in urls if _looks_like_product(u, parsed.netloc)]
    print(f"  [catalog] {len(urls)} sitemap URLs -> {len(candidates)} candidate robots")

    robots: list[Robot] = []
    for index, url in enumerate(candidates, 1):
        robot = _extract(fetcher, url, site)
        if robot:
            robots.append(robot)
        if limit and len(robots) >= limit:
            break
        if index % 10 == 0:
            print(f"    {index}/{len(candidates)} pages read")

    # Anything this thin is a client-rendered page, not a thin product. Retry
    # just those through a browser rather than paying for one on every page.
    thin = [r for r in robots if len((r.description_text or "")) < THIN_PAGE_CHARS]
    if thin:
        print(f"  [catalog] {len(thin)} pages look client-rendered; retrying in a browser")
        rendered = _render_with_browser([r.source_url for r in thin])
        recovered = 0
        for robot in thin:
            html = rendered.get(robot.source_url)
            if not html:
                continue
            better = _extract(fetcher, robot.source_url, site, html_override=html)
            if better and len(better.description_text or "") > len(robot.description_text or ""):
                robots[robots.index(robot)] = better
                recovered += 1
        print(f"  [catalog] recovered content for {recovered}/{len(thin)} pages")

    print(f"  [catalog] {len(robots)} robots extracted (no public prices)")
    return robots
