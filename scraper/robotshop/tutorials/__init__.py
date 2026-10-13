"""Tutorial pipeline: RobotShop Community tutorials, priced against our catalogue.

Separate from the product pipeline on purpose. A `Robot` is a thing for sale on
a site we crawl; a `Tutorial` is a lesson someone else wrote that we index and
link back to. They share no schema and no adapter, so they share no module.

See `run_tutorials.py` for the entry point and `wayback.py` for why the source
is the Internet Archive rather than community.robotshop.com directly.
"""
