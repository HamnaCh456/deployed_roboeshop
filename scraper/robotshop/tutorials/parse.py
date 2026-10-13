"""Archived tutorial HTML -> a raw record.

Everything factual comes from the page's JSON-LD `Article` block, which these
pages carry in full: headline, description, image, author, datePublished,
dateModified and wordcount. That is a publisher-authored, machine-readable
summary of their own article, so we prefer it over scraping display markup that
changes with every redesign. Open Graph tags are the fallback; the visible
`<h1>` is the last resort.

The one thing JSON-LD does not carry is the series name, so that is read from
the byline, which reads "Posted on DD/MM/YYYY by AUTHOR in SERIES".

No LLM here, for the same reason the product pipeline has none: the data is
already structured, regex reads it exactly, and a model could invent an author.
"""

from __future__ import annotations

import html
import json
import re

from bs4 import BeautifulSoup

#: Chrome, navigation and social widgets that sit inside the article column but
#: are not article text. Left in, they poison part matching: the "Lessons Menu"
#: names every other lesson in the series, so a potentiometer tutorial looks
#: like it needs an IR distance sensor and a servo.
_CHROME_SELECTORS = (
    "script", "style", "noscript", "iframe",
    ".stepper", ".sticky", ".mark-complete", ".button-group",
    ".social-counter", ".author-meta", ".post-steps", ".card-title",
    "nav", "footer", "header",
)

#: A "step" that is really navigation. These pages put the series table of
#: contents inside the article as a step titled "Lessons Menu", and its links
#: name every *other* lesson in the series. Left in, the potentiometer lesson
#: appears to need a servo, an IMU and an IR distance sensor, because lessons
#: 4, 5 and 7 are listed in its sidebar. This is the single largest source of
#: false parts, so it is cut before the body text is ever read.
_NAV_STEP_TITLE = re.compile(
    r"^\s*(lessons?\s*menu|table of contents|contents|index|"
    r"(next|previous|related)\s+(lesson|tutorial)s?)\s*$",
    re.I,
)

_BYLINE = re.compile(
    r"Posted on\s+(?P<posted>[\d/]+)\s+by\s+(?P<author>.+?)"
    r"(?:\s+in\s+(?P<series>.+?))?"
    r"(?:\s*Modified on:\s*(?P<modified>[\d/]+))?\s*$",
    re.I | re.S,
)

_VIDEO = re.compile(
    r"(?:youtube\.com/(?:embed/|watch\?v=)|youtu\.be/)([A-Za-z0-9_-]{11})"
    r"|vimeo\.com/(\d{6,})",
    re.I,
)


def _clean(value: str | None) -> str:
    """Unescape, strip tags, collapse whitespace.

    JSON-LD on these pages is double-escaped - the description arrives as
    `&lt;p&gt;Welcome to RobotShop&amp;#39;s...` - so unescaping once leaves
    literal `<p>` tags and a stray `&#39;` in the output.
    """
    if not value:
        return ""
    text = html.unescape(html.unescape(value))
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("\xa0", " ")
    return re.sub(r"\s+", " ", text).strip()


def _json_ld(soup: BeautifulSoup) -> dict:
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or "")
        except (json.JSONDecodeError, TypeError):
            continue
        if isinstance(data, list):
            data = next((d for d in data if isinstance(d, dict)), {})
        if isinstance(data, dict) and data.get("@type") == "Article":
            return data
    return {}


def _meta(soup: BeautifulSoup, prop: str) -> str:
    tag = soup.find("meta", attrs={"property": prop}) or soup.find(
        "meta", attrs={"name": prop}
    )
    return _clean(tag.get("content")) if tag else ""


def _person(value) -> str | None:
    if isinstance(value, dict):
        return _clean(value.get("name")) or None
    return _clean(value) or None


def _iso_date(value: str | None) -> str | None:
    """Accept JSON-LD's `YYYY-MM-DD`, the byline's `DD/MM/YYYY`, and a full
    timestamp.

    The timestamp case is Yoast's: every WordPress publisher in
    `external.py` dates a page `2022-07-15T14:58:28+00:00`. Only the date is
    kept — the library sorts and filters by day, and an hour in the
    publisher's timezone is precision we would not use.
    """
    if not value:
        return None
    value = value.strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return value
    stamped = re.match(r"(\d{4}-\d{2}-\d{2})[T ]\d{2}:\d{2}", value)
    if stamped:
        return stamped.group(1)
    match = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", value)
    if match:
        day, month, year = match.groups()
        return f"{year}-{int(month):02d}-{int(day):02d}"
    return None


def _byline(soup: BeautifulSoup) -> dict[str, str | None]:
    block = soup.select_one(".author-meta")
    if not block:
        return {}
    match = _BYLINE.search(_clean(block.get_text(" ", strip=True)))
    return {k: (v.strip() if v else None) for k, v in match.groupdict().items()} if match else {}


def body_text(soup: BeautifulSoup) -> str:
    """The article prose, with navigation stripped out.

    The layout puts the `<h1>` and the article in two different `large-9`
    cells, and the heading one comes first in document order. Selecting the
    first match returned a 52-character "body" that was just the title, so the
    candidates are ranked by text length and the fattest one wins.
    """
    root = soup.select_one(".tutorial-post") or soup.select_one(".site-content") or soup
    candidates = root.select("[class*='large-9']") or [root]
    container = max(candidates, key=lambda tag: len(tag.get_text(" ", strip=True)))
    clone = BeautifulSoup(str(container), "lxml")
    for selector in _CHROME_SELECTORS:
        for tag in clone.select(selector):
            tag.decompose()
    for section in clone.select("section.project-view-step, .project-view-step"):
        heading = section.select_one(".step-title, h2, h3")
        if heading and _NAV_STEP_TITLE.match(_clean(heading.get_text(" ", strip=True))):
            section.decompose()

    # A link to another tutorial is a table of contents entry, not prose. Its
    # text is the *other* lesson's title - "Lesson 5: Actuator: Servo Motor" -
    # and reading it as this lesson's content is what put a servo, an IMU and
    # an IR sensor on a potentiometer tutorial's parts list.
    for anchor in clone.select(
        'a[href*="/tutorials/show/"], a[href*="/tutorials/series/"]'
    ):
        anchor.decompose()

    return _clean(clone.get_text(" ", strip=True))


def _dedupe_phrase(label: str) -> str:
    """Collapse "Step 1 Step 1" to "Step 1".

    The stepper renders each label twice - once for the desktop rail and once
    for the mobile one - and `get_text()` concatenates both copies.
    """
    half, remainder = divmod(len(label), 2)
    if remainder == 1 and label[half] == " " and label[:half] == label[half + 1:]:
        return label[:half]
    return label


def step_titles(soup: BeautifulSoup) -> list[str]:
    """Named steps, deduplicated in document order.

    The article's real steps are `section.project-view-step` headings. The
    sidebar checklist (`.post-steps`) is a summary of them and is often shorter,
    so it is only a fallback: reading it first reported "1 step" for most of the
    library, which is the one figure the card puts in the corner of every tile.

    Navigation steps are dropped, so a lesson with three sections and a "Lessons
    Menu" reports three.
    """
    seen: list[str] = []
    for heading in soup.select("section.project-view-step .step-title, "
                               ".project-view-step .step-title"):
        label = _dedupe_phrase(_clean(heading.get_text(" ", strip=True)))
        if label and not _NAV_STEP_TITLE.match(label) and label not in seen:
            seen.append(label)
    if seen:
        return seen

    for item in soup.select(".post-steps li, .stepper li"):
        label = _dedupe_phrase(_clean(item.get_text(" ", strip=True)))
        if label and not _NAV_STEP_TITLE.match(label) and label not in seen:
            seen.append(label)
    return seen


def video_ids(soup: BeautifulSoup, raw_html: str) -> list[str]:
    """YouTube/Vimeo ids referenced anywhere in the capture."""
    found: list[str] = []
    for match in _VIDEO.finditer(raw_html):
        ident = match.group(1) or match.group(2)
        if ident and ident not in found:
            found.append(ident)
    return found


def parse(raw_html: str, source_url: str) -> dict | None:
    """Return a raw record, or None if the capture has no usable article."""
    soup = BeautifulSoup(raw_html, "lxml")
    ld = _json_ld(soup)
    byline = _byline(soup)

    title = (
        _clean(ld.get("headline"))
        or re.sub(r"\s*\|\s*RobotShop Community\s*$", "", _meta(soup, "og:title"))
        or _clean(soup.h1.get_text(" ", strip=True) if soup.h1 else "")
    )
    if not title:
        return None

    summary = _clean(ld.get("description")) or _meta(soup, "og:description")
    summary = re.sub(r"\s*\|\s*RobotShop Community\s*$", "", summary)

    word_count = ld.get("wordcount")
    try:
        word_count = int(word_count) if word_count is not None else None
    except (TypeError, ValueError):
        word_count = None

    return {
        "title": title,
        "summary": summary,
        "image": _clean(ld.get("image")) or _meta(soup, "og:image"),
        "author": _person(ld.get("author")) or byline.get("author"),
        "series": byline.get("series"),
        "publishedAt": _iso_date(ld.get("datePublished")) or _iso_date(byline.get("posted")),
        "updatedAt": _iso_date(ld.get("dateModified")) or _iso_date(byline.get("modified")),
        "sourceUrl": _clean(ld.get("url")) or _meta(soup, "og:url") or source_url,
        "wordCount": word_count,
        "steps": step_titles(soup),
        "videos": video_ids(soup, raw_html),
        "body": body_text(soup),
    }
