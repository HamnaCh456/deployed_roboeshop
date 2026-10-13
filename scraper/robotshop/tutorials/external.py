"""Tutorials published by someone other than the RobotShop community.

WHY THIS IS A SEED LIST AND NOT A CRAWL
=======================================
`wayback.py` indexes one site exhaustively, because community.robotshop.com is
a single library with a single layout and 87 pages worth having. This module is
the opposite shape: a short, hand-checked list of individual pages from
publishers who each have their own layout. Each entry is a judgement that this
particular page is worth a card, so the list is the editorial decision and the
code is only the fetching. Adding a publisher is appending to `SOURCES`.

POLITENESS
==========
Unlike community.robotshop.com — which answers automated requests, including
one for `/robots.txt`, with a Cloudflare challenge — both publishers below
serve us directly, and their `robots.txt` allows the paths we read:

    theconstruct.ai   Disallow: /wp-admin/            (checked 2026-08-22)
    robodk.com        Disallow: /files/, /downloads/private/, /license/,
                                /forum/… (checked 2026-08-22)

Neither disallows the pages listed here, so these are fetched live rather than
through the Internet Archive, and `archivedUrl` stays None for them. One
request per page per run, at the Fetcher's standing 1 req/s, cached on disk.

WHAT WE TAKE AND WHAT WE DO NOT
===============================
Title, summary, image, author and dates, all out of the publisher's own
JSON-LD, plus enough body text to run the same keyword rules the rest of the
pipeline runs. We do not republish the tutorial. The card is a title, a
sentence of the publisher's own description, and a link back — the same deal as
every other row in the library.

Both publishers here are WordPress with Yoast, which nests everything in a
`@graph` rather than the flat `Article` block `parse.py` expects, and neither
carries a `wordcount`. That is what this parser exists to handle; the field
extraction below is otherwise the same idea as `parse.py`, deliberately.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from bs4 import BeautifulSoup

from .parse import _clean, _iso_date, _meta, _person, video_ids


@dataclass(frozen=True)
class Source:
    """One curated page, and who published it."""

    #: Shown on the card as the byline's publisher, and filterable in the UI.
    publisher: str
    url: str


#: The list is the editorial decision. Keep it short and keep it checked.
SOURCES: tuple[Source, ...] = (
    Source(
        publisher="The Construct",
        url=(
            "https://www.theconstruct.ai/robotigniteacademy_learnros/"
            "ros-courses-library/cpp-for-robotics/"
        ),
    ),
    Source(
        publisher="RoboDK",
        url="https://robodk.com/blog/free-robot-training-with-robodk/",
    ),
)

#: Article-ish JSON-LD types, most specific first.
_ARTICLE_TYPES = ("Article", "BlogPosting", "NewsArticle", "Course", "TechArticle")

#: Everything inside the content column that is not the content. "Related
#: posts" is the dangerous one: it names four *other* articles, and their
#: titles ("Concrete 3D Printing", "Robot Euler Angles") would be read as this
#: page's subject by the category rules and as its parts by the BOM matcher.
_CHROME_SELECTORS = (
    "script", "style", "noscript", "iframe", "form", "nav", "footer", "header",
    "aside",
    "[class*='related']", "[class*='author-box']", "[class*='author-bio']",
    "[class*='share']", "[class*='sharing']", "[class*='comment']",
    "[class*='sidebar']", "[class*='widget']", "[class*='breadcrumb']",
    "[class*='cookie']", "[class*='newsletter']", "[class*='subscribe']",
    "[class*='navigation']", "[id*='comments']",
)

#: Where the prose lives, in the order we trust them. `.entry-content` beats
#: `main` because on a WordPress blog `main` also holds the related-posts rail;
#: where a page has several, the longest is the article and the rest are
#: excerpts of other articles.
_CONTENT_SELECTORS = (".entry-content", "article", "main", "#content", ".post-content")

#: A heading that names a position in a sequence. Only these count as steps —
#: see `ordered_steps`.
_STEP_HEADING = re.compile(
    r"^\s*(?:step|unit|lesson|part|chapter|module|day)\s*[#:]?\s*\d+\b"
    r"|^\s*\d+\s*[.)]\s+\S",
    re.I,
)

#: Site furniture that gets picked up as an image: favicons, logos, avatars,
#: sprites, and the tracking pixels lazy-loaders leave behind.
_NOT_A_THUMBNAIL = re.compile(
    r"(favicon|android-chrome|apple-touch|logo|sprite|avatar|gravatar|"
    r"icon[-_]|[-_]icon|placeholder|spacer|pixel)", re.I
)


def _nodes(soup: BeautifulSoup) -> list[dict]:
    """Every JSON-LD node on the page, `@graph` flattened out."""
    import json

    found: list[dict] = []
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or "")
        except (json.JSONDecodeError, TypeError):
            continue
        for item in data if isinstance(data, list) else [data]:
            if not isinstance(item, dict):
                continue
            graph = item.get("@graph")
            if isinstance(graph, list):
                found.extend(node for node in graph if isinstance(node, dict))
            else:
                found.append(item)
    return found


def _typed(nodes: list[dict], *types: str) -> dict:
    """The first node of any of `types`. `@type` may be a string or a list."""
    for wanted in types:
        for node in nodes:
            declared = node.get("@type")
            declared = declared if isinstance(declared, list) else [declared]
            if wanted in declared:
                return node
    return {}


def _site_names(nodes: list[dict]) -> list[str]:
    """What the publisher calls itself, for stripping off the end of titles."""
    names = []
    for node in nodes:
        declared = node.get("@type")
        declared = declared if isinstance(declared, list) else [declared]
        if {"WebSite", "Organization"} & set(declared):
            name = _clean(node.get("name"))
            if name:
                names.append(name)
    return names


def strip_site_suffix(title: str, site_names: list[str]) -> str:
    """"FREE Course: C++ for Robotics | The Construct" -> "FREE Course: C++ for Robotics".

    Every publisher hangs its own name off the end of `og:title`, and on a card
    that already carries the publisher as a byline it is said twice. Only an
    exact site name is removed, so a title that genuinely ends in a word we
    happen to match is left alone.
    """
    for name in sorted(site_names, key=len, reverse=True):
        pattern = rf"\s*[|–—-]\s*{re.escape(name)}\s*$"
        stripped = re.sub(pattern, "", title, flags=re.I)
        if stripped != title:
            return stripped.strip()
    return title.strip()


def content_root(soup: BeautifulSoup) -> BeautifulSoup:
    """The article column, chrome removed, as a detached tree."""
    container = None
    for selector in _CONTENT_SELECTORS:
        found = soup.select(selector)
        if found:
            container = max(found, key=lambda tag: len(tag.get_text(" ", strip=True)))
            break
    if container is None:
        container = soup.body or soup

    clone = BeautifulSoup(str(container), "lxml")
    for selector in _CHROME_SELECTORS:
        for tag in clone.select(selector):
            tag.decompose()
    return clone


def ordered_steps(root: BeautifulSoup) -> list[str]:
    """Headings that name a position in a sequence — nothing else.

    A blog post's `<h2>`s are its sections, not its steps, and counting them
    would put "10 steps" on a course page whose headings are "Course Overview"
    and "Prerequisites". The card would then be stating a fact the publisher
    never stated. Where there is no numbered sequence the count stays zero and
    the card says how long the read is instead.
    """
    found: list[str] = []
    for heading in root.find_all(["h2", "h3"]):
        label = _clean(heading.get_text(" ", strip=True))
        if label and _STEP_HEADING.match(label) and label not in found:
            found.append(label)
    return found


def lead_image(root: BeautifulSoup, fallback: str) -> str:
    """The first real picture in the article, else whatever `og:image` said.

    `og:image` is the fallback rather than the first choice because a site that
    sets no per-page image serves its favicon there — theconstruct.ai answers
    with `android-chrome-512x512.png`, which would put the same blue square on
    every card from that publisher. A picture inside the article beats one the
    template supplied.
    """
    for img in root.find_all("img"):
        # Lazy-loaders leave a 1x1 data URI in `src` and the real file in a
        # data attribute, so the attribute is read first.
        for attr in ("data-lazy-src", "data-src", "data-original", "src"):
            candidate = (img.get(attr) or "").strip()
            if not candidate or candidate.startswith("data:"):
                continue
            if _NOT_A_THUMBNAIL.search(candidate):
                break
            return candidate
    return fallback


def parse(raw_html: str, source_url: str) -> dict | None:
    """Live publisher HTML -> the same raw record `parse.parse` returns.

    Returning the identical shape is the point: `run_tutorials.py` builds a
    `Tutorial` from it with the same enrich and BOM steps, so a page from a new
    publisher is classified by exactly the rules everything else is.
    """
    soup = BeautifulSoup(raw_html, "lxml")
    nodes = _nodes(soup)
    article = _typed(nodes, *_ARTICLE_TYPES)
    page = _typed(nodes, "WebPage")
    site_names = _site_names(nodes)

    title = strip_site_suffix(
        _clean(article.get("headline") or article.get("name"))
        or _clean(page.get("name"))
        or _meta(soup, "og:title")
        or _clean(soup.h1.get_text(" ", strip=True) if soup.h1 else ""),
        site_names,
    )
    if not title:
        return None

    summary = strip_site_suffix(
        _clean(article.get("description"))
        or _clean(page.get("description"))
        or _meta(soup, "og:description"),
        site_names,
    )

    root = content_root(soup)
    body = _clean(root.get_text(" ", strip=True))

    # Nobody here publishes a wordcount, so this one is measured off the text we
    # just read rather than quoted. It only feeds the level tie-breaker and the
    # card's reading time, and both of those are honestly our own arithmetic.
    word_count = len(body.split()) or None

    return {
        "title": title,
        "summary": summary,
        "image": lead_image(root, _meta(soup, "og:image")),
        "author": _person(article.get("author")) or None,
        "series": None,
        "publishedAt": (
            _iso_date(article.get("datePublished")) or _iso_date(page.get("datePublished"))
        ),
        "updatedAt": (
            _iso_date(article.get("dateModified")) or _iso_date(page.get("dateModified"))
        ),
        "sourceUrl": _clean(article.get("url")) or _meta(soup, "og:url") or source_url,
        "wordCount": word_count,
        "steps": ordered_steps(root),
        "videos": video_ids(soup, raw_html),
        "body": body,
    }
