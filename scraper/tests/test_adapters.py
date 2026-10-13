"""Regression tests for adapter-specific parsing.

Like test_enrich.py, every case here is a defect that actually happened while
adding instock.pk (Magento), nexarobots.com (brochure site) and robotshop.com
(blocked). They run offline against fixture HTML - no network.

    cd scraper && python -m pytest tests -q
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from bs4 import BeautifulSoup  # noqa: E402

from robotshop.adapters.catalog_site import (_CATEGORY_PAGE_NAME,  # noqa: E402
                                             _looks_like_product)
from robotshop.adapters.magento import _clean_pagebuilder  # noqa: E402
from robotshop.enrich import build_match_key, detect_model_number, enrich  # noqa: E402
from robotshop.models import Robot  # noqa: E402
from robotshop.parse_specs import parse_description  # noqa: E402


class TestMagentoDescriptionCleaning:
    """instock.pk descriptions arrive wrapped in Page Builder and chat-paste debris."""

    POLLUTED = (
        '<style>#html-body [data-pb-style=Q426X78]{display:flex}</style>'
        '<div data-content-type="row" data-appearance="contained" data-element="main">'
        '<div data-pb-style="Q426X78" data-element="inner">'
        '<ul class="KsbFXc U6u95" data-sfc-root="ep" data-ved="2ahUKEwi" jsaction="">'
        '<li class="Z1qcYe" style="font-family: Google Sans;" data-hveid="CAAICBAB">'
        '<strong class="rQesXe">Crystal Clear Vision<!--TgQPHd|||[]--></strong>'
        ': Medical-grade transparent PET shield.<!--TgQPHd|||[]-->'
        '</li></ul></div></div>'
    )

    def test_style_block_is_removed(self):
        assert "data-pb-style" not in (_clean_pagebuilder(self.POLLUTED) or "")
        assert "#html-body" not in (_clean_pagebuilder(self.POLLUTED) or "")

    def test_tracking_comments_are_removed(self):
        assert "TgQPHd" not in (_clean_pagebuilder(self.POLLUTED) or "")

    def test_google_paste_attributes_are_removed(self):
        cleaned = _clean_pagebuilder(self.POLLUTED) or ""
        for junk in ("data-sfc-root", "data-ved", "jsaction", "data-hveid"):
            assert junk not in cleaned

    def test_real_content_survives_and_parses(self):
        cleaned = _clean_pagebuilder(self.POLLUTED)
        result = parse_description(cleaned)
        # The label/value pattern here puts the colon OUTSIDE </strong>.
        assert result["specs_raw"].get("Crystal Clear Vision") == \
            "Medical-grade transparent PET shield"
        assert "Google Sans" not in result["text"]

    def test_none_and_empty_are_safe(self):
        assert _clean_pagebuilder(None) is None
        assert _clean_pagebuilder("") is None


class TestCatalogSitePageSelection:
    """nexarobots.com: brochure pages, Elementor markup, no <h1>, no prices."""

    def test_category_landing_pages_are_rejected(self):
        for name in ("Delivery Robots", "Cleaning Robots", "Disinfection Robots",
                     "Solutions", "Products"):
            assert _CATEGORY_PAGE_NAME.match(name), name

    def test_actual_products_are_kept(self):
        for name in ("SwiftBot", "BellaBot", "Nexa T300", "Pepper", "TemiBot"):
            assert not _CATEGORY_PAGE_NAME.match(name), name

    def test_root_level_pages_are_candidates(self):
        assert _looks_like_product("https://www.nexarobots.com/bellabot/",
                                   "www.nexarobots.com")

    def test_known_non_products_are_skipped(self):
        for path in ("contact-us", "news", "book-a-demo", "solutions"):
            assert not _looks_like_product(
                f"https://www.nexarobots.com/{path}/", "www.nexarobots.com")

    def test_offsite_urls_are_skipped(self):
        assert not _looks_like_product("https://facebook.com/nexarobots",
                                       "www.nexarobots.com")

    def test_content_inside_header_is_not_destroyed(self):
        """Elementor's theme builder wraps whole pages in <header>.

        Blanket-stripping header/footer/nav deleted the entire body of three
        nexarobots pages, leaving 413 characters of chrome. Only script/style/
        noscript may be removed unconditionally.
        """
        html = ("<html><body><header><div data-elementor-type='wp-page'>"
                "<p><strong>Function:</strong> Delivery robot for restaurants.</p>"
                + "<p>Long body copy. </p>" * 60 +
                "</div></header></body></html>")
        soup = BeautifulSoup(html, "lxml")
        for junk in soup.select("script, style, noscript"):
            junk.decompose()
        candidates = [soup.find("main"), soup.find("article"),
                      soup.select_one("[data-elementor-type]"), soup.body]
        container = max((c for c in candidates if c is not None),
                        key=lambda c: len(c.get_text(" ", strip=True)))
        assert len(container.get_text(" ", strip=True)) > 900


class TestServiceRobotTaxonomy:
    """Whole service robots must not be filed as components."""

    def make(self, name, text):
        return Robot(source_site="nexarobots.com",
                     source_url=f"https://www.nexarobots.com/{name}/",
                     name=name, description_text=text)

    def test_delivery_robot_beats_accessory_keywords(self):
        # BellaBot's page mentions a tray holder; "holder" is an Accessories term.
        robot = self.make("BellaBot",
                          "BellaBot is a premium delivery robot with a tray holder.")
        enrich(robot)
        assert robot.category == "Service & Industrial Robots"
        assert robot.subcategory == "Delivery Robot"

    def test_delivery_robot_beats_wireless_keywords(self):
        robot = self.make("SwiftBot",
                          "All-powerful delivery robot with wifi and bluetooth link.")
        enrich(robot)
        assert robot.subcategory == "Delivery Robot"

    def test_scrubber_is_a_cleaning_robot_not_a_motor(self):
        robot = self.make("Nexa SH1", "Smart upright scrubber dryer with brush motor.")
        enrich(robot)
        assert robot.subcategory == "Cleaning Robot"

    def test_disinfection_robot(self):
        robot = self.make("Puductor 2", "Disinfection robot for hospitals.")
        enrich(robot)
        assert robot.subcategory == "Disinfection Robot"

    def test_service_rules_do_not_shadow_manufacturer_humanoids(self):
        # Bare "humanoid"/"quadruped" belong to the Robots category, which covers
        # manufacturer hardware; the service rules must not swallow them.
        robot = Robot(source_site="shop.unitree.com",
                      source_url="https://shop.unitree.com/products/g1",
                      name="Unitree G1 Humanoid Robot",
                      description_text="A bipedal humanoid robot.")
        enrich(robot)
        assert robot.category == "Robots"

    def test_hobby_components_are_unaffected(self):
        robot = Robot(source_site="robo.pk",
                      source_url="https://robo.pk/products/mpu6050",
                      name="MPU6050 Analog Gyroscope Sensor",
                      source_categories=["Sensors And Modules"])
        enrich(robot)
        assert robot.category == "Sensors"


class TestPriceComparisonIntegrity:
    """match_key drives the comparison view, so a bad key is a wrong price."""

    def make(self, name, **kw):
        return Robot(source_site="instock.pk",
                     source_url=f"https://instock.pk/{name}", name=name, **kw)

    def test_broad_family_does_not_anchor_a_match(self):
        # 16 different STM32 boards were grouped as one product, 550 vs 49,800.
        a = self.make("STM32F103C8T6 Blue Pill Development Board")
        b = self.make("STM32 Nucleo-64 Evaluation Board")
        a.model_number, b.model_number = "STM32", "STM32"
        assert build_match_key(a) != "model:stm32"
        assert build_match_key(a) != build_match_key(b)

    def test_specific_variant_still_anchors(self):
        robot = self.make("ESP32-C3 Super Mini")
        robot.model_number = "ESP32-C3"
        assert build_match_key(robot) == "model:esp32-c3"

    def test_package_types_are_not_model_numbers(self):
        for title in ("NE555 Timer IC DIP-8", "LM358 Op-Amp SOP-8"):
            model = detect_model_number(self.make(title))
            assert model not in ("DIP-8", "SOP-8", "DIP8", "SOP8"), f"{title} -> {model}"

    def test_connectors_and_protocols_are_not_model_numbers(self):
        for title in ("RJ45 Ethernet Connector", "RS232 to TTL Converter"):
            model = detect_model_number(self.make(title))
            assert model not in ("RJ45", "RS232"), f"{title} -> {model}"

    def test_zero_price_becomes_unknown(self):
        # A 0 wins MIN(price) and presents itself as the best deal in the group.
        robot = self.make("19V 7A AC/DC Power Supply Adapter", price=0.0)
        enrich(robot)
        assert robot.price is None
        assert "zero_price_treated_as_unknown" in robot.extraction_warnings

    def test_real_price_is_untouched(self):
        robot = self.make("MPU6050 Sensor", price=330.0)
        enrich(robot)
        assert robot.price == 330.0
