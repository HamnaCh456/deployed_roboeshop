"""Derive the fields the vendor sites never state explicitly.

robo.pk leaves `product_type` blank on all 144 products, ships no tags, and lists
"Robo.pk" as the vendor of every item. So category, brand, platform support,
programming languages, OS support, skill level and age band cannot be read off -
they have to be inferred from the title, description and collection membership.

Everything here is keyword/rule driven: deterministic, auditable, and free. Each
inference records its confidence so a later editorial pass can prioritise review
rather than re-checking all 144 rows by hand.
"""

from __future__ import annotations

import re

from .models import Robot

# ---------------------------------------------------------------------------
# Category taxonomy. First match wins, so order matters: more specific first.
# ---------------------------------------------------------------------------
_CATEGORY_RULES: list[tuple[str, str, tuple[str, ...]]] = [
    # Complete service and industrial robots must be tested FIRST. They are whole
    # machines, and the component rules below will happily shred one into a part:
    # BellaBot was landing in "Accessories / Enclosure & Mounting" and SwiftBot in
    # "Communication / Wireless Module", because a delivery robot's page mentions
    # a tray holder and a wireless link. The proposal covers industrial robots
    # alongside educational ones, so these need first refusal on the match.
    ("Service & Industrial Robots", "Delivery Robot",
     ("delivery robot", "food delivery robot", "serving robot", "courier robot",
      "room service robot", "tray delivery")),
    ("Service & Industrial Robots", "Cleaning Robot",
     ("cleaning robot", "scrubber", "sweeper", "floor scrubber", "robotic vacuum",
      "vacuum robot", "mopping robot")),
    ("Service & Industrial Robots", "Disinfection Robot",
     ("disinfection robot", "disinfection", "sterilization robot", "uv robot",
      "sanitizing robot")),
    # Only service-specific wording here. Bare "humanoid" / "quadruped" belong to
    # the "Robots" rules further down, which cover manufacturer hardware like the
    # Unitree G1 - duplicating those terms up here would shadow that category,
    # since first match wins.
    ("Service & Industrial Robots", "Social / Reception Robot",
     ("social robot", "reception robot", "receptionist robot",
      "companion robot", "telepresence")),
    ("Service & Industrial Robots", "Autonomous Mobile Robot",
     ("autonomous mobile robot", "amr", "agv", "vslam", "slam navigation",
      "autonomous navigation robot", "logistics robot", "warehouse robot")),
    ("Service & Industrial Robots", "Industrial Arm / Cobot",
     ("cobot", "collaborative robot", "industrial robot arm", "6-axis robot",
      "palletizing")),
    # Accessories and wiring come next. "Arduino Uno Transparent
    # Casing" and "Arduino Nano Programmer USB Cable" are accessories that
    # happen to have a board's name in the title; without these rules ahead of
    # the Controllers block they get filed as microcontroller boards.
    ("Accessories", "Enclosure & Mounting",
     ("casing", "enclosure", "acrylic case", "holder", "storage box",
      "component box", "tool box")),
    ("Prototyping", "Breadboard & Wiring",
     ("jumper", "dupont", "usb cable", "power cable", "ribbon cable")),
    # Complete robots, ahead of the kit rules. The taxonomy was written for a
    # components shop and had nowhere to put an actual robot, so every Unitree
    # product came out UNCLASSIFIED. These are whole machines, not kits: a
    # G1 humanoid is not an "Educational Robot Kit".
    ("Robots", "Humanoid Robot",
     ("humanoid", "biped robot", "bipedal")),
    ("Robots", "Quadruped Robot",
     ("quadruped", "quadrupedal", "robot dog", "robotic dog", "legged robot",
      "four-legged", "four legged")),
    ("Robot Kits", "Educational Robot Kit",
     ("robot kit", "robotic kit", "robot car", "smart car", "line follower",
      "obstacle avoid", "self balancing", "robotic arm kit", "starter kit",
      "learning kit", "educational kit")),
    ("Robot Kits", "Robotic Arm",
     ("robotic arm", "robot arm", "manipulator", "gripper")),
    ("Robot Kits", "Drone",
     ("drone", "quadcopter", "uav", "flight controller")),
    ("Controllers", "Microcontroller Board",
     ("arduino", "atmega", "stm32", "pic16", "microcontroller", "nucleo",
      "teensy", "micro:bit", "microbit")),
    ("Controllers", "Single Board Computer",
     ("raspberry pi", "jetson", "orange pi", "banana pi", "rock pi",
      "beaglebone", "single board computer")),
    ("Controllers", "WiFi / IoT Board",
     ("esp32", "esp8266", "nodemcu", "wemos", "wifi module", "esp-")),
    ("Motors & Actuators", "Servo Motor",
     ("servo",)),
    ("Motors & Actuators", "Stepper Motor",
     ("stepper", "nema")),
    ("Motors & Actuators", "DC Motor",
     ("dc motor", "gear motor", "gearmotor", "bo motor", "n20", "encoder motor")),
    ("Motors & Actuators", "Motor Driver",
     ("motor driver", "l298", "l293", "tb6600", "a4988", "drv8", "esc",
      "h-bridge", "hbridge")),
    ("Motors & Actuators", "Pump / Solenoid",
     ("solenoid", "water pump", "air pump", "linear actuator")),
    ("Motors & Actuators", "Vibration Motor",
     ("vibration motor", "coin motor", "vibrating motor")),
    # Last of the motor rules on purpose, so "motor driver", "servo" and
    # "stepper" above still claim their own. Without a bare `motor` rule the
    # joint actuators Unitree sells standalone ("Unitree A1 Motor",
    # "GO-M8010-6 Motor") matched nothing at all.
    ("Motors & Actuators", "Motor",
     ("motor", "actuator")),
    ("Sensors", "Distance / Proximity Sensor",
     ("ultrasonic", "hc-sr04", "lidar", "tof", "vl53", "sharp ir", "proximity",
      "infrared sensor", "ir sensor")),
    ("Sensors", "Motion / IMU Sensor",
     ("gyroscope", "accelerometer", "imu", "mpu6050", "mpu9250", "compass",
      "magnetometer", "tilt", "vibration sensor", "speed sensor",
      "rotary encoder", "flex sensor", "bend detection", "hall sensor")),
    ("Sensors", "Environmental Sensor",
     ("temperature", "humidity", "dht11", "dht22", "ds18b20", "bmp", "bme",
      "pressure sensor", "gas sensor", "mq-", "smoke", "air quality", "rain",
      "soil moisture", "water level", "flame", "water flow", "flow sensor")),
    ("Sensors", "Real-Time Clock",
     ("rtc", "real time clock", "real-time clock", "ds1307", "ds3231")),
    ("Sensors", "Optical / Vision Sensor",
     ("camera", "ov7670", "esp32-cam", "colour sensor", "color sensor", "tcs",
      "light sensor", "ldr", "photoresistor", "line sensor")),
    ("Sensors", "Current / Voltage Sensor",
     ("current sensor", "acs712", "voltage sensor", "ina219", "load cell", "hx711")),
    ("Sensors", "Biometric / Touch Sensor",
     ("fingerprint", "pulse sensor", "heart rate", "touch sensor", "capacitive touch",
      "emg", "muscle sensor", "ecg")),
    ("Communication", "Wireless Module",
     ("bluetooth", "hc-05", "hc-06", "hc05", "nrf24", "lora", "zigbee", "rf module",
      "gsm", "gps", "sim800", "sim900", "neo-6m", "rfid", "nfc", "rc522",
      "card reader", "ir receiver", "infrared receiver")),
    ("Display & Audio", "LED Module",
     ("traffic light", "led module", "rgb led", "ws2812", "neopixel",
      "led matrix", "led strip")),
    ("Display & Audio", "Display Module",
     ("lcd", "oled", "tft", "display", "seven segment", "7 segment",
      "e-paper", "epaper")),
    ("Display & Audio", "Audio Module",
     ("speaker", "buzzer", "microphone", "mp3", "audio", "voice record",
      "sound sensor", "amplifier")),
    ("Power", "Battery",
     ("battery", "lipo", "li-ion", "18650", "lithium")),
    ("Power", "Power Module",
     ("power supply", "buck", "boost", "voltage regulator", "charger", "ups",
      "converter", "smps", "solar panel")),
    ("Mechanical", "Wheels & Chassis",
     ("wheel", "chassis", "caster", "track", "tyre", "tire", "coupling",
      "bracket", "mount", "gearbox", "pulley", "belt", "bearing")),
    ("Prototyping", "Breadboard & Wiring",
     ("breadboard", "jumper", "dupont", "wire", "cable", "connector", "header",
      "veroboard", "pcb", "solder")),
    ("Prototyping", "Components",
     ("resistor", "capacitor", "transistor", "diode", "led", "switch", "button",
      "potentiometer", "relay", "fuse", "crystal", "ic socket", "joystick",
      "keypad", "buzzer", "heat sink",
      # robostan.pk is as much a components distributor as a robotics shop:
      # discrete semiconductors are ~200 of its 830 products and none of them
      # matched a rule before.
      "mosfet", "igbt", "thyristor", "triac", "optocoupler", "opto coupler",
      "opto-coupler", "voltage comparator", "op-amp", "opamp", "555 timer",
      "shift register", "logic gate", "seven segment", "trimmer")),
    # Late on purpose: "controller" also ends "DC Motor Speed Controller" and
    # "flight controller", both of which are claimed by rules above.
    ("Accessories", "Remote & Control",
     ("remote control", "controller", "transmitter", "teleoperation")),
    ("Tools", "Tools & Equipment",
     ("multimeter", "soldering", "screwdriver", "plier", "cutter", "heat shrink",
      "glue gun", "tweezer", "oscilloscope", "programmer", "burner", "usbasp",
      "logic analyzer", "function generator", "power supply unit")),
]

# Real manufacturer brands. The shop's own name is never a brand.
_BRANDS = [
    "Arduino", "Raspberry Pi", "Espressif", "Adafruit", "SparkFun", "Seeed Studio",
    "DFRobot", "Waveshare", "Pololu", "STMicroelectronics", "Texas Instruments",
    "NVIDIA", "Makeblock", "LEGO", "mBot", "Elegoo", "Keyestudio", "Robotis",
    "Dynamixel", "Orange Pi", "BBC micro:bit", "Sunfounder", "Yahboom", "Hiwonder",
    "UBTECH", "Tower Pro", "Hitec", "Futaba", "Savox", "JGB", "Nema",
    # Legged/humanoid robot makers, and the module brands robostan.pk resells.
    "Unitree", "Boston Dynamics", "Ubiquity", "Slamtec", "Livox",
]

_PLATFORM_KEYWORDS = {
    "Arduino": ("arduino", "atmega", "uno", "nano", "mega2560", "atmega328"),
    "Raspberry Pi": ("raspberry pi", "raspi", "rpi"),
    "ESP32": ("esp32",),
    "ESP8266": ("esp8266", "nodemcu"),
    "STM32": ("stm32",),
    "micro:bit": ("micro:bit", "microbit"),
    "NVIDIA Jetson": ("jetson",),
    "PIC": ("pic16", "pic18", "pic micro"),
    "Nvidia/PC": ("usb to pc", "pc based"),
}

_OS_KEYWORDS = {
    "Windows": ("windows",),
    "Linux": ("linux", "ubuntu", "debian", "raspbian", "raspberry pi os"),
    "macOS": ("macos", "mac os", "osx"),
    "Android": ("android",),
    "iOS": ("ios", "iphone"),
}

_LANG_KEYWORDS = {
    "C/C++": ("c++", "cpp", "arduino c", "embedded c", " c language"),
    "Python": ("python", "micropython", "circuitpython"),
    "MicroPython": ("micropython",),
    "Scratch": ("scratch",),
    "Blockly": ("blockly", "block-based", "block based", "graphical programming"),
    "JavaScript": ("javascript", "node.js", "nodejs"),
    "Java": ("java ",),
    "MATLAB": ("matlab",),
}

_IDE_KEYWORDS = {
    "Arduino IDE": ("arduino ide", "arduino"),
    "Thonny": ("thonny",),
    "VS Code": ("vs code", "visual studio code", "platformio"),
    "PlatformIO": ("platformio",),
    "Raspberry Pi OS": ("raspberry pi os",),
    "MakeCode": ("makecode",),
    "Keil": ("keil",),
    "STM32CubeIDE": ("cubeide", "stm32cube"),
}

_INTERFACE_KEYWORDS = {
    "I2C": ("i2c", "iic", "twi"),
    "SPI": ("spi",),
    "UART": ("uart", "serial", "ttl"),
    "USB": ("usb",),
    "PWM": ("pwm",),
    "Analog": ("analog", "adc"),
    "Digital": ("digital output", "digital input"),
    "CAN": ("can bus", "canbus"),
    "1-Wire": ("1-wire", "one wire"),
}

_CONNECTIVITY_KEYWORDS = {
    "WiFi": ("wifi", "wi-fi", "802.11"),
    "Bluetooth": ("bluetooth", "hc-05", "hc-06"),
    "BLE": ("ble", "bluetooth low energy"),
    "LoRa": ("lora",),
    "Zigbee": ("zigbee",),
    "GSM/GPRS": ("gsm", "gprs", "sim800", "sim900"),
    "GPS": ("gps", "neo-6m", "gnss"),
    "RF 433MHz": ("433mhz", "rf module"),
    "NFC/RFID": ("rfid", "nfc", "mfrc522"),
    "Ethernet": ("ethernet", "w5100", "enc28j60"),
}

_USE_CASE_KEYWORDS = {
    "educational": ("student", "education", "learning", "school", "beginner",
                    "stem", "classroom", "teaching", "tutorial"),
    "hobbyist": ("hobby", "diy", "maker", "project"),
    "research": ("research", "laboratory", "lab ", "prototyping", "university"),
    "industrial": ("industrial", "automation", "cnc", "factory", "heavy duty",
                   "commercial"),
}


def _kw_match(text: str, keyword: str) -> bool:
    """Keyword match anchored at the start of a word.

    Plain substring matching is actively wrong on this vocabulary: "ros" hits
    inside "gy-ros-cope", "ble" inside "addressa-ble", "led" inside "control-led".
    All three produced real mis-classifications. A *leading* word boundary kills
    every one of them, since the false hit is always mid-word.

    A trailing boundary is deliberately NOT applied to longer keywords: it would
    stop "voice record" matching "voice recording" and "sensor" matching
    "sensors", which is normal English stemming rather than a false positive.
    Short all-letter keywords ("ros", "ble", "led", "usb") do get both edges,
    because for them the risk runs the other way. Keywords ending in punctuation
    ("esp-", "mq-", "i2c") are prefixes by intent, so they stay leading-only.
    """
    return _kw_pattern(keyword).search(text) is not None


def _kw_pattern(keyword: str) -> "re.Pattern[str]":
    """The one place the boundary rule above is expressed.

    Both `_kw_match` and `_kw_count` need it, and two copies of a rule this
    fiddly would drift the first time one of them was fixed.
    """
    tail = r"(?![a-z0-9])" if len(keyword) <= 4 and keyword.isalpha() else ""
    return re.compile(rf"(?<![a-z0-9]){re.escape(keyword)}{tail}")


def _any_kw(text: str, keywords) -> bool:
    return any(_kw_match(text, k) for k in keywords)


def _haystack(robot: Robot) -> str:
    """Everything textual about a product, lowercased, for keyword matching."""
    parts = [
        robot.name or "",
        robot.description_text or "",
        " ".join(robot.source_categories),
        " ".join(robot.tags),
        " ".join(f"{k} {v}" for k, v in robot.specs_raw.items()),
    ]
    return " ".join(parts).lower()


def _match_keywords(text: str, table: dict[str, tuple[str, ...]]) -> list[str]:
    return [name for name, kws in table.items() if _any_kw(text, kws)]


# A board name in a title usually describes compatibility, not identity:
# "Jumper Wire For Arduino" is wire, "HC05 Bluetooth Module for Arduino" is a
# radio. Treating these as evidence of "Microcontroller Board" mis-filed 20 of
# robo.pk's 144 products, so platform words get stricter handling everywhere.
_PLATFORM_WORDS = {
    "arduino", "raspberry pi", "raspi", "rpi", "esp32", "esp8266", "nodemcu",
    "stm32", "micro:bit", "microbit", "atmega", "pic16", "jetson", "teensy",
}

_COMPAT_PREFIX = re.compile(
    r"\b(for|with|compatible|compatible with|supports?|works?\s+with|suitable)\s*(the\s+)?$")

# Words that name what a product IS when they appear in its title, and mean
# nothing at all in a description. Same failure mode as the platform words above,
# different vocabulary: every robot's marketing copy brags about its "powerful
# motors", which filed the As2 quadruped under Motors & Actuators, and the Z1
# robotic arm describes itself as "designed for Unitree robot dogs", which filed
# an arm as a quadruped. Neither page is lying - the words just describe parts
# and companions rather than the product itself.
#
# Unlike the platform words these are not required to sit near the head of the
# title: "GO-M8010-6 Motor" and "Unitree A1 Motor" both name the thing last.
_TITLE_ONLY_WORDS = {
    "motor", "actuator", "robot dog", "robotic dog", "controller", "battery",
}


def _is_identity_mention(name: str, keyword: str) -> bool:
    """True when `keyword` names what the product IS, not what it works with.

    Two signals: it must not follow "for"/"compatible with", and it must appear
    near the head of the title. "Arduino Nano V3.0" is a board; "Traffic Light
    Module Arduino" is not.
    """
    for m in re.finditer(rf"(?<![a-z0-9]){re.escape(keyword)}", name):
        if _COMPAT_PREFIX.search(name[:m.start()]):
            continue
        if len(name[:m.start()].split()) > 2:
            continue
        return True
    return False


def _rule_matches(scope: str, keywords, *, name_scope: bool) -> bool:
    for keyword in keywords:
        if keyword in _PLATFORM_WORDS:
            # Platform words are only ever evidence inside the title, and only
            # as an identity mention. In the description they say nothing -
            # nearly every product lists "Applications: Arduino, ...".
            if name_scope and _is_identity_mention(scope, keyword):
                return True
            continue
        if keyword in _TITLE_ONLY_WORDS:
            if name_scope and _kw_match(scope, keyword):
                return True
            continue
        if _kw_match(scope, keyword):
            return True
    return False


# Collections specific enough to be trusted outright. The broad ones
# ("Accessories", "Sensors And Modules") say too little to fix a subcategory,
# and "New Arrivals" / "Featured Products" are merchandising, not taxonomy.
_SPECIFIC_COLLECTIONS = {
    "micro controllers": ("Controllers", "Microcontroller Board"),
    "microcontrollers": ("Controllers", "Microcontroller Board"),
    "boards": ("Controllers", "Development Board"),
    "dev boards": ("Controllers", "Development Board"),
    "motors": ("Motors & Actuators", "Motor"),
    "robotic kits": ("Robot Kits", "Educational Robot Kit"),
    "batteries and power modules": ("Power", "Battery"),
    "wheels and chassis": ("Mechanical", "Wheels & Chassis"),
    "displays": ("Display & Audio", "Display Module"),
    "cablles": ("Prototyping", "Breadboard & Wiring"),
    "cables": ("Prototyping", "Breadboard & Wiring"),
    # robostan.pk's WooCommerce categories. Unlike robo.pk's Shopify
    # collections these are per-product and specific, so they are the vendor's
    # own answer and outrank our keyword guesses. Names are verbatim, including
    # the shop's own capitalisation quirks ("IC'S", "IGBT'S").
    "ic's": ("Prototyping", "Components"),
    "smd ic's": ("Prototyping", "Components"),
    "ic sockets": ("Prototyping", "Components"),
    "mosfet": ("Prototyping", "Components"),
    "igbt's": ("Prototyping", "Components"),
    "transistors": ("Prototyping", "Components"),
    "diodes": ("Prototyping", "Components"),
    "optocoupler": ("Prototyping", "Components"),
    "crystal oscillators": ("Prototyping", "Components"),
    "pin headers": ("Prototyping", "Breadboard & Wiring"),
    "connectors": ("Prototyping", "Breadboard & Wiring"),
    "relay": ("Prototyping", "Components"),
    "analog to digital converters": ("Prototyping", "Components"),
    "project boards": ("Prototyping", "Prototyping Board"),
    "breakout boards": ("Controllers", "Development Board"),
    "stm boards": ("Controllers", "Development Board"),
    "zigbee boards": ("Communication", "Wireless Module"),
    "motherboards": ("Controllers", "Development Board"),
    "programmer and burners": ("Tools", "Tools & Equipment"),
    "tools and instruments": ("Tools", "Tools & Equipment"),
    "tools and kits": ("Tools", "Tools & Equipment"),
    "digital and multi-meters": ("Tools", "Tools & Equipment"),
    "multimeters": ("Tools", "Tools & Equipment"),
    "oscilloscope": ("Tools", "Tools & Equipment"),
    "lcds": ("Display & Audio", "Display Module"),
    "quadcopters": ("Robot Kits", "Drone"),
    "sensor": ("Sensors", "Sensor Module"),
    "battery": ("Power", "Battery"),
    # Unitree's Shopify collections. Only this one is a real category; the rest
    # ("Education & Industry", "b2c", "frontpage") are merchandising and are
    # listed in _IGNORED_COLLECTIONS instead.
    "humanoid robot": ("Robots", "Humanoid Robot"),
}

# Broad collections: used only as a last resort, after keywords have failed.
_BROAD_COLLECTIONS = {
    "sensors and modules": ("Sensors", "Sensor Module"),
    "accessories": ("Accessories", "General Accessory"),
}

_IGNORED_COLLECTIONS = {"new arrivals", "featured products", "all products",
                        # Unitree's merchandising buckets. "Education & Industry"
                        # holds an industrial quadruped and a humanoid side by
                        # side, so it says nothing about what a product is.
                        "education & industry", "education industry", "b2c",
                        "frontpage", "home page"}

# ---------------------------------------------------------------------------
# Model lines: when the model name IS the category.
#
# Keyword rules read the words on the page, and for a robot manufacturer there
# are no useful words to read. Unitree's own copy for the G1 humanoid never says
# "humanoid"; the Go2 quadruped never says "quadruped" or even "robot"; the A2
# page is a paragraph about walking range. Marketing copy describes what a robot
# achieves, not what shape it is.
#
# But the model name is unambiguous to anyone who knows the catalog: H/G/R is the
# humanoid line, Go/A/B/Aliengo the quadrupeds, Z the arms. That is real, stable
# vendor knowledge, so it is written down here rather than guessed at from prose.
# Matched against the title only, and only for the site it belongs to.
# ---------------------------------------------------------------------------
_MODEL_LINES: dict[str, tuple[tuple[str, str, str], ...]] = {
    "unitree": (
        (r"^(unitree\s+)?[hgr]\d+(-\w+)?(\s+plus)?$", "Robots", "Humanoid Robot"),
        (r"^(unitree\s+)?(go\d*|as?\d+|b\d+)(-\w+)?$", "Robots", "Quadruped Robot"),
        (r"^aliengo$", "Robots", "Quadruped Robot"),
        (r"^(unitree\s+)?z\d+$", "Robot Kits", "Robotic Arm"),
    ),
}

# A model name in the title of a *part* names the robot the part belongs to, not
# the part: "Go2 Battery" is a battery, "Unitree A1 Motor" is a motor. When one
# of these appears the model table stands down and the keyword rules decide.
_PART_OF_ROBOT_WORDS = (
    "battery", "charger", "motor", "controller", "cable", "dock", "case",
    "cover", "mount", "spare", "fee", "service", "remote", "hand", "gripper",
    "lidar", "camera", "sensor", "kit",
)


def classify_by_model_line(robot: Robot) -> tuple[str, str] | None:
    site = (robot.source_site or "").lower()
    patterns = next((v for k, v in _MODEL_LINES.items() if k in site), None)
    if not patterns:
        return None
    # "Unitree H1（Contact us for the real price）" - the vendor puts pricing
    # notes in the title, in full-width brackets. Strip any bracketed aside.
    name = re.sub(r"[（(\[].*?[）)\]]", " ", (robot.name or "").lower())
    name = re.sub(r"\s+", " ", name).strip()
    if any(word in name for word in _PART_OF_ROBOT_WORDS):
        return None
    for pattern, category, subcategory in patterns:
        if re.match(pattern, name):
            return category, subcategory
    return None


def classify_category(robot: Robot, text: str) -> tuple[str | None, str | None]:
    collections = [c.lower().strip() for c in robot.source_categories]
    name = (robot.name or "").lower()

    # 1. A specific collection is the vendor's own answer - trust it, then try
    #    to sharpen the subcategory with a keyword rule inside that category.
    for collection in collections:
        if collection in _IGNORED_COLLECTIONS:
            continue
        if collection in _SPECIFIC_COLLECTIONS:
            category, subcategory = _SPECIFIC_COLLECTIONS[collection]
            for cat, sub, keywords in _CATEGORY_RULES:
                if cat == category and _rule_matches(name, keywords, name_scope=True):
                    return cat, sub
            return category, subcategory

    # 2. A known model line names the product outright, and beats guessing from
    #    prose that never states the form factor.
    model_line = classify_by_model_line(robot)
    if model_line:
        return model_line

    # 3. Keyword rules over the title.
    for cat, sub, keywords in _CATEGORY_RULES:
        if _rule_matches(name, keywords, name_scope=True):
            return cat, sub

    # 4. Keyword rules over the full text, platform words excluded.
    for cat, sub, keywords in _CATEGORY_RULES:
        if _rule_matches(text, keywords, name_scope=False):
            return cat, sub

    # 5. A broad collection is better than nothing.
    for collection in collections:
        if collection in _BROAD_COLLECTIONS:
            return _BROAD_COLLECTIONS[collection]

    return None, None


def detect_brand(robot: Robot, text: str) -> str | None:
    """The manufacturer, which is not the same thing as the shop.

    robo.pk sets `vendor` and JSON-LD `brand` to "Robo.pk" on all 144 products,
    so trusting the source here would label every item with the retailer. A brand
    is only accepted when it names a real manufacturer AND appears in the product
    title or the vendor field - a mention buried in an "Applications: Arduino,
    drones..." line says what the part works with, not who made it.
    """
    name = robot.name or ""
    for brand in _BRANDS:
        if re.search(rf"(?<![a-z0-9]){re.escape(brand)}(?![a-z0-9])", name, re.IGNORECASE):
            return brand

    # The vendor field, when it names a manufacturer we know. An unrecognised
    # vendor is deliberately NOT accepted here - on a reseller it is the shop's
    # own name, and enrich() handles that case separately after the retailer test.
    return canonical_brand(robot.vendor)


def canonical_brand(value: str | None) -> str | None:
    """Map a store's spelling of a manufacturer onto the canonical one.

    A brand string that starts with a known brand is that brand, written the
    store's own way: shop.unitree.com states "UnitreeRobotics" as both the
    vendor and the JSON-LD brand on all 30 products. Recording the canonical
    "Unitree" keeps one manufacturer under one name when it also turns up in a
    reseller's catalog - which is the entire point of comparing across sites.

    Returns None when the string matches no known brand, so callers can tell
    "this is Unitree" from "this is some name we do not recognise".
    """
    normalized = re.sub(r"[^a-z0-9]", "", (value or "").lower())
    if not normalized:
        return None
    for brand in _BRANDS:
        key = re.sub(r"[^a-z0-9]", "", brand.lower())
        if key and normalized.startswith(key):
            return brand
    return None


def is_retailer_name(candidate: str | None, robot: Robot) -> bool:
    """True when a 'brand' is really just the shop selling it.

    The test is against the *domain*, deliberately. It used to also compare
    against `seller_name`, which is circular: the Shopify adapter sets
    `seller_name = vendor`, so every vendor matched itself and was thrown away.
    That is harmless on robo.pk, where the vendor really is the shop, and wrong
    on a manufacturer-run store - it discarded "UnitreeRobotics" on all 30
    products of shop.unitree.com, where the vendor is the actual brand.

    Domain matching stays deliberately loose in one direction: robo.pk's vendor
    string is "Robo.pk" and its domain "robo.pk", but a shop is also entitled to
    call itself "Robo" on "robo.pk". So a candidate contained in the domain is
    still treated as the retailer.
    """
    if not candidate:
        return False
    normalized = re.sub(r"[^a-z0-9]", "", candidate.lower())
    if not normalized:
        return False
    # Storefront subdomains are not part of the shop's name: on
    # "shop.unitree.com" the shop is Unitree, not "shop".
    host = (robot.source_site or "").lower()
    labels = [l for l in host.split(".") if l not in ("www", "shop", "store")]
    site = re.sub(r"[^a-z0-9]", "", ".".join(labels))
    return bool(site) and normalized in site


# Strings that look like part numbers but are specs, packaging or marketing.
_MODEL_BLACKLIST = {
    "HD65K", "65K", "RGB", "LED", "LCD", "TFT", "IPS", "USB", "DC", "AC", "PCS",
    "MM", "CM", "KG", "MAH", "RPM", "MHZ", "KHZ", "GHZ", "V2", "V3", "PACK",
    "SET", "PCB", "IO", "IC", "PWM", "ADC", "SPI", "I2C", "UART", "TTL",
    # IC package types. "DIP-8" describes the plastic the chip is in, not which
    # chip it is: it grouped 11 unrelated robostan/instock parts into one
    # "product" whose prices ranged from 0 to 2,390.
    "DIP8", "DIP14", "DIP16", "DIP18", "DIP20", "DIP28", "DIP40",
    "SOP8", "SOP14", "SOP16", "SOIC8", "SSOP", "TSSOP", "TQFP", "QFN", "QFP",
    "TO220", "TO92", "TO247", "SMD", "SMT", "THT",
    # Buses, protocols and connectors. "RS232" spanned 110 to 155,000 PKR.
    "RS232", "RS485", "RS422", "RJ45", "RJ11", "HDMI", "VGA", "DVI", "SATA",
    "PCIE", "GPIO", "JTAG", "SWD", "CAN", "ETH", "POE", "OTG", "AUX",
    # Physical/format descriptors that regex mistakes for part numbers.
    "12V", "24V", "5V", "3V3", "AA", "AAA", "18650", "PLA", "ABS", "PETG",
}

# Chip *families*, not products. An "ESP32" board and another "ESP32" board are
# not the same item, so these must never anchor a cross-site price comparison -
# 16 different STM32 boards were being compared as one product, 550 vs 49,800.
# A more specific variant ("ESP32-C3", "ATMEGA328P") is fine and stays.
_BROAD_MODEL_FAMILIES = {
    "stm32", "esp32", "esp8266", "atmega", "attiny", "pic", "avr", "arm",
    "arduino", "raspberry", "nema", "mq", "ky", "hc",
    # Chips that sit *inside* many different boards. Where the chip is the
    # product ("ACS712 module", "TP4056 charger") the model key is exactly
    # right; where it is one component of a bigger board it is not. BCM2835 is
    # the Raspberry Pi SoC and was grouping five different Pi products;
    # HD44780 is the controller in every 16x2 character LCD.
    "bcm2835", "bcm2711", "bcm2712", "hd44780", "atmega328", "atmega2560",
    "ch340", "ch340g", "cp2102", "ft232", "ft232rl",
    # D-sub connector shells - a form factor, like DIP-8.
    "db9", "db15", "db25", "db37",
}


def detect_model_number(robot: Robot) -> str | None:
    """Part numbers like MPU6050, HC-SR04, L298N, ST7735S carry the identity.

    The chip named in a "Sensor IC" / "Driver IC" spec is more trustworthy than
    anything regexed out of a marketing title: the 0.96" display is titled
    "...160x80 HD 65K SPI..." which yields the meaningless "HD65K", while its
    Driver IC field correctly says ST7735S.
    """
    for key in ("model_number", "processor"):
        value = robot.specs.get(key)
        if isinstance(value, str):
            m = re.search(r"\b([A-Z]{2,6}\d{3,5}[A-Z]{0,3})\b", value.upper())
            if m and m.group(1) not in _MODEL_BLACKLIST:
                return m.group(1)

    name = robot.name or ""
    patterns = [
        r"\b([A-Z]{2,5}\d{2,5}-[A-Z]\d{0,2})\b",          # ESP32-C3, ESP32-S3
        # Letters-hyphen-letters-digits must come first, else "HC-SR04" matches
        # only its tail and is recorded as "SR04" - a different part entirely.
        r"\b([A-Z]{1,5}-[A-Z]{0,5}\d{1,5}[A-Z]{0,3})\b",  # HC-SR04, MQ-2, VL53-L0
        r"\b([A-Z]{2,5}[- ]?\d{2,5}[A-Z]{0,3})\b",        # MPU6050, ST7735S
        r"\b(L\d{3}[A-Z]?)\b",                            # L298N
        r"\b(NEMA\s?\d{2})\b",
        r"\b(SG\d{2,3})\b",                               # SG90
    ]
    for pat in patterns:
        for m in re.finditer(pat, name):
            raw = m.group(1).upper().replace(" ", "")
            if raw.replace("-", "") not in _MODEL_BLACKLIST and not raw.isdigit():
                return raw
    return None


def estimate_skill_and_age(robot: Robot, text: str) -> tuple[str | None, int | None, int | None]:
    """Age bands are almost never stated, so infer a defensible default."""
    explicit = re.search(r"(?:age|ages)\s*[:\-]?\s*(\d{1,2})\s*(?:\+|-|to)\s*(\d{1,2})?", text)
    if explicit:
        lo = int(explicit.group(1))
        hi = int(explicit.group(2)) if explicit.group(2) else None
        level = "beginner" if lo < 12 else "intermediate"
        return level, lo, hi

    if _any_kw(text, ("scratch", "blockly", "drag and drop", "no coding",
                      "block-based", "kids", "children")):
        return "beginner", 8, 14
    if _any_kw(text, ("plug and play", "beginner", "easy to use",
                      "starter kit", "learning kit", "student")):
        return "beginner", 12, None
    # "ros" must be a whole token here - it hides inside "gyroscope".
    if _any_kw(text, ("ros", "ros2", "industrial", "advanced", "professional",
                      "jetson", "slam", "autonomous navigation")):
        return "advanced", 18, None
    if _any_kw(text, ("soldering required", "stm32", "register level",
                      "embedded c")):
        return "intermediate", 16, None
    # A bare component is not a toy; treat as hobbyist-intermediate by default.
    return "intermediate", 14, None


def enrich(robot: Robot) -> Robot:
    # A price of 0 is never real in a shop - it is how these platforms represent
    # "call for price" or an unconfigured variable product. 115 rows arrived that
    # way, and because MIN(price) drives the comparison view, each one presented
    # itself as the unbeatable best price for its group. Record it as unknown.
    if robot.price == 0:
        robot.price = None
        robot.availability_text = robot.availability_text or "Price on request"
        robot.extraction_warnings.append("zero_price_treated_as_unknown")
    if robot.compare_at_price == 0:
        robot.compare_at_price = None
    for point in robot.price_history:
        if point.price == 0:
            point.price = None

    text = _haystack(robot)

    cat, sub = classify_category(robot, text)
    robot.category, robot.subcategory = cat, sub
    if cat is None:
        robot.extraction_warnings.append("category_unclassified")

    # Drop a source-supplied "brand" that is really the retailer, then try to
    # recover the true manufacturer from the title.
    if is_retailer_name(robot.brand, robot):
        robot.brand = None
    robot.brand = canonical_brand(robot.brand) or robot.brand
    robot.brand = robot.brand or detect_brand(robot, text)
    # A vendor that survives the retailer test is the manufacturer saying so
    # itself, which beats guessing. This is the normal case on a manufacturer's
    # own storefront: shop.unitree.com states "UnitreeRobotics" on every product.
    if robot.brand is None and not is_retailer_name(robot.vendor, robot):
        robot.brand = robot.vendor
    if robot.brand is None:
        robot.extraction_warnings.append("brand_unknown")

    robot.model_number = robot.model_number or detect_model_number(robot)

    robot.supported_platforms = _match_keywords(text, _PLATFORM_KEYWORDS)
    robot.supported_os = _match_keywords(text, _OS_KEYWORDS)
    robot.programming_languages = _match_keywords(text, _LANG_KEYWORDS)
    robot.ides_tools = _match_keywords(text, _IDE_KEYWORDS)
    robot.use_case = _match_keywords(text, _USE_CASE_KEYWORDS)

    # Only trust an explicit "Interface:" spec, else fall back to keywords.
    spec_interface = robot.specs.get("interface")
    robot.interface = (
        list(spec_interface) if isinstance(spec_interface, list) and spec_interface
        else _match_keywords(text, _INTERFACE_KEYWORDS)
    )
    robot.connectivity = _match_keywords(text, _CONNECTIVITY_KEYWORDS)

    robot.ros_support = bool(re.search(r"\bros\b|\bros2\b|robot operating system", text))
    if robot.ros_support:
        m = re.search(r"ros\s*2|\bros2\b", text)
        robot.ros_version = "ROS 2" if m else "ROS 1"

    # Platform boards imply the OS you develop from, which no page ever states.
    if robot.supported_platforms and not robot.supported_os:
        robot.supported_os = ["Windows", "Linux", "macOS"]
    if "Arduino" in robot.supported_platforms and "Arduino IDE" not in robot.ides_tools:
        robot.ides_tools.append("Arduino IDE")
    if "Arduino" in robot.supported_platforms and "C/C++" not in robot.programming_languages:
        robot.programming_languages.append("C/C++")
    if "Raspberry Pi" in robot.supported_platforms and "Python" not in robot.programming_languages:
        robot.programming_languages.append("Python")

    level, age_min, age_max = estimate_skill_and_age(robot, text)
    robot.skill_level, robot.age_min, robot.age_max = level, age_min, age_max

    # Promote normalized specs onto first-class columns.
    s = robot.specs
    robot.operating_voltage = robot.operating_voltage or _as_str(s.get("operating_voltage"))
    robot.input_voltage = robot.input_voltage or _as_str(s.get("input_voltage"))
    robot.processor = robot.processor or _as_str(s.get("processor"))
    robot.dimensions = robot.dimensions or _as_str(s.get("dimensions"))
    robot.battery = robot.battery or _as_str(s.get("battery"))
    robot.max_speed = robot.max_speed or _as_str(s.get("max_speed"))
    robot.payload = robot.payload or _as_str(s.get("payload"))
    robot.motor_type = robot.motor_type or _as_str(s.get("motor_type"))
    robot.warranty = robot.warranty or _as_str(s.get("warranty"))
    if isinstance(s.get("sensors"), list):
        robot.sensors = list(s["sensors"])
    if isinstance(s.get("features"), list):
        robot.features = list(s["features"])
    if isinstance(s.get("applications"), list):
        robot.applications = list(s["applications"])
    if s.get("function"):
        robot.summary = _as_str(s.get("function"))

    dof = s.get("degrees_of_freedom")
    if dof:
        m = re.search(r"\d+", str(dof))
        if m:
            robot.degrees_of_freedom = int(m.group())

    robot.match_key = build_match_key(robot)
    return robot


def _as_str(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, list):
        return ", ".join(str(v) for v in value) or None
    return str(value) or None


def build_match_key(robot: Robot) -> str:
    """Group the same product across sites so prices can be compared.

    Model number is the reliable anchor (MPU6050 is MPU6050 everywhere); the
    normalized name is the fallback when no part number exists.

    A bare family name is deliberately NOT trusted as an anchor. Keying on it
    merged every STM32 board in the catalog into a single "product" quoted from
    550 to 49,800 PKR, which makes the comparison view worse than useless - it
    reads as a 99% saving on the same item. Falling back to the name key keeps
    those rows separate and only genuinely-matching titles group up.
    """
    model = (robot.model_number or "").strip().lower()
    if model and model not in _BROAD_MODEL_FAMILIES:
        return f"model:{model}"
    name = re.sub(r"[^a-z0-9 ]", " ", (robot.name or "").lower())
    name = re.sub(r"\b(module|sensor|board|for arduino|arduino|new|original|pcs)\b", " ", name)
    name = _RETAIL_NOISE.sub(" ", name)
    return "name:" + "-".join(sorted(set(name.split())))[:120]


# SEO boilerplate that stores staple onto a title. It is not part of the product
# name, and leaving it in breaks the one thing match_key exists for: 170 of
# robostan.pk's titles end in some form of "Best Price in Pakistan", so
# "Buy Raspberry Pi Pico 2W Online Best Price in Pakistan" keyed as
# `name:2w-best-buy-in-online-pakistan-pi-pico-price-raspberry` and would never
# have matched the same board listed plainly anywhere else.
_RETAIL_NOISE = re.compile(
    r"\b(buy|shop|order|online|best|lowest|cheap|cheapest|affordable|price|prices|"
    r"pricing|cost|sale|deal|offer|available|in\s+pakistan|pakistan|pk|"
    r"free\s+delivery|shipping|genuine|imported|quality|original)\b")
