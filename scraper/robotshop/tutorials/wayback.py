"""Read RobotShop Community tutorials out of the Internet Archive.

Why not the site itself
-----------------------
`community.robotshop.com` sits behind the same Cloudflare bot management as
`www.robotshop.com`. It answers this scraper, a headless browser, *and*
`/robots.txt` itself with HTTP 403 and a managed challenge, so there is no
automated route in and no way to read their stated crawl policy. The project's
standing rule (README, "Sites that cannot be crawled") is that we do not defeat
that: `UndetectedAdapter` stays unwired.

So we do not touch their servers at all. The Internet Archive holds public
snapshots of these pages, serves them over an open API with no challenge, and
is designed to be read by machines. We take metadata and a link, we cite the
snapshot we read, and every tutorial on our page links back to the original.
That is a citation, not a copy.

Two endpoints, both public:

    CDX index   http://web.archive.org/cdx/search/cdx?url=...&output=json
    raw capture https://web.archive.org/web/<timestamp>id_/<original-url>

The `id_` modifier matters: without it the Archive injects its own toolbar and
rewrites every URL in the document, which corrupts the JSON-LD block we parse.
"""

from __future__ import annotations

import json
import re
from urllib.parse import urlsplit, urlunsplit

#: Zero-width and bidi characters, raw or percent-encoded. A stray U+200B at
#: the end of one slug published the same tutorial twice - "Robot Leg Torque
#: Tutorial" and "robot-leg-torque-tutorial%E2%80%8B" are one page, and both
#: were being indexed, parsed and shown.
#:
#: Only these characters are decoded. A blanket `unquote()` would also turn a
#: legitimately encoded space or slash back into a literal one and change which
#: page the URL points at.
_INVISIBLE = re.compile(
    r"[​-‏‪-‮﻿]"
    r"|%e2%80%8[b-f]|%e2%80%a[a-e]|%ef%bb%bf",
    re.I,
)

CDX_ENDPOINT = "http://web.archive.org/cdx/search/cdx"
INDEX_URL = "https://community.robotshop.com/tutorials"

#: Tutorial detail pages. The site also has `/tutorials/series/<slug>` index
#: pages, which carry no tutorial body of their own - they are tables of
#: contents - so they are indexed separately and used only to name a series.
DETAIL_PREFIX = "https://community.robotshop.com/tutorials/show/"
SERIES_PREFIX = "https://community.robotshop.com/tutorials/series/"


def cdx_query(url_pattern: str) -> str:
    """Build a CDX request for every successful capture of a URL pattern."""
    params = (
        f"url={url_pattern}"
        "&output=json"
        "&fl=timestamp,original"
        "&filter=statuscode:200"
        "&filter=mimetype:text/html"
        "&collapse=urlkey"
    )
    return f"{CDX_ENDPOINT}?{params}"


def canonical_url(url: str) -> str:
    """Drop tracking parameters and the fragment.

    The Archive holds the same tutorial under half a dozen URLs that differ
    only by `?utm_source=Pinterest` and friends. Left alone that turns 88
    tutorials into 130-odd rows, most of them duplicates of each other.
    """
    parts = urlsplit(url)
    keep = [
        pair
        for pair in parts.query.split("&")
        if pair and not pair.split("=")[0].lower().startswith(("utm_", "fbclid", "gclid"))
    ]
    path = _INVISIBLE.sub("", parts.path).rstrip("/")
    return urlunsplit((parts.scheme, parts.netloc, path, "&".join(keep), ""))


def slug_of(url: str) -> str:
    """The tutorial's stable identifier: the last path segment."""
    return canonical_url(url).rstrip("/").rsplit("/", 1)[-1]


def parse_cdx(payload: str) -> dict[str, str]:
    """CDX JSON -> {canonical url: newest timestamp}.

    The Archive returns a header row followed by `[timestamp, original]` pairs,
    oldest first. We keep the newest capture of each tutorial: these pages were
    edited over the years (`dateModified` runs to 2023 on posts written in
    2018) and the latest snapshot is the one whose text matches the live page.
    """
    try:
        rows = json.loads(payload)
    except json.JSONDecodeError:
        return {}
    if not rows or len(rows) < 2:
        return {}

    newest: dict[str, str] = {}
    for timestamp, original in (row[:2] for row in rows[1:]):
        url = canonical_url(original)
        if not re.match(r"^https?://community\.robotshop\.com/tutorials/", url):
            continue
        if newest.get(url, "") < timestamp:
            newest[url] = timestamp
    return newest


def snapshot_url(original: str, timestamp: str) -> str:
    """The raw, un-rewritten capture — note the `id_` after the timestamp."""
    return f"https://web.archive.org/web/{timestamp}id_/{original}"


def asset_url(original: str, timestamp: str) -> str:
    """The archived copy of an image.

    Tutorial thumbnails live on `community.robotshop.com/uploads/...`, which is
    behind the same Cloudflare rule as the pages: requesting one directly
    returns HTTP 403 and a challenge page, so a browser pointed at it renders a
    broken image. The Archive holds the real file and serves it as
    `image/jpeg`, so that is what the catalogue stores.

    `im_` is the image equivalent of `id_`: the original bytes, no toolbar and
    no URL rewriting.
    """
    if not original:
        return ""
    return f"https://web.archive.org/web/{timestamp}im_/{original}"


def index_images(fetcher) -> dict[str, tuple[str, str]]:
    """Archived tutorial thumbnails, keyed by path with the query dropped.

    Not every thumbnail was captured - roughly two thirds of them were not - so
    this index is what lets the build tell "we have a picture" from "we do
    not", instead of emitting a URL that renders as a broken tile.

    The key ignores the `?v=` cache-buster because the publisher changes it
    whenever a post is edited, so the archived copy and the URL in today's
    JSON-LD almost never agree on it while pointing at the same file.
    """
    # Deliberately not `cdx_query`, which pins mimetype to text/html.
    query = (
        f"{CDX_ENDPOINT}?url=community.robotshop.com/uploads/tutorials*"
        "&output=json&fl=timestamp,original&filter=statuscode:200"
        "&collapse=urlkey&limit=8000"
    )
    payload = fetcher.get_text(query)
    if not payload:
        return {}

    try:
        rows = json.loads(payload)
    except json.JSONDecodeError:
        return {}
    if len(rows) < 2:
        return {}

    index: dict[str, tuple[str, str]] = {}
    for timestamp, original in (row[:2] for row in rows[1:]):
        key = urlsplit(original).path
        # Keep the newest capture of each file.
        if key not in index or index[key][0] < timestamp:
            index[key] = (timestamp, original)
    return index


def resolve_image(original: str, index: dict[str, tuple[str, str]]) -> str:
    """An archived, actually-loadable URL for a thumbnail, or "" if there is none.

    Tries the exact path first, then the other size in the same folder: these
    posts carry `full.jpg` and `thumbnail.jpg` side by side and the Archive
    often captured only one of the two.
    """
    if not original:
        return ""

    path = urlsplit(original).path
    candidates = [path]
    folder, _, filename = path.rpartition("/")
    for alternative in ("full.jpg", "thumbnail.jpg", "full.png", "thumbnail.png"):
        if alternative != filename:
            candidates.append(f"{folder}/{alternative}")

    for candidate in candidates:
        if candidate in index:
            timestamp, archived = index[candidate]
            return asset_url(archived, timestamp)
    return ""


def index_detail_pages(fetcher) -> dict[str, str]:
    """Every archived tutorial detail page, as {canonical url: timestamp}."""
    payload = fetcher.get_text(cdx_query("community.robotshop.com/tutorials/show*"))
    if not payload:
        return {}
    return {
        url: ts
        for url, ts in parse_cdx(payload).items()
        if url.startswith(DETAIL_PREFIX)
    }


def index_series_pages(fetcher) -> dict[str, str]:
    """Archived series index pages, used only to give a tutorial a series name."""
    payload = fetcher.get_text(cdx_query("community.robotshop.com/tutorials/series*"))
    if not payload:
        return {}
    return {
        url: ts
        for url, ts in parse_cdx(payload).items()
        if url.startswith(SERIES_PREFIX)
    }
