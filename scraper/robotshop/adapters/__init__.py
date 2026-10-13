"""Adapter registry.

You paste a URL; the pipeline works out how to read that site rather than making
you configure it. Detection runs cheapest-and-most-complete first, because an
official JSON/GraphQL catalog is always better than scraping rendered HTML -
complete, already structured, and far gentler on the vendor's server:

  1. Shopify      - /products.json                      (robo.pk)
  2. WooCommerce  - /wp-json/wc/store/v1/products       (indusrobotix.com)
  3. Magento      - /graphql                            (instock.pk)
  4. catalog_site - brochure sites with no shop at all  (nexarobots.com)
  5. generic      - crawl4ai deep crawl of rendered HTML, for everything else

Order matters. `catalog_site` must be tried before `generic`, and only after the
three storefront APIs, because its detector deliberately fires on "WordPress with
no cart" - a WooCommerce shop would match the WordPress half of that test.

Adding a site later means appending one module here, not touching the pipeline.
"""

from __future__ import annotations

from ..http import Fetcher
from . import catalog_site, generic, magento, shopify, woocommerce

ADAPTERS = [
    ("shopify", shopify),
    ("woocommerce", woocommerce),
    ("magento", magento),
    ("catalog_site", catalog_site),
]

_BY_NAME = {
    "shopify": shopify,
    "woocommerce": woocommerce,
    "magento": magento,
    "catalog_site": catalog_site,
    "generic": generic,
}


def pick_adapter(fetcher: Fetcher, url: str, forced: str | None = None):
    if forced:
        if forced not in _BY_NAME:
            raise ValueError(f"unknown adapter {forced!r}; choose from {sorted(_BY_NAME)}")
        return forced, _BY_NAME[forced]

    for name, module in ADAPTERS:
        try:
            if module.detect(fetcher, url):
                return name, module
        except Exception as exc:
            print(f"  detection for {name} errored ({exc}); trying next")
    return "generic", generic
