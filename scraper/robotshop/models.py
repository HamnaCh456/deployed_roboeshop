"""Canonical data model for RobotEshop.

One `Robot` row is the unit of aggregation: a single purchasable product at a
single source site. The same physical robot sold on three sites produces three
`Robot` rows sharing a `match_key`, which is what powers price comparison.

Field groups map directly onto the proposal's objectives:
  - specs / platform / programming -> "complete details ... hardware and software
    specifications, supported platforms, and programming tools"
  - pricing + price_history        -> "price comparison", "historical price tracking"
  - audience                       -> "age-based and skill-based recommendations"
  - seller                         -> "trusted and verified sellers"
  - enrichment                     -> the proposal's stated market gap: tutorial
    videos and guides that the source sites do not carry. These are left empty by
    the scraper and filled by a later human/editorial pass.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class PricePoint(BaseModel):
    """One observation of a price, so trends survive across re-crawls."""

    observed_at: str = Field(default_factory=_utcnow)
    price: float | None = None
    compare_at_price: float | None = None
    currency: str = "PKR"
    in_stock: bool | None = None


class Variant(BaseModel):
    variant_id: str | None = None
    title: str | None = None
    sku: str | None = None
    price: float | None = None
    compare_at_price: float | None = None
    available: bool | None = None
    grams: int | None = None
    options: dict[str, str] = Field(default_factory=dict)


class Image(BaseModel):
    url: str
    alt: str | None = None
    position: int | None = None
    local_path: str | None = None
    width: int | None = None
    height: int | None = None


class Robot(BaseModel):
    # ---- identity -------------------------------------------------------
    source_site: str                      # "robo.pk"
    source_url: str                       # canonical product URL
    source_product_id: str | None = None  # id as given by the source platform
    handle: str | None = None             # url slug
    scraped_at: str = Field(default_factory=_utcnow)
    content_hash: str | None = None       # change detection between runs

    # ---- what it is -----------------------------------------------------
    name: str
    brand: str | None = None              # derived; source vendor is often the shop
    vendor: str | None = None             # as stated by the source
    sku: str | None = None
    model_number: str | None = None
    product_type: str | None = None       # source's own type string, often blank
    category: str | None = None           # OUR normalized taxonomy (see enrich.py)
    subcategory: str | None = None
    source_categories: list[str] = Field(default_factory=list)  # collections it sits in
    tags: list[str] = Field(default_factory=list)

    # ---- copy -----------------------------------------------------------
    description_html: str | None = None
    description_text: str | None = None
    summary: str | None = None            # the "Function:" line where present
    features: list[str] = Field(default_factory=list)
    applications: list[str] = Field(default_factory=list)

    # ---- commerce -------------------------------------------------------
    price: float | None = None
    compare_at_price: float | None = None
    discount_pct: float | None = None
    currency: str = "PKR"
    in_stock: bool | None = None
    stock_qty: int | None = None
    availability_text: str | None = None
    variants: list[Variant] = Field(default_factory=list)
    price_history: list[PricePoint] = Field(default_factory=list)

    # ---- media ----------------------------------------------------------
    images: list[Image] = Field(default_factory=list)
    primary_image: str | None = None
    video_urls: list[str] = Field(default_factory=list)

    # ---- technical ------------------------------------------------------
    # `specs_raw` keeps every label/value the page actually stated, verbatim and
    # lossless. `specs` holds the subset we managed to normalize into known keys.
    # Keeping both means a parser gap never silently destroys data.
    specs_raw: dict[str, str] = Field(default_factory=dict)
    specs: dict[str, Any] = Field(default_factory=dict)

    operating_voltage: str | None = None
    input_voltage: str | None = None
    interface: list[str] = Field(default_factory=list)      # I2C, SPI, UART, USB...
    connectivity: list[str] = Field(default_factory=list)   # WiFi, BLE, LoRa...
    sensors: list[str] = Field(default_factory=list)
    processor: str | None = None                            # MCU / SoC / driver IC
    dimensions: str | None = None
    weight_grams: float | None = None
    degrees_of_freedom: int | None = None
    motor_type: str | None = None
    battery: str | None = None
    max_speed: str | None = None
    payload: str | None = None

    # ---- software & platform (proposal objective) -----------------------
    supported_os: list[str] = Field(default_factory=list)          # Windows/Linux/macOS/Android/iOS
    supported_platforms: list[str] = Field(default_factory=list)   # Arduino/Raspberry Pi/ESP32/micro:bit
    programming_languages: list[str] = Field(default_factory=list) # Python/C++/Scratch/Blockly
    ides_tools: list[str] = Field(default_factory=list)            # Arduino IDE/Thonny/VS Code
    ros_support: bool | None = None
    ros_version: str | None = None

    # ---- audience (proposal objective) ----------------------------------
    age_min: int | None = None
    age_max: int | None = None
    skill_level: str | None = None    # beginner | intermediate | advanced
    use_case: list[str] = Field(default_factory=list)  # educational/hobbyist/industrial/research

    # ---- seller ---------------------------------------------------------
    seller_name: str | None = None
    seller_url: str | None = None
    seller_verified: bool | None = None
    warranty: str | None = None
    shipping_info: str | None = None
    return_policy: str | None = None

    # ---- cross-site comparison -----------------------------------------
    match_key: str | None = None   # normalized name+model, groups listings across sites

    # ---- enrichment: deliberately NOT scraped ---------------------------
    # The proposal's differentiator is carrying what the vendor sites lack.
    # These stay empty after a crawl; `enrichment_status` tracks the editorial gap.
    tutorial_videos: list[dict[str, str]] = Field(default_factory=list)
    documentation_links: list[dict[str, str]] = Field(default_factory=list)
    community_links: list[dict[str, str]] = Field(default_factory=list)
    getting_started_guide: str | None = None
    editor_notes: str | None = None
    enrichment_status: str = "pending"   # pending | partial | complete

    # ---- provenance -----------------------------------------------------
    extraction_warnings: list[str] = Field(default_factory=list)
    raw_payload: dict[str, Any] | None = None
