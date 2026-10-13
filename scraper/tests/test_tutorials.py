"""Regression tests for the tutorial pipeline.

Like test_enrich.py and test_adapters.py, every case here is a defect that
actually happened - first while building `run_tutorials.py` against the 87
archived RobotShop Community pages, then while adding the curated publishers in
`tutorials/external.py`. They run offline against fixture HTML - no network,
and no dependency on `.cache_tutorials/`.

    cd scraper && python -m pytest tests/test_tutorials.py -q
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from robotshop.tutorials import bom, enrich, external, parse, wayback  # noqa: E402


def _page(body_html: str, *, title: str = "Lesson 3 - Potentiometer") -> str:
    """A minimal capture with the JSON-LD block these pages really carry."""
    return f"""
    <html><head>
      <script type="application/ld+json">{{
        "@context": "http://schema.org",
        "@type": "Article",
        "headline": "{title}",
        "image": "https://community.robotshop.com/uploads/tutorials/a/b/c/full.jpg?v=1",
        "url": "https://community.robotshop.com/tutorials/show/lesson-3",
        "datePublished": "2018-09-17",
        "dateModified": "2023-03-23",
        "wordcount": "456",
        "author": {{"@type": "Person", "name": "cbenson"}},
        "description": "&lt;p&gt;Welcome to RobotShop&amp;#39;s tutorials.&lt;/p&gt;"
      }}</script>
      <meta property="og:title" content="{title} | RobotShop Community" />
    </head><body>
      <div class="tutorial-post">
        <div class="cell large-9"><h1>{title}</h1></div>
        <div class="media-object author-meta">
          Posted on 17/09/2018 by cbenson in Arduino 5 Minute Tutorials
          Modified on: 23/03/2023
        </div>
        <div class="cell large-9">{body_html}</div>
      </div>
    </body></html>
    """


class TestSeriesNavigationIsNotContent:
    """The single largest source of false parts.

    These pages carry the series table of contents *inside* the article, as
    links to the other lessons. Read as body text, a potentiometer lesson looks
    like it needs a servo, an IMU and an IR distance sensor - because lessons
    5, 7 and 4 are listed in its own sidebar.
    """

    TOC = _page(
        '<p>A potentiometer has three pins. Turn the knob and read it.</p>'
        '<ul>'
        '<li><a href="https://community.robotshop.com/tutorials/show/lesson-5">'
        'Lesson 5: Actuator: Servo Motor</a></li>'
        '<li><a href="https://community.robotshop.com/tutorials/show/lesson-7">'
        'Lesson 7: Sensor: Accelerometer, Gyro, IMU</a></li>'
        '<li><a href="/tutorials/series/arduino-5-minute-tutorials">'
        'Arduino 5 Minute Tutorials</a></li>'
        '</ul>'
    )

    def test_links_to_other_tutorials_are_stripped(self):
        body = parse.parse(self.TOC, "x")["body"]
        assert "potentiometer" in body.lower()
        for leaked in ("servo", "gyro", "imu", "accelerometer"):
            assert leaked not in body.lower(), f"{leaked!r} leaked in from the TOC"

    def test_a_step_titled_lessons_menu_is_dropped(self):
        page = _page(
            '<section class="project-view-step">'
            '<h2 class="step-title">Lessons Menu</h2>'
            '<p>Servo motors and stepper motors are covered later.</p>'
            '</section>'
            '<section class="project-view-step">'
            '<h2 class="step-title">Hardware</h2><p>One potentiometer.</p>'
            '</section>'
        )
        body = parse.parse(page, "x")["body"]
        assert "potentiometer" in body.lower()
        assert "servo" not in body.lower()

    def test_navigation_steps_do_not_inflate_the_step_count(self):
        page = _page(
            '<section class="project-view-step">'
            '<h2 class="step-title">Lessons Menu</h2><p>x</p></section>'
            '<section class="project-view-step">'
            '<h2 class="step-title">Hardware</h2><p>y</p></section>'
            '<section class="project-view-step">'
            '<h2 class="step-title">Code</h2><p>z</p></section>'
        )
        assert parse.parse(page, "x")["steps"] == ["Hardware", "Code"]


class TestJsonLdParsing:
    def test_description_is_unescaped_twice(self):
        """JSON-LD on these pages is double-escaped.

        Unescaping once leaves literal `<p>` tags and a stray `&#39;`.
        """
        record = parse.parse(_page("<p>body</p>"), "x")
        assert record["summary"] == "Welcome to RobotShop's tutorials."

    def test_byline_yields_author_and_series(self):
        record = parse.parse(_page("<p>body</p>"), "x")
        assert record["author"] == "cbenson"
        assert record["series"] == "Arduino 5 Minute Tutorials"
        assert record["publishedAt"] == "2018-09-17"
        assert record["updatedAt"] == "2023-03-23"

    def test_body_is_the_largest_column_not_the_first(self):
        """The `<h1>` and the article sit in two different `large-9` cells.

        Taking the first match returned a 50-character "body" that was just the
        title repeated.
        """
        record = parse.parse(_page("<p>" + "prose " * 60 + "</p>"), "x")
        assert len(record["body"]) > 200

    def test_doubled_step_labels_are_collapsed(self):
        """The stepper renders each label twice, for desktop and for mobile."""
        page = _page(
            '<section class="project-view-step">'
            '<h2 class="step-title">Step 1 Step 1</h2><p>x</p></section>'
        )
        assert parse.parse(page, "x")["steps"] == ["Step 1"]


class TestUrlCanonicalisation:
    def test_tracking_parameters_are_dropped(self):
        assert wayback.canonical_url(
            "https://community.robotshop.com/tutorials/series/basics"
            "?utm_source=Pinterest&utm_medium=organic"
        ) == "https://community.robotshop.com/tutorials/series/basics"

    def test_a_zero_width_space_does_not_duplicate_a_tutorial(self):
        """One slug ends in a percent-encoded U+200B.

        Left in, "Robot Leg Torque Tutorial" was indexed, parsed and shown
        twice - 88 rows for 87 tutorials.
        """
        plain = "https://community.robotshop.com/tutorials/show/robot-leg-torque-tutorial"
        assert wayback.canonical_url(plain + "%E2%80%8B") == plain
        assert wayback.slug_of(plain + "%E2%80%8B") == "robot-leg-torque-tutorial"

    def test_ordinary_percent_encoding_survives(self):
        """Only invisible characters are decoded.

        A blanket unquote() would turn an encoded space or slash into a literal
        one and change which page the URL points at.
        """
        assert "%20" in wayback.canonical_url(
            "https://community.robotshop.com/tutorials/show/a%20b"
        )


class TestImageResolution:
    INDEX = {
        "/uploads/tutorials/a/b/c/full.jpg": ("20230101000000",
                                              "https://community.robotshop.com/uploads/tutorials/a/b/c/full.jpg"),
        "/uploads/tutorials/d/e/f/thumbnail.jpg": ("20240202000000",
                                                   "https://community.robotshop.com/uploads/tutorials/d/e/f/thumbnail.jpg"),
    }

    def test_the_cache_buster_is_ignored_when_matching(self):
        """The publisher bumps `?v=` on every edit; the capture keeps the old one."""
        resolved = wayback.resolve_image(
            "https://community.robotshop.com/uploads/tutorials/a/b/c/full.jpg?v=20251209",
            self.INDEX,
        )
        assert resolved.startswith("https://web.archive.org/web/20230101000000im_/")

    def test_the_other_size_in_the_folder_is_accepted(self):
        """Posts carry full.jpg and thumbnail.jpg; often only one was captured."""
        resolved = wayback.resolve_image(
            "https://community.robotshop.com/uploads/tutorials/d/e/f/full.jpg",
            self.INDEX,
        )
        assert "thumbnail.jpg" in resolved

    def test_an_unarchived_image_resolves_to_empty_not_a_guess(self):
        """Constructing a URL for an uncaptured image renders a broken tile.

        Roughly two thirds of these thumbnails were never archived at all.
        """
        assert wayback.resolve_image(
            "https://community.robotshop.com/uploads/tutorials/x/y/z/full.jpg",
            self.INDEX,
        ) == ""


class TestPartMatching:
    CATALOGUE = [
        {"name": "LDR Photoresistor GL5528", "lower": "ldr photoresistor gl5528",
         "price": 20.0, "match_key": "ldr", "source_site": "instock.pk",
         "source_url": "https://instock.pk/ldr"},
        {"name": "Resistor Array (DIL 330OHM X 8)", "lower": "resistor array (dil 330ohm x 8)",
         "price": 165.0, "match_key": "res", "source_site": "instock.pk",
         "source_url": "https://instock.pk/res"},
        {"name": "Ultrasonic Mist Maker with 12 LED Lights 24V",
         "lower": "ultrasonic mist maker with 12 led lights 24v",
         "price": 1200.0, "match_key": "mist", "source_site": "robostan.pk",
         "source_url": "https://robostan.pk/mist"},
        {"name": "Ultrasonic Distance Measuring Sensor Module HC-SR04",
         "lower": "ultrasonic distance measuring sensor module hc-sr04",
         "price": 170.0, "match_key": "hcsr04", "source_site": "instock.pk",
         "source_url": "https://instock.pk/hcsr04"},
        {"name": "Wheel For RC Smart Car Robot (30mm)",
         "lower": "wheel for rc smart car robot (30mm)",
         "price": 600.0, "match_key": "wheel", "source_site": "instock.pk",
         "source_url": "https://instock.pk/wheel"},
        {"name": "DTMF Encoder IC PSB 8510-6", "lower": "dtmf encoder ic psb 8510-6",
         "price": 130.0, "match_key": "dtmf", "source_site": "instock.pk",
         "source_url": "https://instock.pk/dtmf"},
        {"name": "KY-040 Rotary Encoder Module", "lower": "ky-040 rotary encoder module",
         "price": 85.0, "match_key": "ky040", "source_site": "instock.pk",
         "source_url": "https://instock.pk/ky040"},
    ]

    def _names(self, body: str, title: str = "A tutorial") -> list[str]:
        return [p["name"] for p in bom.extract(body, title, self.CATALOGUE)]

    def test_resistor_does_not_match_photoresistor(self):
        """The `"ros"` inside *gyroscope* bug, arriving from the product side.

        `_best_product` compared tokens with `in`, so the token "resistor"
        matched "Photo-resistor" and an inductors explainer was sold an LDR.
        """
        names = self._names("A resistor limits current. Every resistor has a value.")
        assert "Resistor Array (DIL 330OHM X 8)" in names
        assert "LDR Photoresistor GL5528" not in names

    def test_an_ultrasonic_sensor_is_not_a_humidifier(self):
        """"ultrasonic" alone resolved to an *Ultrasonic Mist Maker*."""
        names = self._names(
            "Wire the ultrasonic sensor to pin 7. The ultrasonic sensor pulses."
        )
        assert "Ultrasonic Distance Measuring Sensor Module HC-SR04" in names
        assert all("Mist Maker" not in n for n in names)

    def test_a_rotary_encoder_is_not_a_dtmf_chip(self):
        """"encoder" alone resolved to a telephone tone decoder IC."""
        names = self._names(
            "Add a rotary encoder. The rotary encoder counts detents."
        )
        assert "KY-040 Rotary Encoder Module" in names
        assert all("DTMF" not in n for n in names)

    def test_a_water_wheel_is_a_metaphor_not_a_part(self):
        """An inductors lesson said "water wheel" six times.

        Frequency rules cannot catch this - the metaphor *is* the explanation -
        so the phrase is disowned by context.
        """
        body = (
            "Think of a water wheel in a river. When water hits the water wheel "
            "it slows, and the water wheel matches the speed of the water."
        )
        assert all("Wheel" not in n for n in self._names(body, "Inductors"))

    def test_a_real_wheel_still_matches(self):
        """The false-context rule must stay narrow."""
        body = "Mount the wheel on the shaft. The second wheel goes on the left."
        assert "Wheel For RC Smart Car Robot (30mm)" in self._names(body, "Robot chassis")

    def test_one_passing_mention_is_not_a_part(self):
        """A part you build with gets named again - in the parts list, the
        wiring, the code. One mention is an aside."""
        assert self._names("Inductors turn up in motors and in one wheel somewhere.") == []

    def test_a_part_named_in_the_title_counts_immediately(self):
        """The subject of the tutorial needs no second mention."""
        names = self._names("It measures distance.", "Using the ultrasonic sensor")
        assert "Ultrasonic Distance Measuring Sensor Module HC-SR04" in names


class TestEnrichment:
    def test_ros_inside_gyroscope_is_not_an_advanced_tutorial(self):
        """The keyword matcher is shared with the product pipeline precisely so
        that this bug cannot come back independently here."""
        assert enrich.classify_level("the gyroscope reports drift", "Gyro", 300) != "Advanced"

    def test_real_ros_is_advanced(self):
        assert enrich.classify_level("bring the arm up under ros 2", "Arm", 900) == "Advanced"

    def test_a_long_beginner_post_never_reaches_advanced(self):
        """Word count is a tie-breaker, not evidence of difficulty."""
        assert enrich.classify_level("solder the header pins", "Soldering", 5000) == "Intermediate"

    def test_platform_detection_reuses_the_product_table(self):
        found = enrich.detect_platforms("connect it to your arduino uno and a raspberry pi")
        assert "Arduino" in found and "Raspberry Pi" in found

    def test_a_video_is_classified_by_its_embed_not_its_title(self):
        assert enrich.classify_format("Wiring a servo", ["dQw4w9WgXcQ"]) == "video"
        assert enrich.classify_format("Wiring a servo", []) == "wiring"


def _yoast(body_html: str, *, graph: str, title: str, og_image: str = "") -> str:
    """A page in the shape WordPress + Yoast actually emits.

    The `@graph` is the whole point of this fixture: `parse._json_ld` looks for
    a top-level `"@type": "Article"` and finds nothing here, which is why
    `external.py` has a parser of its own.
    """
    return f"""
    <html><head>
      <script type="application/ld+json">{{"@context":"https://schema.org",
        "@graph": [{graph}]}}</script>
      <meta property="og:title" content="{title}" />
      <meta property="og:image" content="{og_image}" />
    </head><body>{body_html}</body></html>
    """


class TestExternalParser:
    """The curated publishers in `external.py`. Both are WordPress + Yoast, and
    neither looks anything like an archived RobotShop capture."""

    def test_reads_an_article_out_of_a_yoast_graph(self):
        """`parse.py` returns nothing here - the Article is nested in @graph."""
        html = _yoast(
            "<main><div class='entry-content'><p>Offline programming.</p></div></main>",
            graph=(
                '{"@type":"Article","headline":"Free Robot Training with RoboDK",'
                ' "description":"Our free collection of courses.",'
                ' "datePublished":"2022-07-15T14:58:28+00:00",'
                ' "dateModified":"2025-09-22T07:14:00+00:00",'
                ' "author":{"@type":"Person","name":"Alex Owen-Hill"}},'
                '{"@type":"WebSite","name":"RoboDK blog"}'
            ),
            title="Free Robot Training with RoboDK - RoboDK blog",
        )
        record = external.parse(html, "https://robodk.com/blog/free-robot-training/")

        assert record["title"] == "Free Robot Training with RoboDK"
        assert record["author"] == "Alex Owen-Hill"
        assert record["publishedAt"] == "2022-07-15"
        assert record["updatedAt"] == "2025-09-22"

    def test_a_timestamp_is_kept_as_a_date(self):
        """Yoast dates every page `2022-07-15T14:58:28+00:00`. Before this,
        `_iso_date` accepted only `YYYY-MM-DD` and every curated page came
        through with no date at all."""
        assert parse._iso_date("2022-07-15T14:58:28+00:00") == "2022-07-15"
        assert parse._iso_date("2018-09-17") == "2018-09-17"
        assert parse._iso_date("17/09/2018") == "2018-09-17"

    def test_the_publisher_name_is_not_said_twice(self):
        """The card already carries the publisher as a byline, so a title of
        "C++ for Robotics | The Construct" prints it twice."""
        assert external.strip_site_suffix(
            "FREE Course: C++ for Robotics | The Construct", ["The Construct"]
        ) == "FREE Course: C++ for Robotics"
        assert external.strip_site_suffix(
            "Free Robot Training with RoboDK - RoboDK blog", ["RoboDK blog"]
        ) == "Free Robot Training with RoboDK"

    def test_a_title_that_merely_ends_in_the_site_name_is_left_alone(self):
        """Only a real suffix, hung off a separator, comes off."""
        assert external.strip_site_suffix(
            "Getting started with RoboDK", ["RoboDK"]
        ) == "Getting started with RoboDK"

    def test_a_favicon_is_not_a_thumbnail(self):
        """theconstruct.ai sets no per-page image, so `og:image` is the site
        favicon. Taken at face value, every card from that publisher shows the
        same blue square; the picture inside the article is the real one."""
        html = _yoast(
            """<div class='entry-content'>
                 <img src="https://x.test/wp-content/uploads/C-Robotics-2020.png">
               </div>""",
            graph='{"@type":"WebPage","name":"C++ for Robotics"}',
            title="C++ for Robotics",
            og_image="https://x.test/wp-content/uploads/android-chrome-512x512-1.png",
        )
        assert external.parse(html, "https://x.test/c/")["image"].endswith(
            "C-Robotics-2020.png"
        )

    def test_a_lazy_loaded_image_is_read_from_its_data_attribute(self):
        """Both publishers ship a 1x1 data URI in `src` until the page scrolls."""
        html = _yoast(
            """<div class='entry-content'><img
                 src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="
                 data-lazy-src="https://x.test/uploads/real-photo.jpg"></div>""",
            graph='{"@type":"WebPage","name":"A page"}',
            title="A page",
        )
        assert external.parse(html, "https://x.test/a/")["image"] == (
            "https://x.test/uploads/real-photo.jpg"
        )

    def test_related_posts_are_not_this_article(self):
        """The worst case on a blog. "Related Posts" names four *other*
        articles, and their titles would be read as this page's subject by the
        category rules and as its parts by the BOM matcher."""
        html = _yoast(
            """<main>
                 <div class='entry-content'><p>Offline programming courses.</p></div>
                 <div class='related-posts'><h2>Related Posts</h2>
                   <a>Concrete 3D Printing</a><a>Robot Euler Angles</a></div>
               </main>""",
            graph='{"@type":"Article","headline":"Free Robot Training"}',
            title="Free Robot Training",
        )
        body = external.parse(html, "https://x.test/b/")["body"]
        assert "Offline programming" in body
        assert "Euler" not in body and "Concrete" not in body

    def test_section_headings_are_not_steps(self):
        """A course page's headings are "Course Overview" and "Prerequisites".
        Counting them would put "10 steps" on a card, which is a claim the
        publisher never made - so the count stays 0 and the card says how long
        the read is instead."""
        html = _yoast(
            """<div class='entry-content'>
                 <h2>Course Overview</h2><h2>What will you learn</h2>
               </div>""",
            graph='{"@type":"WebPage","name":"C++ for Robotics"}',
            title="C++ for Robotics",
        )
        assert external.parse(html, "https://x.test/c/")["steps"] == []

    def test_numbered_headings_are_steps(self):
        html = _yoast(
            """<div class='entry-content'>
                 <h2>Step 1: Wire it up</h2><h2>Step 2: Flash the board</h2>
                 <h2>Conclusion</h2>
               </div>""",
            graph='{"@type":"WebPage","name":"A build"}',
            title="A build",
        )
        assert external.parse(html, "https://x.test/d/")["steps"] == [
            "Step 1: Wire it up",
            "Step 2: Flash the board",
        ]

    def test_a_page_with_no_title_is_not_a_tutorial(self):
        assert external.parse("<html><body><p>hi</p></body></html>", "https://x.test/") is None


class TestFrameworkTagging:
    def test_an_iron_core_is_not_ros_2(self):
        """A real one. Seeding the ROS 2 keywords with the distribution
        codenames - humble, iron, jazzy, foxy, galactic - tagged a tutorial
        about *inductors* as ROS 2, off the phrase "iron core". They are
        ordinary English words and a word boundary cannot help: the word really
        is there. Only a qualified codename counts."""
        assert enrich.detect_platforms("wind the coil around the iron core") == []
        assert enrich.detect_platforms("a humble beginning for this build") == []

    def test_ros_is_tagged_because_no_product_carries_it(self):
        """The one thing worth being able to filter this library by, given no
        scraped product supports ROS at all."""
        assert "ROS" in enrich.detect_platforms("we launch the node with rospy and rviz")

    def test_ros_2_wins_over_ros_rather_than_both(self):
        """Two chips saying one thing. ROS 2 is the more specific claim."""
        found = enrich.detect_platforms("build the ros 2 workspace with colcon")
        assert "ROS 2" in found and "ROS" not in found


class TestCategoryFromTheHeadline:
    def test_a_passing_mention_does_not_take_the_page(self):
        """A 900-word article about offline robot programming that names a
        camera once was filed under Sensors, because Sensors is listed above
        Controllers and first-match read the whole page."""
        body = "robot programming courses " * 20 + " and a camera sensor is mentioned once"
        assert enrich.classify_category(
            body, "Free Robot Training with RoboDK: offline programming"
        ) == "Controllers"

    def test_the_body_still_answers_when_the_headline_does_not(self):
        """Most headlines in the library name no category at all, and those
        pages must classify exactly as they did before."""
        assert enrich.classify_category(
            "wire the ultrasonic sensor to the board", "Lesson 3"
        ) == "Sensors"

    def test_no_signal_anywhere_falls_back_rather_than_guessing(self):
        assert enrich.classify_category("a page about nothing in particular", "Hello") == (
            "Robot Kits"
        )
