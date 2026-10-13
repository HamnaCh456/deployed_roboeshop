"""Rule-based inference over tutorial text.

The source states none of this. RobotShop's tutorials carry a title, a body and
a byline; they do not say "this is an intermediate Arduino sensors tutorial".
So category, level, platforms and format are derived here exactly the way
`robotshop/enrich.py` derives them for products - and deliberately by the same
`_kw_match` helper, so the bugs that were already found and fixed there ("ros"
inside *gyroscope*, "led" inside *controlled*) cannot come back here.

Where a signal is genuinely absent we leave the field alone rather than guess.
`runtimeSec` is the clearest case: the archived pages carry no video duration,
so it stays None and the card simply renders no runtime badge. The series name
"Arduino 5 Minute Tutorials" is a claim about a series, not this lesson's
length, and is not laundered into a number.
"""

from __future__ import annotations

import re

from ..enrich import _PLATFORM_KEYWORDS, _any_kw, _match_keywords

#: Tutorial subject -> keywords. Ordered most specific first; the first rule
#: that matches wins, so "line following robot" beats the bare "sensor" in it.
#: What is matched *against* is the headline before the body - see
#: `classify_category`.
_CATEGORY_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("Robot Kits", (
        "how to make a robot", "robot kit", "build a robot", "robotic arm",
        "robot arm", "hexapod", "biped", "quadruped", "rover", "drone", "uav",
        "line following", "line follower", "obstacle avoid", "sumo robot",
    )),
    ("Service & Industrial Robots", (
        "industrial robot", "cobot", "collaborative robot", "delivery robot",
        "agv", "amr", "warehouse robot",
    )),
    ("Sensors", (
        "sensor", "ultrasonic", "infrared", "ir distance", "lidar", "sonar",
        "encoder", "accelerometer", "gyro", "imu", "compass", "thermistor",
        "photoresistor", "ldr", "force sensitive", "flex sensor", "camera",
        "potentiometer", "limit switch", "proximity",
    )),
    ("Motors & Actuators", (
        "servo", "stepper motor", "dc motor", "motor controller", "motor driver",
        "actuator", "gearbox", "linear actuator", "brushless", "esc", "pneumatic",
        "solenoid",
    )),
    ("Controllers", (
        "arduino", "raspberry pi", "microcontroller", "esp32", "esp8266",
        "micro:bit", "microbit", "stm32", "jetson", "single board computer",
        "programming", "code", "ide", "sketch", "firmware",
    )),
    ("Power", (
        "battery", "lipo", "li-po", "nimh", "power supply", "voltage regulator",
        "charger", "buck converter", "boost converter", "solar panel",
    )),
    ("Communication", (
        "bluetooth", "wifi", "wi-fi", "zigbee", "lora", "rf module", "xbee",
        "radio control", "telemetry", "mqtt", "i2c", "spi", "uart", "serial",
    )),
    ("Display & Audio", (
        "lcd", "oled", "display", "seven segment", "speaker", "buzzer",
        "microphone", "text to speech", "voice",
    )),
    ("Mechanical", (
        "3d printing", "3d printer", "chassis", "wheel", "track", "bearing",
        "gear ratio", "cad", "laser cut", "bracket", "mounting",
    )),
    ("Prototyping", (
        "breadboard", "soldering", "solder", "pcb", "perfboard", "jumper wire",
        "wiring", "schematic", "circuit",
    )),
    ("Tools", ("multimeter", "oscilloscope", "logic analyzer", "bench supply")),
]

#: Level keywords. Advanced wins over Intermediate wins over Beginner.
_ADVANCED = (
    "ros", "ros 2", "slam", "kalman", "inverse kinematics", "forward kinematics",
    "path planning", "computer vision", "opencv", "machine learning",
    "neural network", "can bus", "fpga", "rtos", "pid tuning", "quaternion",
    "sensor fusion", "gazebo",
)
_INTERMEDIATE = (
    "pwm", "i2c", "spi", "uart", "interrupt", "register", "library",
    "calibration", "calibrate", "h-bridge", "motor driver", "soldering",
    "solder", "schematic", "voltage divider", "pull-up", "pull up",
    "state machine", "encoder",
)
_BEGINNER_TITLE = re.compile(
    r"\b(getting started|introduction|intro to|basics?|beginner|what is|"
    r"how do i choose|lesson 1|first|unboxing|quickstart|quick start)\b", re.I
)

_WIRING_TITLE = re.compile(
    r"\b(wiring|pinout|pin out|connect(ing)?|hook ?up|schematic|circuit diagram|"
    r"how to wire|assembly)\b", re.I
)

#: A taught course with units and exercises, rather than one page you read.
#: Matched on the title only: an article *about* free courses is an article,
#: and its body says "course" a dozen times. "FREE Course: C++ for Robotics"
#: says it in the headline, which is the publisher calling it one.
_COURSE_TITLE = re.compile(r"\b(course|curriculum|academy|masterclass)\b", re.I)


def classify_category(text: str, headline: str = "") -> str:
    """The subject the headline names; the body only decides when it does not.

    First-match over the whole page is right for a 400-word lesson about one
    part, which is most of this library, and wrong for anything longer. A C++
    course that says "programming" eleven times and "sensor" once was filed
    under Sensors, because `_CATEGORY_RULES` lists Sensors above Controllers,
    and so was a 900-word article on offline robot programming that mentions a
    camera in passing.

    The fix is not to count words - counting re-filed 40 of the 87 RobotShop
    tutorials and put "Basic structure of industrial robotic arm" under
    Sensors. It is to ask the publisher. A title and a description are a
    writer's own statement of what a page is about, and a passing mention of a
    camera does not appear in either. Where the headline names no category at
    all, the body still answers, exactly as before.

    `headline` is optional so the signature stays back-compatible with the
    body-only call; passing it is what every caller in the pipeline does.
    """
    for haystack in (headline.lower(), text):
        if not haystack:
            continue
        for category, keywords in _CATEGORY_RULES:
            if _any_kw(haystack, keywords):
                return category
    return "Robot Kits"


def classify_level(text: str, title: str, word_count: int | None) -> str:
    """Advanced and Intermediate are evidence-based; Beginner is the default.

    Word count is a tie-breaker only. A 2,000-word post that never mentions a
    register is a long beginner post, not an advanced one, so length alone can
    lift Beginner to Intermediate but can never reach Advanced.
    """
    if _any_kw(text, _ADVANCED):
        return "Advanced"
    if _any_kw(text, _INTERMEDIATE):
        return "Intermediate"
    if _BEGINNER_TITLE.search(title):
        return "Beginner"
    if word_count and word_count > 1200:
        return "Intermediate"
    return "Beginner"


def classify_format(title: str, videos: list[str]) -> str:
    """What kind of thing it is, in the order the evidence is strongest.

    An embedded video outranks the title, because a page that plays a video is
    a video whatever it calls itself. A course outranks "wiring" for the
    opposite reason: "course" is a word a publisher only uses deliberately.
    """
    if videos:
        return "video"
    if _COURSE_TITLE.search(title):
        return "course"
    if _WIRING_TITLE.search(title):
        return "wiring"
    return "guide"


#: Frameworks a *tutorial* can be about, which a product's platform table has
#: no entry for. On the product side ROS is its own field (`ros_support`)
#: because a board either runs it or does not; a tutorial, though, can simply
#: be a ROS tutorial, and that is the single most useful thing to be able to
#: filter this library by - see the coverage note in CLAUDE.md, where no
#: scraped product carries ROS support at all.
#:
#: "ros" is exactly the keyword that hides inside "gy-ros-cope", so these go
#: through `_kw_match`, which anchors both edges of a short all-letter keyword.
#:
#: The ROS 2 distribution codenames are deliberately NOT in here. "humble",
#: "iron", "jazzy", "foxy" and "galactic" are ordinary English words, and
#: adding them tagged a tutorial about *inductors* as ROS 2, off the phrase
#: "iron core". That is the same class of defect as "ros" inside "gyroscope",
#: and a word boundary cannot save you from it - the word really is there. A
#: codename only counts when it is qualified, so those live in the pairs below.
_FRAMEWORK_KEYWORDS: dict[str, tuple[str, ...]] = {
    "ROS 2": (
        "ros 2", "ros2", "colcon", "ament",
        "ros humble", "ros iron", "ros jazzy", "ros foxy", "ros galactic",
        "humble hawksbill", "iron irwini", "jazzy jalisco",
    ),
    "ROS": ("ros", "roscpp", "rospy", "catkin", "rviz", "moveit", "ros wiki"),
}


def detect_platforms(text: str) -> list[str]:
    """The product pipeline's platform table, plus the frameworks above.

    `_PLATFORM_KEYWORDS` includes bare model names like "uno" and "nano" that
    are safe in a product title but noisy in prose, so the generic-PC entry is
    dropped - "pc based" appears in almost every tutorial's boilerplate.

    A page that mentions ROS 2 is tagged ROS 2 only. Tagging it both would put
    two chips on the card saying one thing, and ROS 2 is the more specific
    claim.
    """
    found = [p for p in _match_keywords(text, _PLATFORM_KEYWORDS) if p != "Nvidia/PC"]
    frameworks = _match_keywords(text, _FRAMEWORK_KEYWORDS)
    if "ROS 2" in frameworks:
        frameworks = [f for f in frameworks if f != "ROS"]
    return found + frameworks
