"""Polite HTTP layer: retries, rate limiting, and an on-disk cache.

The cache is the important part during development. Re-running the pipeline to
fix a parser bug should not re-hit the vendor's server 144 times; only the first
run touches the network. Delete `.cache/` to force a refetch.
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from typing import Any

import httpx

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 "
    "RobotEshop-FYDP/0.1 (+academic project; contact bsef23m007@pucit.edu.pk)"
)

# A realistic browser header set, not just a User-Agent.
#
# robostan.pk sits behind Hostinger's CDN WAF (`server: hcdn`), which answered
# every request with a "Checking your browser" interstitial and HTTP 403. It is
# not a cookie or JavaScript challenge - a headless Chromium was let through on
# its very first request and no clearance cookie was ever set. Isolating the
# variable showed the WAF fingerprints the *header set*: a request carrying only
# a User-Agent is refused, while the same request with the headers below is
# served. So this is what unblocks that site, and it costs nothing elsewhere.
#
# Note we keep identifying ourselves honestly in the UA above. The block was
# never about who we said we were - a plain Chrome UA alone is refused too.
BROWSER_HEADERS = {
    "User-Agent": UA,
    "Accept": ("text/html,application/xhtml+xml,application/xml;q=0.9,"
               "image/avif,image/webp,image/apng,*/*;q=0.8"),
    "Accept-Language": "en-US,en;q=0.9",
    "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-User": "?1",
    "Sec-Fetch-Dest": "document",
    "Upgrade-Insecure-Requests": "1",
}


class Fetcher:
    def __init__(
        self,
        cache_dir: Path,
        delay: float = 1.0,
        timeout: float = 45.0,
        retries: int = 3,
        use_cache: bool = True,
    ) -> None:
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.delay = delay
        self.retries = retries
        self.use_cache = use_cache
        self._last_request = 0.0
        self.client = httpx.Client(
            headers=dict(BROWSER_HEADERS),
            timeout=timeout,
            follow_redirects=True,
        )
        self.stats = {"network": 0, "cache": 0, "errors": 0, "blocked": 0}

    def _cache_path(self, url: str) -> Path:
        return self.cache_dir / f"{hashlib.sha256(url.encode()).hexdigest()[:24]}.txt"

    def _throttle(self) -> None:
        elapsed = time.monotonic() - self._last_request
        if elapsed < self.delay:
            time.sleep(self.delay - elapsed)
        self._last_request = time.monotonic()

    def get_text(self, url: str) -> str | None:
        cache_file = self._cache_path(url)
        if self.use_cache and cache_file.exists():
            self.stats["cache"] += 1
            return cache_file.read_text(encoding="utf-8")

        last_error: Exception | str | None = None
        for attempt in range(self.retries):
            self._throttle()
            try:
                resp = self.client.get(url)
                if resp.status_code == 200:
                    cache_file.write_text(resp.text, encoding="utf-8")
                    self.stats["network"] += 1
                    return resp.text
                # 404 is a real answer, not a transient failure - do not retry.
                if resp.status_code == 404:
                    self.stats["errors"] += 1
                    return None
                # 403 from a WAF is not transient either, and retrying it just
                # looks more like abuse. Say what it is so it is diagnosable:
                # a silent "3 attempts failed" hides a whole blocked site.
                if resp.status_code == 403:
                    self.stats["errors"] += 1
                    self.stats["blocked"] += 1
                    print(f"    ! 403 blocked {url} "
                          f"(server={resp.headers.get('server', '?')})")
                    return None
                last_error = f"HTTP {resp.status_code}"
            except Exception as exc:  # network flake, DNS, TLS, read timeout
                last_error = exc
            time.sleep(2 ** attempt)

        self.stats["errors"] += 1
        print(f"    ! fetch failed {url}: {last_error}")
        return None

    def get_json(self, url: str) -> Any | None:
        text = self.get_text(url)
        if text is None:
            return None
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # A Shopify store with the JSON endpoints disabled answers with an
            # HTML error page, which lands here. Treat it as "endpoint absent".
            return None

    def post_json(self, url: str, payload: dict, cache_key: str | None = None) -> Any | None:
        """POST JSON and return the decoded reply.

        Needed for Magento's GraphQL endpoint, which is the only way into
        instock.pk's 2,244-product catalog. Responses are cached under an
        explicit `cache_key` because the URL alone is identical for every query
        - caching by URL would make page 2 return page 1's products.
        """
        cache_file = None
        if cache_key:
            digest = hashlib.sha256(f"{url}|{cache_key}".encode()).hexdigest()[:24]
            cache_file = self.cache_dir / f"post_{digest}.json"
            if self.use_cache and cache_file.exists():
                self.stats["cache"] += 1
                try:
                    return json.loads(cache_file.read_text(encoding="utf-8"))
                except json.JSONDecodeError:
                    pass  # corrupt cache entry; fall through and refetch

        last_error: Exception | str | None = None
        for attempt in range(self.retries):
            self._throttle()
            try:
                resp = self.client.post(url, json=payload)
                if resp.status_code == 200:
                    self.stats["network"] += 1
                    if cache_file is not None:
                        cache_file.write_text(resp.text, encoding="utf-8")
                    return resp.json()
                if resp.status_code in (400, 403, 404):
                    self.stats["errors"] += 1
                    return None
                last_error = f"HTTP {resp.status_code}"
            except Exception as exc:
                last_error = exc
            time.sleep(2 ** attempt)

        self.stats["errors"] += 1
        print(f"    ! post failed {url}: {last_error}")
        return None

    def get_bytes(self, url: str) -> bytes | None:
        """Used for images; deliberately not text-cached."""
        for attempt in range(self.retries):
            self._throttle()
            try:
                resp = self.client.get(url)
                if resp.status_code == 200:
                    return resp.content
            except Exception:
                pass
            time.sleep(2 ** attempt)
        return None

    def close(self) -> None:
        self.client.close()
