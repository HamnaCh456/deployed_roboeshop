"""Regression tests for the enrichment rules.

Every case here is a defect that actually shipped and was caught by inspecting
real robo.pk output - not a hypothetical. They are cheap to run and they stop the
keyword tables from silently rotting as more sites are added.

    cd scraper && python -m pytest tests -q
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from robotshop.adapters.shopify import shop_currency  # noqa: E402
from robotshop.adapters.woocommerce import _text as woo_text  # noqa: E402
from robotshop.enrich import (_kw_match, detect_brand, detect_model_number,  # noqa: E402
                              enrich, estimate_skill_and_age, is_retailer_name)
from robotshop.models import Robot  # noqa: E402
from robotshop.parse_specs import parse_description  # noqa: E402


def make(name: str, **kwargs) -> Robot:
    return Robot(source_site="robo.pk", source_url=f"https://robo.pk/products/{name}",
                 name=name, **kwargs)


# --------------------------------------------------------------------------
# Word-boundary matching. Substring matching mis-classified real products.
# --------------------------------------------------------------------------
class TestKeywordBoundaries:
    def test_ros_does_not_match_inside_gyroscope(self):
        # This rated the MPU6050 gyroscope as "advanced, 18+".
        assert not _kw_match("6-axis gyroscope module", "ros")

    def test_ros_matches_as_a_word(self):
        assert _kw_match("supports ros and ros2", "ros")

    def test_ble_does_not_match_inside_addressable(self):
        # This tagged a WS2812 RGB LED as a Bluetooth LE device.
        assert not _kw_match("individually addressable rgb led", "ble")

    def test_led_does_not_match_inside_controlled(self):
        assert not _kw_match("digitally controlled output", "led")

    def test_longer_keyword_still_stems(self):
        # Trailing boundary would break normal English plurals/gerunds.
        assert _kw_match("isd1820 voice recording module", "voice record")
        assert _kw_match("pack of 4 robot wheels", "wheel")
        assert _kw_match("great for arduino projects", "project")

    def test_punctuation_keywords_are_prefixes(self):
        assert _kw_match("esp-01 wifi module", "esp-")
        assert _kw_match("mq-2 gas sensor", "mq-")

    def test_short_keyword_is_not_a_prefix(self):
        assert not _kw_match("spider robot kit", "spi")
        assert not _kw_match("wireless transmitter", "wire")


# --------------------------------------------------------------------------
# Brand: the shop is not the manufacturer.
# --------------------------------------------------------------------------
class TestBrand:
    def test_retailer_name_is_rejected(self):
        robot = make("MPU6050 Analog Gyroscope Sensor", vendor="Robo.pk",
                     seller_name="Robo.pk", brand="Robo.pk")
        assert is_retailer_name("Robo.pk", robot)
        enrich(robot)
        assert robot.brand is None
        assert "brand_unknown" in robot.extraction_warnings

    def test_real_brand_in_title_is_kept(self):
        robot = make("Arduino Uno R3 Development Board")
        enrich(robot)
        assert robot.brand == "Arduino"

    def test_brand_only_mentioned_in_applications_is_not_adopted(self):
        # "Applications: Arduino, drones..." says what it works with, not who
        # made it. Adopting it would brand most of the catalog as Arduino.
        robot = make("ISD1820 Voice Recording Module",
                     description_text="Applications: Arduino, alarms, greeting devices.")
        assert detect_brand(robot, "applications: arduino, alarms") is None


# --------------------------------------------------------------------------
# Model number: prefer the stated IC over a regex on marketing copy.
# --------------------------------------------------------------------------
class TestModelNumber:
    def test_driver_ic_beats_title_noise(self):
        # The title yields the meaningless "HD65K"; Driver IC says ST7735S.
        robot = make("0.96 Inch IPS LCD TFT Display Module 160x80 HD 65K SPI Interface",
                     specs={"processor": "ST7735S"})
        assert detect_model_number(robot) == "ST7735S"

    def test_plain_part_number_from_title(self):
        assert detect_model_number(make("MPU6050 Analog Gyroscope Sensor")) == "MPU6050"
        assert detect_model_number(make("HC-SR04 Ultrasonic Sensor")) == "HC-SR04"

    def test_blacklisted_tokens_are_not_model_numbers(self):
        assert detect_model_number(make("USB Cable Type C 1M")) != "USB"

    def test_hyphenated_variant_suffix_is_kept(self):
        # "ESP32-C3" and "ESP32" are different chips.
        assert detect_model_number(make("ESP32-C3 Super Mini")) == "ESP32-C3"


# --------------------------------------------------------------------------
# Category: "for Arduino" means compatible-with, not is-a. This mis-filed 20
# of robo.pk's 144 products as microcontroller boards.
# --------------------------------------------------------------------------
class TestCategory:
    def test_accessory_named_for_arduino_is_not_a_board(self):
        robot = make("Male To Male Jumper Wire 40 pins 20cm Cable For Arduino",
                     source_categories=["Accessories"])
        enrich(robot)
        assert robot.category == "Prototyping"
        assert robot.subcategory == "Breadboard & Wiring"

    def test_bluetooth_module_for_arduino_is_communication(self):
        robot = make("HC05 Bluetooth Module for Arduino",
                     source_categories=["Sensors And Modules"])
        enrich(robot)
        assert robot.category == "Communication"

    def test_real_arduino_board_still_classifies_as_a_board(self):
        robot = make("Arduino Nano V3.0 ATMEGA328 with cable",
                     source_categories=["Boards", "Micro Controllers"])
        enrich(robot)
        assert (robot.category, robot.subcategory) == ("Controllers", "Microcontroller Board")

    def test_trailing_platform_word_is_not_identity(self):
        # "Traffic Light Module Arduino" is an LED module, not a board.
        robot = make("Traffic Light Module Arduino",
                     source_categories=["Sensors And Modules"])
        enrich(robot)
        assert robot.category == "Display & Audio"

    def test_casing_is_an_accessory_not_a_board(self):
        robot = make("Arduino Uno Transparent Casing", source_categories=["Accessories"])
        enrich(robot)
        assert robot.category == "Accessories"

    def test_specific_collection_is_authoritative(self):
        robot = make("Arduino UNO R3 Dip", source_categories=["Micro Controllers"])
        enrich(robot)
        assert robot.category == "Controllers"

    def test_previously_unclassified_modules_now_land(self):
        cases = {
            "DS1307 RTC Module": "Sensors",
            "Flame Detection Sensor Module": "Sensors",
            "RC522 Card Reader Module": "Communication",
            "ps2 joystick module": "Prototyping",
            "Vibration Motor Coin Shape": "Motors & Actuators",
        }
        for name, expected in cases.items():
            robot = make(name, source_categories=["Sensors And Modules"])
            enrich(robot)
            assert robot.category == expected, f"{name} -> {robot.category}"


# --------------------------------------------------------------------------
# Audience inference.
# --------------------------------------------------------------------------
class TestSkillAndAge:
    def test_gyroscope_is_not_advanced(self):
        level, age_min, _ = estimate_skill_and_age(
            make("x"), "6-axis gyroscope and accelerometer module")
        assert level == "intermediate"
        assert age_min == 14

    def test_scratch_implies_beginner_child(self):
        level, age_min, age_max = estimate_skill_and_age(
            make("x"), "program it with scratch blocks, no coding needed")
        assert level == "beginner"
        assert (age_min, age_max) == (8, 14)

    def test_explicit_age_wins(self):
        _, age_min, age_max = estimate_skill_and_age(make("x"), "recommended age 6 to 10")
        assert (age_min, age_max) == (6, 10)

    def test_ros_really_does_imply_advanced(self):
        level, _, _ = estimate_skill_and_age(make("x"), "runs ros 2 for slam navigation")
        assert level == "advanced"


# --------------------------------------------------------------------------
# Spec parsing off real robo.pk description HTML.
# --------------------------------------------------------------------------
class TestSpecParsing:
    SAMPLE = (
        '<p><strong>Function:</strong> 6-axis motion tracking module.</p>'
        '<p><strong>Operating Voltage:</strong> 3V-5V DC.</p>'
        '<p><strong>Interface:</strong> I2C serial communication.</p>'
        '<p><strong>Sensors:</strong> 3-axis accelerometer and 3-axis gyroscope.</p>'
    )

    def test_label_value_pairs_are_extracted(self):
        result = parse_description(self.SAMPLE)
        assert result["specs_raw"]["Operating Voltage"] == "3V-5V DC"
        assert result["specs_raw"]["Function"] == "6-axis motion tracking module"

    def test_list_labels_become_lists(self):
        result = parse_description(self.SAMPLE)
        assert result["specs"]["sensors"] == ["3-axis accelerometer", "3-axis gyroscope"]

    def test_chatgpt_wrapper_is_stripped(self):
        polluted = (
            '<div data-message-author-role="assistant" data-turn-id="x">'
            '<div class="markdown prose">'
            '<p><strong>Function:</strong> Display module.</p>'
            '</div></div>'
        )
        result = parse_description(polluted)
        assert "assistant" not in result["text"]
        assert result["specs_raw"]["Function"] == "Display module"

    def test_two_column_table_is_extracted(self):
        html = "<table><tr><td>Weight</td><td>25 g</td></tr></table>"
        assert parse_description(html)["specs_raw"]["Weight"] == "25 g"

    def test_empty_description_is_safe(self):
        result = parse_description(None)
        assert result["specs_raw"] == {} and result["text"] == ""


# --------------------------------------------------------------------------
# Cross-site comparison key.
# --------------------------------------------------------------------------
class TestMatchKey:
    def test_same_part_from_two_sites_shares_a_key(self):
        a = make("MPU6050 Analog Gyroscope Sensor")
        b = Robot(source_site="roboticspk.com",
                  source_url="https://roboticspk.com/p/mpu-6050",
                  name="MPU6050 3-Axis Gyro Module")
        enrich(a)
        enrich(b)
        assert a.match_key == b.match_key == "model:mpu6050"


# --------------------------------------------------------------------------
# Manufacturer-run stores. shop.unitree.com is the first site here that makes
# its own robots rather than reselling other people's parts, and it broke
# assumptions the component shops never exercised.
# --------------------------------------------------------------------------
def unitree(name: str, **kwargs) -> Robot:
    return Robot(source_site="shop.unitree.com",
                 source_url=f"https://shop.unitree.com/products/{name}",
                 name=name, seller_name="UnitreeRobotics", **kwargs)


class TestManufacturerStore:
    def test_vendor_of_a_manufacturer_store_is_the_brand(self):
        # The retailer test used to compare the candidate against seller_name,
        # which the Shopify adapter copies FROM vendor - so every vendor matched
        # itself and was discarded, leaving all 30 products brandless.
        robot = unitree("Unitree G1", vendor="UnitreeRobotics")
        assert not is_retailer_name("UnitreeRobotics", robot)
        enrich(robot)
        assert robot.brand == "Unitree"

    def test_store_spelling_is_normalized_to_the_canonical_brand(self):
        # Same maker, two spellings, must compare as one.
        own_store = unitree("Unitree Go2", vendor="UnitreeRobotics", brand="UnitreeRobotics")
        enrich(own_store)
        assert own_store.brand == "Unitree"

    def test_retailer_vendor_is_still_rejected(self):
        # The fix above must not let a shop brand its whole catalog with itself.
        robot = make("MPU6050 Module", vendor="Robo.pk", seller_name="Robo.pk")
        enrich(robot)
        assert robot.brand is None

    def test_usd_store_currency_is_read_from_meta_json(self):
        class FakeFetcher:
            def get_json(self, url):
                return {"currency": "USD"} if url.endswith("/meta.json") else None

        assert shop_currency(FakeFetcher(), "https://shop.unitree.com") == "USD"


class TestRobotModelLines:
    def test_humanoid_and_quadruped_lines_are_recognised(self):
        cases = {
            "Unitree G1": ("Robots", "Humanoid Robot"),
            "Unitree H2 Plus": ("Robots", "Humanoid Robot"),
            "Unitree R1-D": ("Robots", "Humanoid Robot"),
            "Unitree Go2": ("Robots", "Quadruped Robot"),
            "Unitree B2-W": ("Robots", "Quadruped Robot"),
            "Aliengo": ("Robots", "Quadruped Robot"),
        }
        for name, expected in cases.items():
            robot = unitree(name)
            enrich(robot)
            assert (robot.category, robot.subcategory) == expected, f"{name}"

    def test_bracketed_pricing_note_in_the_title_is_ignored(self):
        # The vendor ships "Unitree H1（Contact us for the real price）" as the
        # literal product title, full-width brackets and all.
        robot = unitree("Unitree H1（Contact us for the real price）")
        enrich(robot)
        assert robot.subcategory == "Humanoid Robot"

    def test_arm_is_not_a_quadruped_despite_its_description(self):
        # The Z1 arm describes itself as "designed for Unitree robot dogs",
        # which filed an arm under Quadruped Robot.
        robot = unitree("Unitree Z1",
                        description_text="A lightweight robotic arm designed for "
                                         "Unitree robot dogs.")
        enrich(robot)
        assert (robot.category, robot.subcategory) == ("Robot Kits", "Robotic Arm")

    def test_quadruped_is_not_a_motor_despite_its_description(self):
        # Every robot's copy brags about its "powerful motors"; the As2 was
        # filed under Motors & Actuators because of that one phrase.
        robot = unitree("Unitree As2",
                        description_text="Powerful motors, exceptional payload, "
                                         "ultra-long endurance.")
        enrich(robot)
        assert robot.category == "Robots"

    def test_a_part_named_after_a_robot_is_still_a_part(self):
        cases = {
            "Go2 Battery": ("Power", "Battery"),
            "Unitree Go2 Charger": ("Power", "Power Module"),
            "Unitree A1 Motor": ("Motors & Actuators", "Motor"),
            "Unitree 4D LiDAR L2": ("Sensors", "Distance / Proximity Sensor"),
        }
        for name, expected in cases.items():
            robot = unitree(name)
            enrich(robot)
            assert (robot.category, robot.subcategory) == expected, f"{name}"

    def test_model_lines_do_not_leak_to_other_sites(self):
        # "B1" on a components shop is not a Unitree quadruped.
        robot = make("B1 Buzzer 5V")
        enrich(robot)
        assert robot.category != "Robots"


class TestGenericWordsAreTitleOnly:
    def test_a_motor_mentioned_in_prose_does_not_make_it_a_motor(self):
        robot = make("Peltier 12707 Thermoelectric Cooling Module",
                     description_text="Runs cooler and quieter than a motor.")
        enrich(robot)
        assert robot.category != "Motors & Actuators"

    def test_a_motor_in_the_title_still_classifies(self):
        robot = make("GO-M8010-6 Motor")
        enrich(robot)
        assert (robot.category, robot.subcategory) == ("Motors & Actuators", "Motor")


# --------------------------------------------------------------------------
# WooCommerce Store API text handling (robostan.pk).
# --------------------------------------------------------------------------
class TestStoreApiText:
    def test_html_entities_in_titles_are_decoded(self):
        # 83 of robostan.pk's 830 titles ship raw entities.
        assert woo_text("ST-Link V2 Programmer &#038; Debugger") == \
            "ST-Link V2 Programmer & Debugger"
        assert woo_text("2004A LCD 20&#215;4 Character Display") == \
            "2004A LCD 20×4 Character Display"

    def test_missing_text_is_empty_not_none(self):
        assert woo_text(None) == ""


class TestMatchKeyIgnoresRetailWording:
    def test_seo_tail_does_not_change_a_product_identity(self):
        # 170 robostan.pk titles end in some form of "Best Price in Pakistan".
        # Left in the key, the same board never matches itself across sites.
        seo = Robot(source_site="robostan.pk",
                    source_url="https://robostan.pk/product/pico-2w",
                    name="Buy Raspberry Pi Pico 2W Online Best Price in Pakistan")
        plain = Robot(source_site="robo.pk",
                      source_url="https://robo.pk/products/pico-2w",
                      name="Raspberry Pi Pico 2W")
        enrich(seo)
        enrich(plain)
        assert seo.match_key == plain.match_key
