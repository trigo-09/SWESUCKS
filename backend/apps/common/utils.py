import json
import logging
import time
from math import asin, cos, radians, sin, sqrt
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)


def fetch_json(url, method="GET", headers=None, body=None, timeout=20):
    """
    Shared HTTP JSON fetcher with retry logic (3 attempts, 0.5s delay).
    Supports GET and POST. Used by both locations and recommendations services.
    """
    headers = headers or {}
    encoded_body = None
    if body is not None:
        encoded_body = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"

    for attempt in range(3):
        request = Request(url, data=encoded_body, method=method, headers=headers)
        try:
            with urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            payload = error.read().decode("utf-8", errors="ignore")
            logger.warning("fetch_json HTTP %s on %s (attempt %d): %s", error.code, url, attempt + 1, payload[:200])
            if attempt < 2:
                time.sleep(0.5)
                continue
            raise RuntimeError(f"HTTP {error.code}: {payload[:200]}")
        except URLError as error:
            logger.warning("fetch_json URLError on %s (attempt %d): %s", url, attempt + 1, error)
            if attempt < 2:
                time.sleep(0.5)
                continue
            raise RuntimeError(f"Network error: {error}")
        except json.JSONDecodeError as error:
            logger.error("fetch_json JSON decode error on %s: %s", url, error)
            raise RuntimeError(f"Invalid JSON response: {error}")


def haversine_meters(lat1, lng1, lat2, lng2):
    """Haversine distance in metres between two lat/lng points."""
    r = 6_371_000
    phi1, phi2 = radians(lat1), radians(lat2)
    dphi = radians(lat2 - lat1)
    dlambda = radians(lng2 - lng1)
    a = sin(dphi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(dlambda / 2) ** 2
    return 2 * r * asin(sqrt(a))


def estimate_distance_meters(origin, destination):
    """Haversine distance between two location dicts (each with latitude/longitude keys)."""
    return haversine_meters(
        origin["latitude"], origin["longitude"],
        destination["latitude"], destination["longitude"],
    )
