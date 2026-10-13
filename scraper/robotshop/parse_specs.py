"""Rule-based spec extraction. No LLM, no API key, no per-page cost.

Vendor description HTML is not prose - it is a label/value list wearing HTML.
Four shapes cover essentially everything seen on Pakistani robotics stores:

  1. <p><strong>Operating Voltage:</strong> 3V-5V DC.</p>     <- robo.pk
  2. <table><tr><td>Voltage</td><td>5V</td></tr></table>       <- WooCommerce
  3. <ul><li>Operating Voltage: 5V</li></ul>                   <- mixed
  4. bare text lines "Operating Voltage: 5V"                   <- fallback

Everything extracted is kept verbatim in `specs_raw`. Normalization into known
keys happens afterwards and never discards the original.
"""

from __future__ import annotations

import re

from bs4 import BeautifulSoup, Tag

# Some robo.pk descriptions were pasted straight out of a ChatGPT window and
# carry its entire DOM wrapper (conversation turns, prose classes, model slug).
# Left in place it pollutes description_text with UI scaffolding, so we drill
# down to the actual markdown body when that wrapper is detected.
_CHATGPT_WRAPPER_HINTS = (
    "data-message-author-role",
    "data-turn-id",
    "conversation-turn",
    "markdown prose",
)

# Labels that hold a list of things rather than a single value.
_LIST_LABELS = {"features", "applications", "sensors", "interface", "includes",
                "package includes", "what's included", "connectivity", "ports"}

# Label -> canonical spec key. Keys not listed still survive in specs_raw.
_LABEL_ALIASES = {
    "function": "function",
    "description": "function",
    "overview": "function",
    "operating voltage": "operating_voltage",
    "working voltage": "operating_voltage",
    "voltage": "operating_voltage",
    "supply voltage": "operating_voltage",
    "input voltage": "input_voltage",
    "power supply": "input_voltage",
    "power": "input_voltage",
    "interface": "interface",
    "communication": "interface",
    "communication protocol": "interface",
    "protocol": "interface",
    "connectivity": "connectivity",
    "wireless": "connectivity",
    "sensor ic": "processor",
    "driver ic": "processor",
    "chipset": "processor",
    "chip": "processor",
    "ic": "processor",
    "microcontroller": "processor",
    "mcu": "processor",
    "processor": "processor",
    "cpu": "processor",
    "sensors": "sensors",
    "sensor": "sensors",
    "features": "features",
    "key features": "features",
    "applications": "applications",
    "application": "applications",
    "uses": "applications",
    "dimensions": "dimensions",
    "size": "dimensions",
    "dimension": "dimensions",
    "weight": "weight",
    "display": "display",
    "resolution": "resolution",
    "current": "current",
    "operating current": "current",
    "frequency": "frequency",
    "range": "range",
    "measuring range": "range",
    "accuracy": "accuracy",
    "speed": "max_speed",
    "max speed": "max_speed",
    "rpm": "max_speed",
    "torque": "torque",
    "payload": "payload",
    "battery": "battery",
    "motor": "motor_type",
    "motor type": "motor_type",
    "material": "material",
    "temperature": "temperature_range",
    "operating temperature": "temperature_range",
    "warranty": "warranty",
    "brand": "brand",
    "model": "model_number",
    "model number": "model_number",
    "part number": "model_number",
    "sku": "sku",
    "degrees of freedom": "degrees_of_freedom",
    "dof": "degrees_of_freedom",
    "axis": "degrees_of_freedom",
    "axes": "degrees_of_freedom",
    "age": "age_range",
    "age range": "age_range",
    "recommended age": "age_range",
    "programming": "programming",
    "programming language": "programming",
    "software": "software",
    "compatible with": "compatibility",
    "compatibility": "compatibility",
    "supported platforms": "compatibility",
    "os": "supported_os",
    "operating system": "supported_os",
}


def clean_html(html: str | None) -> BeautifulSoup | None:
    if not html or not html.strip():
        return None
    soup = BeautifulSoup(html, "lxml")

    if any(hint in html for hint in _CHATGPT_WRAPPER_HINTS):
        inner = soup.select_one("div.markdown")
        if inner is not None:
            soup = BeautifulSoup(inner.decode(), "lxml")

    for junk in soup.select("script, style, noscript"):
        junk.decompose()
    return soup


def html_to_text(soup: BeautifulSoup | None) -> str:
    if soup is None:
        return ""
    text = soup.get_text("\n", strip=True)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _normalize_label(label: str) -> str:
    label = label.strip().rstrip(":：").strip()
    label = re.sub(r"\s+", " ", label)
    return label


def _clean_value(value: str) -> str:
    value = re.sub(r"\s+", " ", value).strip()
    value = value.lstrip(":：-–—").strip()
    return value.rstrip(".").strip() if value.endswith(".") else value


def _split_list(value: str) -> list[str]:
    """Split 'a, b and c' into parts, without shredding things like '3.3V, 5V'."""
    parts = re.split(r",(?![^()]*\))|\band\b|;|/(?=\s)", value)
    out = []
    for part in parts:
        part = _clean_value(part)
        if part and len(part) > 1:
            out.append(part)
    return out


def _record(specs_raw: dict[str, str], label: str, value: str) -> None:
    label, value = _normalize_label(label), _clean_value(value)
    if not label or not value or len(label) > 60:
        return
    # Repeated labels are appended rather than overwritten so nothing is lost.
    if label in specs_raw and value not in specs_raw[label]:
        specs_raw[label] = f"{specs_raw[label]} | {value}"
    else:
        specs_raw.setdefault(label, value)


def extract_label_values(soup: BeautifulSoup | None) -> dict[str, str]:
    """Pull every label/value pair out of a description, verbatim."""
    specs: dict[str, str] = {}
    if soup is None:
        return specs

    # -- shape 1: <strong>/<b> label followed by its value in the same block
    for strong in soup.find_all(["strong", "b"]):
        label = strong.get_text(" ", strip=True)
        if not label or not label.rstrip().endswith((":", "：")):
            # Accept a bare bold label only if it is short and its parent holds
            # extra text - otherwise it is just emphasis inside a sentence.
            if not label or len(label) > 40:
                continue
        value_parts: list[str] = []
        for sib in strong.next_siblings:
            if isinstance(sib, Tag):
                if sib.name in ("strong", "b"):
                    break  # next label begins
                value_parts.append(sib.get_text(" ", strip=True))
            else:
                value_parts.append(str(sib))
        value = " ".join(v for v in value_parts if v)
        if value.strip():
            _record(specs, label, value)

    # -- shape 2: two-column tables
    for row in soup.find_all("tr"):
        cells = row.find_all(["td", "th"])
        if len(cells) == 2:
            _record(specs, cells[0].get_text(" ", strip=True),
                    cells[1].get_text(" ", strip=True))

    # -- shape 3/4: "Label: value" inside list items or bare lines
    blocks = [li.get_text(" ", strip=True) for li in soup.find_all("li")]
    blocks += [p.get_text(" ", strip=True) for p in soup.find_all("p")]
    for block in blocks:
        m = re.match(r"^([A-Za-z][A-Za-z0-9 /&\-\.]{2,45})\s*[:：]\s*(.+)$", block)
        if m:
            _record(specs, m.group(1), m.group(2))

    return specs


def collect_bullets(soup: BeautifulSoup | None) -> list[str]:
    """Free-standing bullets that are not label/value pairs -> feature list."""
    if soup is None:
        return []
    bullets = []
    for li in soup.find_all("li"):
        text = li.get_text(" ", strip=True)
        if text and ":" not in text[:45] and 3 < len(text) < 300:
            bullets.append(text)
    return bullets


def normalize_specs(specs_raw: dict[str, str]) -> dict[str, object]:
    """Map recognised labels onto canonical keys; list-valued ones become lists."""
    out: dict[str, object] = {}
    for label, value in specs_raw.items():
        key = _LABEL_ALIASES.get(label.lower())
        if key is None:
            continue
        if label.lower() in _LIST_LABELS or key in ("features", "applications",
                                                    "sensors", "interface",
                                                    "connectivity"):
            items = _split_list(value)
            existing = out.get(key)
            if isinstance(existing, list):
                out[key] = existing + [i for i in items if i not in existing]
            else:
                out[key] = items
        else:
            out.setdefault(key, value)
    return out


def parse_description(html: str | None) -> dict[str, object]:
    """Full pass over one description blob."""
    soup = clean_html(html)
    specs_raw = extract_label_values(soup)
    return {
        "soup": soup,
        "text": html_to_text(soup),
        "specs_raw": specs_raw,
        "specs": normalize_specs(specs_raw),
        "bullets": collect_bullets(soup),
    }
