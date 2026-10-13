"""Canonical tutorial schema.

Field names are camelCase because this model is serialised straight to
`tutorials.json` and consumed by `ui/src/types/index.ts` without a mapping
layer. The product pipeline goes snake_case -> mock-server -> camelCase; there
is no reason to repeat that indirection for a file we control end to end.

Two groups worth calling out:

- **From the source.** `title`, `summary`, `image`, `author`, `publishedAt`,
  `sourceUrl`, `wordCount` are read out of the page's JSON-LD Article block.
  They are facts about someone else's tutorial and are never invented here.
- **Derived by us.** `category`, `platforms`, `level`, `format`, `steps` are
  rule-based inference over the title and body, the same way `enrich.py` infers
  them for products. `parts` is our own contribution: parts named in the body,
  matched against the scraped catalogue and priced in PKR.

`verifiedBuild` stays False for everything scraped. It means "we built this and
checked it", which is an editorial claim, and nothing here has earned it.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class TutorialPart(BaseModel):
    """One line of a tutorial's bill of materials, priced from our catalogue."""

    name: str
    qty: int = 1
    #: Unit price in PKR. None when the catalogue has the part but no price
    #: (brochure sites list "Enquiry / POA"), which the UI renders as a dash
    #: rather than as free.
    price: float | None = None
    #: Which catalogue product this line resolved to, so a reader can click
    #: through and buy it. Empty when we matched a generic term only.
    matchKey: str | None = None
    sourceSite: str | None = None
    productUrl: str | None = None


class Tutorial(BaseModel):
    id: str
    title: str
    summary: str
    #: The archived copy of the thumbnail. Not the publisher's own URL: that
    #: host answers image requests with HTTP 403 too, so pointing the UI at it
    #: renders a broken tile. See `wayback.asset_url`.
    image: str
    #: Where that image lives on the publisher's own site, kept for attribution
    #: and so a later editorial pass can re-fetch or replace it.
    imageSourceUrl: str | None = None

    # -- attribution. This is someone else's work; the link out is not optional.
    sourceUrl: str
    sourceName: str = "RobotShop Community"
    author: str | None = None
    publishedAt: str | None = None
    updatedAt: str | None = None
    #: The Internet Archive snapshot the text was read from, so any claim on
    #: the page can be traced back to a fixed, citable copy.
    archivedUrl: str | None = None
    series: str | None = None
    wordCount: int | None = None

    # -- derived by rules over the body text
    format: str = "guide"
    level: str = "Beginner"
    category: str = "Robot Kits"
    platforms: list[str] = Field(default_factory=list)
    runtimeSec: int | None = None
    steps: int = 0
    verifiedBuild: bool = False

    # -- our own layer
    parts: list[TutorialPart] = Field(default_factory=list)
