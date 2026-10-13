"""Exports and image download.

Three outputs, each with a different consumer:

  robots.json   full fidelity, every field - the backend/API seed
  robots.csv    one flat row per robot - for review in Excel, and for the report
  products.csv  the column layout mock-server/products.csv already uses, so the
                existing RobotEShop UI can be pointed at real robot data without
                any change to the front end

Images are downloaded into ui/public/images/ so the UI serves them locally rather
than hot-linking the vendor's CDN.
"""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path

from .http import Fetcher
from .models import Robot


def _flatten(value) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, list):
        return "; ".join(
            v if isinstance(v, str) else json.dumps(v, ensure_ascii=False) for v in value)
    if isinstance(value, dict):
        return "; ".join(f"{k}: {v}" for k, v in value.items())
    return str(value)


def export_json(robots: list[Robot], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = [r.model_dump(exclude={"raw_payload"}) for r in robots]
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"  wrote {path}  ({len(robots)} robots)")


def export_csv(robots: list[Robot], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    columns = [
        "source_site", "source_url", "name", "brand", "model_number", "sku",
        "category", "subcategory", "source_categories", "price", "compare_at_price",
        "discount_pct", "currency", "in_stock", "stock_qty", "summary",
        "operating_voltage", "input_voltage", "processor", "interface",
        "connectivity", "sensors", "dimensions", "weight_grams",
        "degrees_of_freedom", "motor_type", "battery", "max_speed", "payload",
        "supported_platforms", "supported_os", "programming_languages",
        "ides_tools", "ros_support", "skill_level", "age_min", "age_max",
        "use_case", "features", "applications", "primary_image", "video_urls",
        "seller_name", "warranty", "match_key", "enrichment_status",
        "extraction_warnings", "specs_raw",
    ]
    with path.open("w", newline="", encoding="utf-8-sig") as fh:
        writer = csv.writer(fh)
        writer.writerow(columns)
        for robot in robots:
            data = robot.model_dump()
            writer.writerow([_flatten(data.get(col)) for col in columns])
    print(f"  wrote {path}  ({len(robots)} rows x {len(columns)} columns)")


def export_ui_products_csv(robots: list[Robot], path: Path) -> None:
    """Drop-in replacement for mock-server/products.csv."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["category", "subcategory", "name", "description", "url",
                         "price", "image"])
        for robot in robots:
            image = robot.images[0].local_path if robot.images and robot.images[0].local_path \
                else robot.primary_image or ""
            description = (robot.summary or robot.description_text or "")[:900]
            writer.writerow([
                (robot.category or "uncategorized").lower(),
                (robot.subcategory or "").lower(),
                robot.name,
                description.replace("\n", " "),
                image,
                f"{robot.price:.2f}" if robot.price is not None else "",
                image,
            ])
    print(f"  wrote {path}  (UI-compatible catalog)")


def _safe_filename(name: str, url: str) -> str:
    stem = re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_")[:70] or "product"
    ext = Path(url.split("?")[0]).suffix.lower()
    if ext not in (".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"):
        ext = ".jpg"
    return f"{stem}{ext}"


def download_images(robots: list[Robot], fetcher: Fetcher, image_dir: Path,
                    public_prefix: str = "/images", per_product: int = 3) -> int:
    """Fetch product images locally. Returns the number newly written."""
    image_dir.mkdir(parents=True, exist_ok=True)
    downloaded = 0
    seen: set[str] = set()

    for robot in robots:
        for index, image in enumerate(robot.images[:per_product]):
            if not image.url:
                continue
            filename = _safe_filename(f"{robot.name}_{index}" if index else robot.name,
                                      image.url)
            # Two products can generate the same slug; disambiguate rather than
            # letting one silently overwrite the other.
            candidate, counter = filename, 1
            while candidate in seen:
                stem, ext = Path(filename).stem, Path(filename).suffix
                candidate = f"{stem}_{counter}{ext}"
                counter += 1
            seen.add(candidate)

            target = image_dir / candidate
            if not target.exists():
                data = fetcher.get_bytes(image.url)
                if data is None:
                    continue
                target.write_bytes(data)
                downloaded += 1
            image.local_path = f"{public_prefix}/{candidate}"

    print(f"  downloaded {downloaded} new images into {image_dir}")
    return downloaded


def write_report(robots: list[Robot], path: Path) -> None:
    """Coverage report: what the crawl got, and where it fell short."""
    path.parent.mkdir(parents=True, exist_ok=True)
    total = len(robots) or 1

    def pct(n: int) -> str:
        return f"{n:4d}/{len(robots)}  ({n / total * 100:5.1f}%)"

    counts = {
        "has price": sum(1 for r in robots if r.price is not None),
        "has description": sum(1 for r in robots if r.description_text),
        "has specs": sum(1 for r in robots if r.specs_raw),
        "has images": sum(1 for r in robots if r.images),
        "categorized": sum(1 for r in robots if r.category),
        "brand identified": sum(1 for r in robots if r.brand),
        "model number": sum(1 for r in robots if r.model_number),
        "platform support": sum(1 for r in robots if r.supported_platforms),
        "programming langs": sum(1 for r in robots if r.programming_languages),
        "skill level": sum(1 for r in robots if r.skill_level),
        "in stock": sum(1 for r in robots if r.in_stock),
        "has video (rare)": sum(1 for r in robots if r.video_urls),
    }

    categories: dict[str, int] = {}
    for robot in robots:
        key = f"{robot.category or 'UNCLASSIFIED'} / {robot.subcategory or '-'}"
        categories[key] = categories.get(key, 0) + 1

    warnings: dict[str, int] = {}
    for robot in robots:
        for warning in robot.extraction_warnings:
            warnings[warning] = warnings.get(warning, 0) + 1

    lines = [
        "RobotEshop scrape coverage report",
        "=" * 60,
        f"robots: {len(robots)}",
        f"sites : {', '.join(sorted({r.source_site for r in robots}))}",
        "",
        "Field coverage",
        "-" * 60,
    ]
    lines += [f"  {label:<20} {pct(n)}" for label, n in counts.items()]
    lines += ["", "Categories", "-" * 60]
    lines += [f"  {count:4d}  {name}" for name, count in
              sorted(categories.items(), key=lambda kv: -kv[1])]
    lines += ["", "Extraction warnings", "-" * 60]
    lines += ([f"  {count:4d}  {name}" for name, count in
               sorted(warnings.items(), key=lambda kv: -kv[1])] or ["  none"])

    # Grouped by currency, not pooled. A run covering a PKR shop and a USD one
    # would otherwise print a single range mixing rupees with dollars and label
    # the whole thing PKR - a 100,000 there means something very different.
    by_currency: dict[str, list[float]] = {}
    for robot in robots:
        if robot.price is not None:
            by_currency.setdefault(robot.currency, []).append(robot.price)
    if by_currency:
        lines += ["", "Price range", "-" * 60]
        for currency, prices in sorted(by_currency.items()):
            prices.sort()
            lines.append(
                f"  {currency}  min {prices[0]:,.0f}   max {prices[-1]:,.0f}   "
                f"median {prices[len(prices) // 2]:,.0f}   ({len(prices)} priced)")

    path.write_text("\n".join(lines), encoding="utf-8")
    print(f"  wrote {path}")
    return "\n".join(lines)
