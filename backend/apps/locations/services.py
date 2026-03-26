import json
import time
from math import sqrt
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings


AUTH_URL = "https://www.onemap.gov.sg/api/auth/post/getToken"
SEARCH_URL = "https://www.onemap.gov.sg/api/common/elastic/search"
ROUTE_URL = "https://www.onemap.gov.sg/api/public/routingsvc/route"
REVERSE_GEOCODE_URLS = [
    "https://www.onemap.gov.sg/api/public/revgeocode",
    "https://www.onemap.gov.sg/api/common/elastic/revgeocode",
]

SINGAPORE_BOUNDS = {
    "min_lat": 1.20,
    "max_lat": 1.47,
    "min_lng": 103.60,
    "max_lng": 104.05,
}

SINGAPORE_POLYGON = [
    (103.605, 1.245),
    (103.650, 1.285),
    (103.700, 1.345),
    (103.760, 1.410),
    (103.840, 1.455),
    (103.930, 1.455),
    (104.000, 1.405),
    (104.020, 1.335),
    (103.980, 1.275),
    (103.900, 1.235),
    (103.780, 1.215),
    (103.670, 1.215),
]

WATER_EXCLUSION_POLYGONS = [
    [
        (103.770, 1.235),
        (103.830, 1.235),
        (103.860, 1.255),
        (103.875, 1.290),
        (103.865, 1.320),
        (103.830, 1.335),
        (103.780, 1.320),
        (103.755, 1.285),
    ],
    [
        (103.860, 1.255),
        (103.930, 1.250),
        (103.970, 1.270),
        (103.980, 1.300),
        (103.955, 1.325),
        (103.905, 1.325),
        (103.875, 1.300),
        (103.870, 1.275),
    ],
]


_cached_token = None
_cached_token_expiry = 0


def fetch_json(url, method="GET", headers=None, body=None, timeout=20):
    request = Request(url, method=method, headers=headers or {})
    if body is not None:
        request.data = json.dumps(body).encode("utf-8")
        request.add_header("Content-Type", "application/json")
    try:
        with urlopen(request, timeout=timeout) as response:
            payload = response.read().decode("utf-8")
            return json.loads(payload)
    except HTTPError as error:
        payload = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP {error.code}: {payload[:200]}")
    except URLError as error:
        raise RuntimeError(f"Network error: {error.reason}")
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Non-JSON response received: {error}")


def point_in_polygon(longitude, latitude, polygon):
    inside = False
    j = len(polygon) - 1
    for index in range(len(polygon)):
        xi, yi = polygon[index]
        xj, yj = polygon[j]
        intersects = ((yi > latitude) != (yj > latitude)) and (
            longitude < (xj - xi) * (latitude - yi) / ((yj - yi) or 1e-12) + xi
        )
        if intersects:
            inside = not inside
        j = index
    return inside


def is_within_singapore_bounds(latitude, longitude):
    return (
        SINGAPORE_BOUNDS["min_lat"] <= latitude <= SINGAPORE_BOUNDS["max_lat"]
        and SINGAPORE_BOUNDS["min_lng"] <= longitude <= SINGAPORE_BOUNDS["max_lng"]
    )


def is_in_singapore(latitude, longitude):
    if not is_within_singapore_bounds(latitude, longitude):
        return False
    if not point_in_polygon(longitude, latitude, SINGAPORE_POLYGON):
        return False
    for polygon in WATER_EXCLUSION_POLYGONS:
        if point_in_polygon(longitude, latitude, polygon):
            return False
    return True


def decode_polyline(polyline):
    index = 0
    latitude = 0
    longitude = 0
    coordinates = []
    while index < len(polyline):
        shift = result = 0
        while True:
            byte = ord(polyline[index]) - 63
            index += 1
            result |= (byte & 0x1F) << shift
            shift += 5
            if byte < 0x20:
                break
        latitude += ~(result >> 1) if result & 1 else result >> 1

        shift = result = 0
        while True:
            byte = ord(polyline[index]) - 63
            index += 1
            result |= (byte & 0x1F) << shift
            shift += 5
            if byte < 0x20:
                break
        longitude += ~(result >> 1) if result & 1 else result >> 1
        coordinates.append([latitude / 1e5, longitude / 1e5])
    return coordinates


def singapore_now():
    return datetime.now(timezone.utc) + timedelta(hours=8)


def singapore_date_string():
    return singapore_now().strftime("%m-%d-%Y")


def singapore_time_string():
    return singapore_now().strftime("%H:%M:%S")


def estimate_distance_meters(origin, destination):
    return int(
        sqrt((origin["latitude"] - destination["latitude"]) ** 2 + (origin["longitude"] - destination["longitude"]) ** 2)
        * 111000
    )


def normalize_route_summary(summary, route_type, origin, destination, provider_mode):
    distance_m = summary.get("total_distance") or summary.get("totalDistance") or estimate_distance_meters(origin, destination)
    time_seconds = summary.get("total_time") or summary.get("totalTime")
    if time_seconds is None:
        speed_mps = {"drive": 10, "walk": 1.4, "cycle": 4.5}.get(route_type, 8)
        time_seconds = max(int(distance_m / speed_mps), 60)
    return {
        "provider_mode": provider_mode,
        "route_type": route_type,
        "distance_m": int(float(distance_m)),
        "duration_s": int(float(time_seconds)),
        "has_live_geometry": provider_mode == "live",
        "message": summary.get("message", ""),
    }


def normalize_route_instructions(instructions):
    normalized = []
    for step in instructions or []:
        if not isinstance(step, list):
            continue
        normalized.append(
            {
                "instruction": step[9] if len(step) > 9 and step[9] else (step[0] if len(step) > 0 else ""),
                "action": step[0] if len(step) > 0 else "",
                "road": step[1] if len(step) > 1 else "",
                "coordinate": step[3] if len(step) > 3 else "",
                "distance_text": step[5] if len(step) > 5 else "",
                "raw": step,
            }
        )
    return normalized


def extract_extra_route_fields(data):
    extra = {}
    for key in [
        "status",
        "status_message",
        "via_points",
        "route_name",
        "route_instructions",
        "alternative_paths",
        "plan",
        "error",
    ]:
        if key in data:
            extra[key] = data[key]
    if "route_instructions" in extra:
        extra["route_instructions"] = normalize_route_instructions(extra["route_instructions"])
    return extra


def normalize_pt_itinerary(itinerary):
    legs = []
    coordinates = []
    for leg in itinerary.get("legs", []):
        geometry = ((leg.get("legGeometry") or {}).get("points")) if isinstance(leg, dict) else None
        if geometry:
            decoded = decode_polyline(geometry)
            if coordinates and decoded and coordinates[-1] == decoded[0]:
                coordinates.extend(decoded[1:])
            else:
                coordinates.extend(decoded)
        legs.append(
            {
                "mode": leg.get("mode"),
                "route": leg.get("route"),
                "from": (leg.get("from") or {}).get("name"),
                "to": (leg.get("to") or {}).get("name"),
                "duration": leg.get("duration"),
                "distance": leg.get("distance"),
            }
        )
    return {
        "duration": itinerary.get("duration"),
        "walk_time": itinerary.get("walkTime"),
        "transit_time": itinerary.get("transitTime"),
        "waiting_time": itinerary.get("waitingTime"),
        "walk_distance": itinerary.get("walkDistance"),
        "transfers": itinerary.get("transfers"),
        "fare": itinerary.get("fare"),
        "legs": legs,
        "coords": coordinates,
    }


def get_onemap_token():
    global _cached_token, _cached_token_expiry
    now = time.time()
    if _cached_token and now < _cached_token_expiry:
        return _cached_token
    if not settings.ONEMAP_EMAIL or not settings.ONEMAP_PASSWORD:
        return None
    payload = fetch_json(
        AUTH_URL,
        method="POST",
        body={"email": settings.ONEMAP_EMAIL, "password": settings.ONEMAP_PASSWORD},
    )
    token = payload.get("access_token")
    expiry = int(payload.get("expiry_timestamp") or 0)
    if not token:
        raise RuntimeError("OneMap token response missing access_token")
    _cached_token = token
    _cached_token_expiry = max(expiry - 60, int(now + 300))
    return token


def map_onemap_result(item):
    return {
        "label": item.get("ADDRESS") or item.get("SEARCHVAL") or "Singapore location",
        "latitude": float(item["LATITUDE"]),
        "longitude": float(item["LONGITUDE"]),
        "postal_code": item.get("POSTAL"),
        "source": "onemap",
    }


def format_current_location_label(latitude, longitude):
    return f"Current location ({latitude:.5f}, {longitude:.5f})"


def map_reverse_geocode_result(item, latitude, longitude):
    block = item.get("BLOCK") or ""
    building = item.get("BUILDINGNAME") or item.get("BUILDING") or ""
    road = item.get("ROAD") or item.get("ADDRESS") or ""
    postal = item.get("POSTALCODE") or item.get("POSTAL") or ""
    parts = [part.strip() for part in [block, building, road] if part and str(part).strip() and str(part).strip() != "NIL"]
    if postal and str(postal).strip() not in {"NIL", ""}:
        parts.append(f"Singapore {postal}")
    label = " ".join(parts).strip() or format_current_location_label(latitude, longitude)
    return {
        "label": label,
        "latitude": latitude,
        "longitude": longitude,
        "postal_code": postal or None,
        "source": "reverse_geocode",
    }


def geocode_address(query):
    query_lower = query.lower()
    mock_matches = [
        item | {"source": "mock"}
        for item in MOCK_LOCATIONS
        if query_lower in item["label"].lower() and is_within_singapore_bounds(item["latitude"], item["longitude"])
    ]
    token = get_onemap_token()
    if not token:
        return mock_matches
    params = urlencode(
        {
            "searchVal": query,
            "returnGeom": "Y",
            "getAddrDetails": "Y",
            "pageNum": 1,
        }
    )
    try:
        data = fetch_json(f"{SEARCH_URL}?{params}", headers={"Authorization": token})
        live_matches = []
        for item in data.get("results", []):
            if not item.get("LATITUDE") or not item.get("LONGITUDE"):
                continue
            mapped = map_onemap_result(item)
            if is_within_singapore_bounds(mapped["latitude"], mapped["longitude"]):
                live_matches.append(mapped)
        if live_matches:
            return live_matches[:8]
    except RuntimeError:
        pass
    return mock_matches


def reverse_geocode(latitude, longitude):
    fallback = {
        "label": format_current_location_label(latitude, longitude),
        "latitude": latitude,
        "longitude": longitude,
        "source": "coordinates",
    }
    if not is_within_singapore_bounds(latitude, longitude):
        return fallback

    token = get_onemap_token()
    if not token:
        return fallback

    headers = {"Authorization": token}
    params = urlencode(
        {
            "location": f"{latitude},{longitude}",
            "buffer": 25,
            "addressType": "all",
            "otherFeatures": "N",
        }
    )
    for base_url in REVERSE_GEOCODE_URLS:
        try:
            data = fetch_json(f"{base_url}?{params}", headers=headers)
        except RuntimeError:
            continue

        candidates = data.get("GeocodeInfo") or data.get("geocodeInfo") or data.get("results") or []
        if not candidates:
            continue
        first = candidates[0]
        if isinstance(first, dict):
            return map_reverse_geocode_result(first, latitude, longitude)

    return fallback


def build_route(origin, destination, route_type="drive"):
    token = get_onemap_token()
    if not token:
        summary = normalize_route_summary({}, route_type, origin, destination, "mock")
        summary["message"] = "Route geometry is in mock mode until OneMap credentials are configured."
        summary["fallback_reason"] = "missing_onemap_credentials"
        return {
            "route_type": route_type,
            "coords": [
                [origin["latitude"], origin["longitude"]],
                [destination["latitude"], destination["longitude"]],
            ],
            "summary": summary,
            "details": {"provider_mode": "mock"},
        }

    params_dict = {
        "start": f"{origin['latitude']},{origin['longitude']}",
        "end": f"{destination['latitude']},{destination['longitude']}",
        "routeType": route_type,
    }
    if route_type == "pt":
        params_dict.update(
            {
                "date": singapore_date_string(),
                "time": singapore_time_string(),
                "mode": "transit",
                "maxWalkDistance": 1000,
                "numItineraries": 3,
            }
        )
    params = urlencode(params_dict)
    try:
        data = fetch_json(f"{ROUTE_URL}?{params}", headers={"Authorization": token})
        if route_type == "pt" and ((data.get("plan") or {}).get("itineraries")):
            itineraries = [normalize_pt_itinerary(item) for item in data["plan"]["itineraries"]]
            primary = itineraries[0] if itineraries else {}
            summary = normalize_route_summary(
                {
                    "total_distance": primary.get("walk_distance") or estimate_distance_meters(origin, destination),
                    "total_time": primary.get("duration") or 0,
                },
                route_type,
                origin,
                destination,
                "live",
            )
            return {
                "route_type": route_type,
                "coords": primary.get("coords") or [
                    [origin["latitude"], origin["longitude"]],
                    [destination["latitude"], destination["longitude"]],
                ],
                "summary": summary,
                "details": {
                    "provider_mode": "live",
                    "plan": data.get("plan"),
                    "itineraries": itineraries,
                },
            }
        if route_type == "pt":
            summary = normalize_route_summary({}, route_type, origin, destination, "fallback")
            summary["message"] = "OneMap responded, but no usable PT itineraries were found."
            summary["fallback_reason"] = "pt_response_without_itineraries"
            return {
                "route_type": route_type,
                "coords": [
                    [origin["latitude"], origin["longitude"]],
                    [destination["latitude"], destination["longitude"]],
                ],
                "summary": summary,
                "details": {
                    "provider_mode": "fallback",
                    "raw_response_excerpt": {key: data.get(key) for key in data.keys() if key in ["error", "status", "message", "plan"]},
                },
            }
        if data.get("route_geometry"):
            return {
                "route_type": route_type,
                "coords": decode_polyline(data["route_geometry"]),
                "summary": normalize_route_summary(data.get("route_summary") or {}, route_type, origin, destination, "live"),
                "details": {
                    "provider_mode": "live",
                    "route_summary": data.get("route_summary") or {},
                    **extract_extra_route_fields(data),
                },
            }
    except RuntimeError as error:
        summary = normalize_route_summary({}, route_type, origin, destination, "fallback")
        summary["message"] = "Live route details were unavailable because the upstream route request failed."
        summary["fallback_reason"] = "upstream_request_error"
        return {
            "route_type": route_type,
            "coords": [
                [origin["latitude"], origin["longitude"]],
                [destination["latitude"], destination["longitude"]],
            ],
            "summary": summary,
            "details": {"provider_mode": "fallback", "error": str(error)},
        }
    summary = normalize_route_summary({}, route_type, origin, destination, "fallback")
    summary["message"] = "Live route details were unavailable, so a simplified fallback route is shown."
    summary["fallback_reason"] = "unexpected_response_shape"
    return {
        "route_type": route_type,
        "coords": [
            [origin["latitude"], origin["longitude"]],
            [destination["latitude"], destination["longitude"]],
        ],
        "summary": summary,
        "details": {"provider_mode": "fallback"},
    }
