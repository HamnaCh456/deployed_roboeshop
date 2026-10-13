"""Write the tutorial catalogue and a coverage report.

`tutorials.json` is a plain array of `Tutorial` objects in the shape
`ui/src/types/index.ts` already declares, so the mock server can serve it
without a mapping layer and the UI can drop its static import for a fetch.

The report exists for the same reason `report.txt` does on the product side:
the interesting number is never "we got some", it is how many rows carry each
field. A tutorial with no matched parts is not a failure - it means we do not
stock what it needs - but it must be visible, not averaged away.
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from .models import Tutorial


def write_json(tutorials: list[Tutorial], path: Path) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = [t.model_dump(mode="json") for t in tutorials]
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return path


def _bar(count: int, total: int, width: int = 24) -> str:
    filled = round(width * count / total) if total else 0
    return "#" * filled + "." * (width - filled)


def report(tutorials: list[Tutorial]) -> str:
    total = len(tutorials)
    if not total:
        return "no tutorials"

    priced = [t for t in tutorials if t.parts]
    kit_totals = sorted(
        sum(p.qty * (p.price or 0) for p in t.parts) for t in priced
    )

    lines = [
        "=" * 62,
        f"tutorials: {total}",
        "=" * 62,
        "",
        "coverage",
        f"  with a priced parts list   {len(priced):>4} / {total}  "
        f"{_bar(len(priced), total)}",
        f"  with an author             "
        f"{sum(1 for t in tutorials if t.author):>4} / {total}",
        f"  with a publish date        "
        f"{sum(1 for t in tutorials if t.publishedAt):>4} / {total}",
        f"  with a series              "
        f"{sum(1 for t in tutorials if t.series):>4} / {total}",
        f"  with a video               "
        f"{sum(1 for t in tutorials if t.format == 'video'):>4} / {total}",
        "",
    ]

    if kit_totals:
        median = kit_totals[len(kit_totals) // 2]
        lines += [
            "kit cost, PKR (only tutorials whose parts we stock)",
            f"  cheapest {kit_totals[0]:>10,.0f}",
            f"  median   {median:>10,.0f}",
            f"  dearest  {kit_totals[-1]:>10,.0f}",
            "",
        ]

    for label, values in (
        # Publisher first, because it is the one breakdown that says where the
        # library came from rather than what is in it. A single-source build
        # prints one line; that is the useful signal, not clutter.
        ("published by", [t.sourceName for t in tutorials]),
        ("category", [t.category for t in tutorials]),
        ("level", [t.level for t in tutorials]),
        ("format", [t.format for t in tutorials]),
    ):
        lines.append(label)
        for name, count in Counter(values).most_common():
            lines.append(f"  {name:<32} {count:>4}  {_bar(count, total)}")
        lines.append("")

    platforms = Counter(p for t in tutorials for p in t.platforms)
    lines.append("platforms")
    for name, count in platforms.most_common(10):
        lines.append(f"  {name:<32} {count:>4}")
    if not platforms:
        lines.append("  (none detected)")
    lines.append("")

    parts = Counter(p.name for t in tutorials for p in t.parts)
    lines.append("most-used parts")
    for name, count in parts.most_common(12):
        lines.append(f"  {name[:44]:<46} {count:>4}")
    if not parts:
        lines.append("  (none matched)")

    return "\n".join(lines)


def write_report(tutorials: list[Tutorial], path: Path) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(report(tutorials), encoding="utf-8")
    return path
