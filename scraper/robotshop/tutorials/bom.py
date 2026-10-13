"""Turn a tutorial's prose into a priced bill of materials.

This is the half RobotShop cannot write. Their tutorial says "connect a
potentiometer to A0"; it does not and cannot say what a potentiometer costs in
Lahore today. Our catalogue knows that. Joining the two is the only reason this
page is worth more than a list of links.

How it works, and what it deliberately does not do
--------------------------------------------------
A curated vocabulary maps a part as a *writer* names it ("ultrasonic sensor",
"HC-SR04", "distance sensor") onto the tokens a *vendor* puts in a product
title. Anything not in the vocabulary is not guessed at - an unrecognised noun
is left out of the BOM rather than matched to something that merely shares a
word. A wrong price on a parts list is worse than a short parts list.

Candidate products are then ranked, and the tie-breakers matter:

1. A part named in the *title* is what the tutorial is about, and is scored
   above one mentioned once in a footnote.
2. Among equal matches, the *shortest* product name wins. Vendor titles grow by
   accretion - "L298N Motor Driver Module For Arduino Robot Car Kit 2WD 4WD" is
   the same chip as "L298N Motor Driver Module", but the long one is often a
   bundle. Shortest-name-first reliably picks the bare component.
3. Then cheapest, among products that are actually in stock and priced.

Only PKR listings are priced. `RATE_TO_PKR` in the mock server exists to put
USD listings on one axis for *sorting*; a converted number has no business in a
total a student might actually go and spend.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from ..enrich import _kw_match

#: canonical name -> (how a tutorial says it, tokens a product title must have)
_VOCABULARY: list[tuple[str, tuple[str, ...], tuple[str, ...]]] = [
    # -- controllers
    # The bare word "arduino" counts. On a *product* page it usually means
    # compatibility ("Jumper Wire For Arduino") and `enrich.py` rightly ignores
    # it; in a *tutorial* that teaches Arduino, you need an Arduino. The lesson
    # text often says only "connect it to your Arduino", never "Arduino Uno",
    # and a parts list for an Arduino lesson with no board on it is wrong.
    ("Arduino UNO R3", ("arduino uno", "uno r3", "arduino"), ("arduino", "uno")),
    ("Arduino Nano", ("arduino nano",), ("arduino", "nano")),
    ("Arduino Mega 2560", ("arduino mega", "mega 2560"), ("arduino", "mega")),
    ("Raspberry Pi", ("raspberry pi", "rpi"), ("raspberry", "pi")),
    ("ESP32 development board", ("esp32",), ("esp32",)),
    ("ESP8266 NodeMCU", ("esp8266", "nodemcu"), ("esp8266",)),
    ("micro:bit", ("micro:bit", "microbit"), ("micro:bit",)),

    # -- sensors
    # "ultrasonic" alone matched an *Ultrasonic Mist Maker* - a humidifier -
    # because it is the shortest product name carrying the word. Requiring
    # "sensor" as well is what separates a rangefinder from a fog machine.
    ("HC-SR04 ultrasonic sensor",
     ("hc-sr04", "hcsr04", "ultrasonic sensor", "ultrasonic range", "sonar sensor"),
     ("ultrasonic", "sensor")),
    ("Sharp IR distance sensor",
     ("ir distance", "sharp gp2", "infrared distance"), ("ir", "distance")),
    ("MPU6050 accelerometer / gyro",
     ("mpu6050", "mpu-6050", "accelerometer", "gyroscope", "imu"), ("mpu6050",)),
    ("Rotary potentiometer", ("potentiometer", "rotary pot"), ("potentiometer",)),
    ("LDR photoresistor", ("photoresistor", "ldr", "light dependent"), ("ldr",)),
    ("DHT11 temperature and humidity sensor",
     ("dht11", "dht-11", "temperature and humidity"), ("dht11",)),
    ("IR obstacle / line sensor",
     ("line sensor", "line follow", "obstacle sensor", "ir sensor module"),
     ("ir", "sensor")),
    ("Push button", ("push button", "pushbutton", "tactile switch"), ("push", "button")),
    ("Limit switch", ("limit switch", "micro switch"), ("limit", "switch")),
    ("Flex sensor", ("flex sensor", "bend sensor"), ("flex", "sensor")),
    ("Force sensitive resistor", ("force sensitive", "fsr"), ("force", "sensi")),
    # "encoder" alone resolved to a DTMF Encoder IC - a telephone tone chip.
    ("Rotary encoder", ("rotary encoder", "quadrature encoder"), ("rotary", "encoder")),

    # -- motors and drivers
    ("SG90 micro servo", ("sg90", "micro servo", "servo motor", "servo"), ("servo",)),
    ("L298N motor driver",
     ("l298n", "l298", "h-bridge", "h bridge", "motor driver", "motor controller"),
     ("l298",)),
    ("L293D motor driver", ("l293d", "l293"), ("l293",)),
    ("Geared DC motor", ("dc motor", "gear motor", "geared motor", "bo motor"),
     ("dc", "motor")),
    ("Stepper motor", ("stepper motor", "stepper"), ("stepper",)),
    ("ULN2003 stepper driver", ("uln2003",), ("uln2003",)),
    ("Brushless motor ESC", ("esc", "electronic speed control"), ("esc",)),

    # -- power
    ("18650 Li-ion cell", ("18650", "li-ion cell", "lithium cell"), ("18650",)),
    ("LiPo battery", ("lipo", "li-po", "lithium polymer"), ("lipo",)),
    ("9V battery", ("9v battery",), ("9v", "battery")),
    ("Battery holder", ("battery holder", "battery case"), ("battery", "holder")),
    ("LM2596 buck converter",
     ("buck converter", "step down converter", "lm2596", "voltage regulator"),
     ("lm2596",)),

    # -- prototyping and passives
    ("Breadboard", ("breadboard", "bread board", "solderless board"), ("breadboard",)),
    # Plural "wires" on purpose: singular "wire" resolved to a *JST Jumper Wire
    # Connector*, which is a crimp housing, not the ribbon of dupont leads a
    # tutorial means when it says "connect it with jumper wires".
    ("Jumper wires", ("jumper wire", "jumper cable", "dupont wire", "jumper leads"),
     ("jumper", "wires")),
    ("Resistor pack", ("resistor",), ("resistor",)),
    ("LED", ("led",), ("led",)),
    ("Capacitor", ("capacitor",), ("capacitor",)),

    # Bench tools are deliberately absent. The potentiometer lesson says "you
    # can test this using a multimeter", which is a true mention and a bad BOM
    # line: it put a Rs 4,500 instrument on the parts list for a Rs 30 part and
    # made the kit total meaningless. A bill of materials is what you buy to
    # build the thing, not the equipment you already own to debug it.

    # -- display, audio, comms
    ("16x2 LCD display", ("16x2", "lcd display", "lcd screen", "character lcd"), ("lcd",)),
    ("OLED display", ("oled",), ("oled",)),
    ("Buzzer", ("buzzer", "piezo"), ("buzzer",)),
    ("HC-05 Bluetooth module", ("hc-05", "hc05", "bluetooth module"), ("hc-05",)),
    ("NRF24L01 radio module", ("nrf24l01", "nrf24"), ("nrf24",)),

    # -- mechanical
    ("Robot chassis kit", ("robot chassis", "2wd chassis", "4wd chassis", "car chassis"),
     ("chassis",)),
    ("Wheel", ("wheel",), ("wheel",)),
    ("Caster wheel", ("caster",), ("caster",)),
]

#: Words that make a product title a bundle or an accessory for the real part.
#: "Servo Extension Cable" is not a servo; "Arduino Starter Kit" is not an Uno.
_BUNDLE_WORDS = re.compile(
    r"\b(kit|bundle|combo|pack of|starter|extension cable|holder for|"
    r"mount(ing)? bracket|spare|replacement|sticker|book|tester)\b", re.I
)

#: Mentions that are not the part. Writers explaining electricity reach for
#: mechanical analogies, and an inductors lesson that says "water wheel" six
#: times put a Rs 600 robot wheel on its parts list — frequency rules cannot
#: catch that, because the metaphor is the whole explanation.
#:
#: Keep this narrow. It is for words that mean something else in a fixed
#: phrase, not for suppressing matches that are merely unwanted.
_FALSE_CONTEXT: dict[str, re.Pattern[str]] = {
    "wheel": re.compile(r"(water|steering|fly|ferris|colour|color)\s*wheel", re.I),
    "led": re.compile(r"\b(controlled|called|pulled|filled|scaled)\b", re.I),
}


def _count_mentions(haystack: str, phrase: str) -> int:
    """Occurrences of `phrase`, minus the ones a false-context rule disowns."""
    if not _kw_match(haystack, phrase):
        return 0
    total = len(re.findall(re.escape(phrase), haystack))
    excluded = _FALSE_CONTEXT.get(phrase)
    if excluded is not None:
        total -= len(excluded.findall(haystack))
    return max(total, 0)


#: SEO padding some vendors put in the product title itself - "Buy HC-SR04
#: Ultrasonic Sensor Online | robostan.pk". It is the right product, but the
#: title reads badly on a receipt and its length beats cleaner listings under a
#: shortest-name rule, so it is ranked last among otherwise equal matches
#: rather than excluded.
_SEO_NOISE = re.compile(r"^buy\b|\bonline\b|\s\|\s|\bbest price\b|\bin pakistan\b", re.I)


def load_catalogue(path: Path) -> list[dict]:
    """In-stock, PKR-priced listings, smallest useful projection of each row."""
    rows = json.loads(Path(path).read_text(encoding="utf-8"))
    catalogue = []
    for row in rows:
        price = row.get("price")
        if not price or row.get("currency") != "PKR" or not row.get("in_stock"):
            continue
        name = (row.get("name") or "").strip()
        if not name:
            continue
        catalogue.append({
            "name": name,
            "lower": name.lower(),
            "price": float(price),
            "match_key": row.get("match_key"),
            "source_site": row.get("source_site"),
            "source_url": row.get("source_url"),
        })
    return catalogue


def _best_product(catalogue: list[dict], tokens: tuple[str, ...]) -> dict | None:
    """Cheapest, shortest, non-bundle product whose title carries every token.

    Tokens are matched with `_kw_match`, not `in`. This is the same trap that
    put "ros" inside *gyroscope* on the product side, arriving from the other
    direction: a plain substring test let the token "resistor" match
    "Photo-resistor", so an inductors explainer that mentions resistors was
    sold an LDR. The word-boundary matcher is the fix in both places.
    """
    hits = [p for p in catalogue if all(_kw_match(p["lower"], t) for t in tokens)]
    if not hits:
        return None
    clean = [p for p in hits if not _BUNDLE_WORDS.search(p["name"])]
    pool = clean or hits
    return min(
        pool,
        key=lambda p: (bool(_SEO_NOISE.search(p["name"])), len(p["name"]), p["price"]),
    )


def extract(body: str, title: str, catalogue: list[dict], limit: int = 8) -> list[dict]:
    """Parts the tutorial names, priced from the catalogue."""
    haystack = f"{title} {body}".lower()
    title_low = title.lower()

    scored: list[tuple[int, int, dict]] = []
    for canonical, phrases, tokens in _VOCABULARY:
        mentions = sum(_count_mentions(haystack, phrase) for phrase in phrases)
        if not mentions:
            continue

        in_title = any(_kw_match(title_low, phrase) for phrase in phrases)

        # One passing mention is not a part you build with. An inductors
        # explainer says "wheel" once, while listing where inductors turn up,
        # and that put a Rs 600 robot wheel on its parts list. A part you
        # actually use gets named again - in the hardware list, in the wiring,
        # in the code. Two mentions, or one in the title, is the bar.
        if mentions < 2 and not in_title:
            continue

        if in_title:
            mentions += 5
        product = _best_product(catalogue, tokens)
        if not product:
            continue
        scored.append((mentions, -len(canonical), {
            "name": product["name"],
            "qty": 1,
            "price": round(product["price"]),
            "matchKey": product["match_key"],
            "sourceSite": product["source_site"],
            "productUrl": product["source_url"],
        }))

    scored.sort(key=lambda row: (-row[0], row[1]))

    seen: set[str] = set()
    parts: list[dict] = []
    for _, _, part in scored:
        if part["name"] in seen:
            continue
        seen.add(part["name"])
        parts.append(part)
        if len(parts) >= limit:
            break
    return parts
