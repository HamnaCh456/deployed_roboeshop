"""Build the tutorial catalogue from archived RobotShop Community pages.

    python run_tutorials.py                     # full build
    python run_tutorials.py --limit 5           # fast smoke test
    python run_tutorials.py --no-cache          # ignore .cache_tutorials/
    python run_tutorials.py --report            # rebuild the report only

Output is `data/tutorials.json`, which `mock-server/server.js` serves at
`GET /tutorials`.

This is a separate entry point from `run.py` on purpose. That pipeline crawls
shops for things to sell and writes `Robot` rows; this one indexes lessons
someone else wrote and writes `Tutorial` rows. They share the keyword matcher
in `robotshop/enrich.py` and nothing else, and keeping them apart means a
change here cannot break a product crawl.

The library has two sources, and they need opposite treatment:

  RobotShop Community   One site, one layout, 87 pages worth having, and a
                        Cloudflare challenge on every automated request -
                        including one for `/robots.txt`. So we do not touch it,
                        and read the Internet Archive's public snapshots
                        instead. See `robotshop/tutorials/wayback.py`.

  Curated publishers    A short hand-checked list of individual pages, each
                        from a publisher with its own layout, each of whose
                        `robots.txt` allows the path we read. Fetched live, one
                        request each. See `robotshop/tutorials/external.py`,
                        where the list lives and adding a publisher is
                        appending to it.

Both take metadata and a link and nothing else, and every tutorial links back
to whoever wrote it. Nothing here republishes a tutorial.
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit

from robotshop.http import Fetcher
from robotshop.tutorials import bom, enrich, export, external, parse, wayback
from robotshop.tutorials.models import Tutorial, TutorialPart

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
CACHE_DIR = ROOT / ".cache_tutorials"
CATALOGUE = DATA_DIR / "robots.json"
OUT_JSON = DATA_DIR / "tutorials.json"
OUT_REPORT = DATA_DIR / "tutorials-report.txt"


def build_one(record: dict, snapshot: str, images: dict[str, tuple[str, str]],
              catalogue: list[dict]) -> Tutorial:
    """Raw parsed record -> an enriched, priced Tutorial."""
    text = f"{record['title']} {record['summary']} {record['body']}".lower()

    parts = [
        TutorialPart(**part)
        for part in bom.extract(record["body"], record["title"], catalogue)
    ]

    return Tutorial(
        id=wayback.slug_of(record["sourceUrl"]),
        title=record["title"],
        summary=record["summary"],
        image=wayback.resolve_image(record["image"], images),
        imageSourceUrl=record["image"] or None,
        sourceUrl=record["sourceUrl"],
        author=record["author"],
        publishedAt=record["publishedAt"],
        updatedAt=record["updatedAt"],
        archivedUrl=snapshot,
        series=record["series"],
        wordCount=record["wordCount"],
        format=enrich.classify_format(record["title"], record["videos"]),
        level=enrich.classify_level(text, record["title"], record["wordCount"]),
        category=enrich.classify_category(
            text, f"{record['title']} {record['summary']}"
        ),
        platforms=enrich.detect_platforms(text),
        runtimeSec=None,
        steps=len(record["steps"]),
        verifiedBuild=False,
        parts=parts,
    )


def build_external(source: external.Source, record: dict,
                   catalogue: list[dict]) -> Tutorial:
    """The same build as `build_one`, for a page we fetched from the publisher.

    Three fields differ, and only these three:

      sourceName    Whoever published it. The card prints this, so a reader
                    always knows whose work they are about to open.
      archivedUrl   None. We read the live page, so there is no snapshot to
                    cite; claiming one would be a citation to nowhere.
      image         The publisher's own URL. `wayback.resolve_image` exists
                    because community.robotshop.com answers image requests with
                    403; these publishers serve theirs, so there is nothing to
                    route around.

    Everything else - the category, level, platform and parts inference - is
    the same code on the same terms, which is the point of returning the same
    record shape from both parsers.
    """
    text = f"{record['title']} {record['summary']} {record['body']}".lower()

    parts = [
        TutorialPart(**part)
        for part in bom.extract(record["body"], record["title"], catalogue)
    ]

    return Tutorial(
        id=external_id(source),
        title=record["title"],
        summary=record["summary"],
        image=record["image"],
        imageSourceUrl=record["image"] or None,
        sourceUrl=record["sourceUrl"],
        sourceName=source.publisher,
        author=record["author"],
        publishedAt=record["publishedAt"],
        updatedAt=record["updatedAt"],
        archivedUrl=None,
        series=record["series"],
        wordCount=record["wordCount"],
        format=enrich.classify_format(record["title"], record["videos"]),
        level=enrich.classify_level(text, record["title"], record["wordCount"]),
        category=enrich.classify_category(
            text, f"{record['title']} {record['summary']}"
        ),
        platforms=enrich.detect_platforms(text),
        runtimeSec=None,
        steps=len(record["steps"]),
        verifiedBuild=False,
        parts=parts,
    )


def external_id(source: external.Source) -> str:
    """Publisher plus page slug.

    `wayback.slug_of` alone would be the last path segment, and two publishers
    can easily both have a `/getting-started/`. The id is a React key and the
    handle the featured pick uses, so a collision would drop a card off the
    page rather than fail loudly.
    """
    host = urlsplit(source.url).netloc.lower()
    host = re.sub(r"^www\.|\.(com|ai|io|org|net|co\.uk)$", "", host)
    host = re.sub(r"[^a-z0-9]+", "-", host).strip("-")
    return f"{host}-{wayback.slug_of(source.url)}"


def fetch_external(fetcher, catalogue: list[dict]) -> tuple[list[Tutorial], list[str]]:
    """Every curated page, built into Tutorials. Failures are reported, not raised.

    One unreachable publisher must not cost us the other 88 tutorials, so a
    fetch or parse failure drops that page and says so at the end.
    """
    built: list[Tutorial] = []
    failed: list[str] = []

    for position, source in enumerate(external.SOURCES, 1):
        html = fetcher.get_text(source.url)
        if not html:
            failed.append(f"{source.publisher}: could not fetch {source.url}")
            continue
        record = external.parse(html, source.url)
        if not record:
            failed.append(f"{source.publisher}: no usable article at {source.url}")
            continue
        tutorial = build_external(source, record, catalogue)
        built.append(tutorial)
        print(f"  [{position:>3}/{len(external.SOURCES)}] {tutorial.title[:52]:54} "
              f"{tutorial.sourceName}")

    return built, failed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, help="stop after N tutorials")
    parser.add_argument("--no-cache", action="store_true",
                        help="refetch every capture instead of reading .cache_tutorials/")
    parser.add_argument("--delay", type=float, default=1.0,
                        help="seconds between requests (default 1.0)")
    parser.add_argument("--no-external", action="store_true",
                        help="skip the curated publishers in tutorials/external.py")
    args = parser.parse_args(argv)

    if not CATALOGUE.exists():
        print(f"! {CATALOGUE} is missing - run `python run.py --from-config` first.\n"
              f"  Tutorials can be indexed without it, but every parts list would "
              f"be empty, which defeats the point.", file=sys.stderr)
        return 1

    print(f"catalogue: {CATALOGUE}")
    catalogue = bom.load_catalogue(CATALOGUE)
    print(f"  {len(catalogue)} in-stock, PKR-priced listings to match against\n")

    fetcher = Fetcher(cache_dir=CACHE_DIR, delay=args.delay, timeout=60.0,
                      retries=2, use_cache=not args.no_cache)

    print("indexing the Internet Archive ...")
    index = wayback.index_detail_pages(fetcher)
    if not index:
        print("! the CDX index came back empty - archive.org may be down.",
              file=sys.stderr)
        return 1
    print(f"  {len(index)} archived tutorial pages")

    images = wayback.index_images(fetcher)
    print(f"  {len(images)} archived thumbnails\n")

    items = sorted(index.items())
    if args.limit:
        items = items[: args.limit]

    tutorials: list[Tutorial] = []
    skipped: list[str] = []
    for position, (url, timestamp) in enumerate(items, 1):
        snapshot = wayback.snapshot_url(url, timestamp)
        html = fetcher.get_text(snapshot)
        if not html:
            skipped.append(url)
            continue
        record = parse.parse(html, url)
        if not record:
            skipped.append(url)
            continue
        tutorial = build_one(record, snapshot, images, catalogue)
        tutorials.append(tutorial)
        print(f"  [{position:>3}/{len(items)}] {tutorial.title[:52]:54} "
              f"{len(tutorial.parts)} parts")

    external_failed: list[str] = []
    if not args.no_external:
        print(f"\nfetching {len(external.SOURCES)} curated page(s) ...")
        built, external_failed = fetch_external(fetcher, catalogue)
        tutorials.extend(built)

    # Two sources feeding one file means ids have to be checked, not assumed.
    # A collision would not crash anything - it would quietly drop a card,
    # because the UI keys on the id.
    clashing = sorted(i for i, n in Counter(t.id for t in tutorials).items() if n > 1)
    if clashing:
        print(f"! duplicate tutorial id(s): {', '.join(clashing)}", file=sys.stderr)

    tutorials.sort(key=lambda t: (t.publishedAt or "", t.title), reverse=True)

    export.write_json(tutorials, OUT_JSON)
    export.write_report(tutorials, OUT_REPORT)

    print(f"\nwrote {OUT_JSON}  ({len(tutorials)} tutorials)")
    print(f"wrote {OUT_REPORT}")
    if skipped:
        print(f"\nskipped {len(skipped)} capture(s) with no usable article:")
        for url in skipped[:10]:
            print(f"  - {url}")
    if external_failed:
        print(f"\n{len(external_failed)} curated page(s) did not come through:")
        for note in external_failed:
            print(f"  - {note}")
    print(f"\nfetcher: {fetcher.stats}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
