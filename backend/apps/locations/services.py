import json
import logging
import math
import time

import polyline
from shapely import unary_union
from shapely.geometry import Point, shape
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from django.conf import settings
from django.core.cache import caches
from apps.common.utils import fetch_json
from .constants import AUTH_URL, ROUTE_URL, REVERSE_GEOCODE_URLS, BOUNDARY_URL, SEARCH_URL

logger = logging.getLogger(__name__)



with open(BOUNDARY_URL, "r") as f:
    geojson = json.load(f)
polygons = []

for feature in geojson["features"]:
    geom = feature["geometry"]


    if geom["type"] == "Polygon":
        geom["coordinates"] = [
            [(x, y) for x, y, *_ in ring]
            for ring in geom["coordinates"]
        ]

    polygons.append(shape(geom))

SINGAPORE_POLYGON = unary_union(polygons).buffer(0)




def is_in_singapore(latitude, longitude)->bool:
    point = Point(longitude, latitude)
    return SINGAPORE_POLYGON.covers(point)


def decode_polyline(polyline_code): #path coversion from onemap polyline to latlng
    if not polyline_code:
        return []
    decoded_points = polyline.decode(polyline_code)
    return [list(point) for point in decoded_points]


def singapore_now():
    return datetime.now(timezone.utc) + timedelta(hours=8)


def singapore_date_string():
    return singapore_now().strftime("%m-%d-%Y")


def singapore_time_string():
    return singapore_now().strftime("%H:%M:%S")


def estimate_distance_meters(origin, destination): #distance estimation from onemap using haversine formula
    if not origin or not destination:
        return 0

    if "latitude" not in origin or "longitude" not in origin:
        raise ValueError("Origin missing latitude/longitude")

    if "latitude" not in destination or "longitude" not in destination:
        raise ValueError("Destination missing latitude/longitude")

    EARTH_RADIUS_METERS = 6371000
    lat1, lon1 = map(math.radians,(origin["latitude"], origin["longitude"]))
    lat2, lon2 = map(math.radians,(destination["latitude"], destination["longitude"]))
    dlat, dlon = lat2 - lat1, lon2 - lon1
    return int(EARTH_RADIUS_METERS * 2 * math.asin(math.sqrt(math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2)))


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
    if not instructions:
        return []

    # ONE MAP INSTRUCTION FORMAT:
    INSTRUCTION_INDEX = 9  # Turn-by-turn instruction text
    ACTION_INDEX = 0  # Action type (e.g., "DEPART", "TURN")
    ROAD_INDEX = 1  # Road name
    COORDINATE_INDEX = 3  # Coordinate string "lat,lng"
    DISTANCE_TEXT_INDEX = 5 # Distance text (e.g., "1.5 km")

    normalized_instructions = []
    for step in instructions:
        if not isinstance(step, list):
            continue
        normalized_instructions.append(
            {
                "instruction": step[INSTRUCTION_INDEX] if len(step) > 9 and step[INSTRUCTION_INDEX] else (step[ACTION_INDEX] if len(step) > 0 else ""),
                "action": step[ACTION_INDEX] if len(step) > 0 else "",
                "road": step[ROAD_INDEX] if len(step) > 1 else "",
                "coordinate": step[COORDINATE_INDEX] if len(step) > 3 else "",
                "distance_text": step[DISTANCE_TEXT_INDEX] if len(step) > 5 else "",
                "raw": step,
            }
        )
    return normalized_instructions


def normalize_public_transport_itinerary(itinerary):
    sections = []
    coordinates = []
    for leg in itinerary.get("legs", []):
        geometry = ((leg.get("legGeometry") or {}).get("points")) if isinstance(leg, dict) else None
        if geometry:
            decoded = decode_polyline(geometry)
            if coordinates and decoded and coordinates[-1] == decoded[0]: #continous line
                coordinates.extend(decoded[1:])
            else:
                coordinates.extend(decoded)
        sections.append(
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
        "legs": sections,
        "coords": coordinates,
    }

onemap_cache = caches["onemap"]
TOKEN_EXPIRY_BUFFER = 60
TOKEN_EXPIRY_THRESHOLD = 300
def get_onemap_token():
    token = onemap_cache.get("access_token")
    if token:
        return token

    if not settings.ONEMAP_EMAIL or not settings.ONEMAP_PASSWORD:
        return None

    try:
        payload = fetch_json(
            AUTH_URL,
            method="POST",
            body={"email": settings.ONEMAP_EMAIL, "password": settings.ONEMAP_PASSWORD},
        )

        token = payload.get("access_token")
        expiry = payload.get("expiry_timestamp")

        if not token:
            raise RuntimeError("OneMap token response missing access_token")

        if expiry:
            cache_timeout = int(expiry) - TOKEN_EXPIRY_BUFFER - int(time.time())
            cache_timeout = max(cache_timeout, TOKEN_EXPIRY_THRESHOLD)
        else:
            cache_timeout = TOKEN_EXPIRY_THRESHOLD

        onemap_cache.set("access_token", token, timeout=cache_timeout)

        return token

    except Exception as error:
        logger.error("Failed to obtain OneMap token: %s", error)
        return None


def map_onemap_result(item): #extracting address details from onemap response
    if not item:
        return None

    if not item.get("LATITUDE") or not item.get("LONGITUDE"):
        return None

    return {
        "label": item.get("ADDRESS") or item.get("SEARCHVAL") or "Singapore",
        "latitude": float(item["LATITUDE"]),
        "longitude": float(item["LONGITUDE"]),
        "postal_code": item.get("POSTAL"),
        "source": "onemap",
    }


def format_current_location_label(latitude, longitude):
    return f"Current location ({latitude:.5f}, {longitude:.5f})"


def map_reverse_geocode_result(item, latitude, longitude):
    block = item.get("BLOCK","")
    building = item.get("BUILDINGNAME") or item.get("BUILDING") or ""
    road = item.get("ROAD") or item.get("ADDRESS") or ""
    postal = item.get("POSTALCODE") or item.get("POSTAL") or ""
    parts = [part.strip() for part in [block, building, road] if part and str(part).strip() and str(part).strip().upper() != "NIL"]
    if postal and str(postal).strip().upper() not in {"NIL", ""}:
        parts.append(f"Singapore {postal}")
    label = " ".join(parts).strip() or format_current_location_label(latitude, longitude)
    return {
        "label": label,
        "latitude": latitude,
        "longitude": longitude,
        "postal_code": postal or None,
        "source": "reverse_geocode",
    }


MAX_GEOCODE_RESULTS = 8
def geocode_address(query):
    if not query:
        return []

    token = get_onemap_token()
    if not token:
        return []

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
        results = data.get("results", [])
        for item in results:
            if not item.get("LATITUDE") or not item.get("LONGITUDE"):
                continue

            mapped = map_onemap_result(item)
            if not mapped:
                continue

            if is_in_singapore(mapped["latitude"], mapped["longitude"]):
                live_matches.append(mapped)

        if live_matches:
            return live_matches[:MAX_GEOCODE_RESULTS]

    except Exception as error:
        logger.warning("geocode_address failed for query=%r: %s", query, error)


REVERSE_GEOCODE_BUFFER = 25
def reverse_geocode(latitude, longitude):
    logger.debug("reverse_geocode lat=%s lng=%s", latitude, longitude)
    fallback = {
        "label": format_current_location_label(latitude, longitude),
        "latitude": latitude,
        "longitude": longitude,
        "source": "coordinates",
    }
    if not is_in_singapore(latitude, longitude):
        return fallback

    token = get_onemap_token()
    if not token:
        return fallback

    headers = {"Authorization": token}
    params = urlencode(
        {
            "location": f"{latitude},{longitude}",
            "buffer": REVERSE_GEOCODE_BUFFER,
            "addressType": "all",
            "otherFeatures": "N",
        }
    )
    for base_url in REVERSE_GEOCODE_URLS:
        try:
            data = fetch_json(f"{base_url}?{params}", headers=headers)
        except RuntimeError:
            continue

        candidates = data.get("GeocodeInfo") or data.get("geocodeInfo") or data.get("results")
        if not candidates:
            continue
        first = candidates[0]
        if isinstance(first, dict):
            return map_reverse_geocode_result(first, latitude, longitude)

    return fallback


def build_route_parameters(origin, destination, route_type="drive",MAX_WALK_DISTANCE=500):

    parameter_dict = {
        "start": f"{origin['latitude']},{origin['longitude']}",
        "end": f"{destination['latitude']},{destination['longitude']}",
        "routeType": route_type,
    }
    if route_type == "pt":
        parameter_dict.update({
            "date": singapore_date_string(),
            "time": singapore_time_string(),
            "mode": "transit",
            "maxWalkDistance": MAX_WALK_DISTANCE,
            "numItineraries": 3,
        })

    return urlencode(parameter_dict)

def process_public_transport_route(data, origin, destination, route_type="pt"):
    itineraries = data.get("plan", {}).get("itineraries", [])
    if not itineraries:
        summary = normalize_route_summary({}, route_type, origin, destination, "fallback")
        summary["message"] = "OneMap responded, but no PT itineraries were found."
        summary["fallback_reason"] = "response without itineraries"

        return {
            "route_type": route_type,
            "coords": [
                [origin["latitude"], origin["longitude"]],
                [destination["latitude"], destination["longitude"]],
            ],
            "summary": summary,
            "details": {
                "provider_mode": "fallback",
                "raw_response_excerpt": {
                    key: data.get(key) for key in data.keys()
                    if key in ["error", "status", "message", "plan"]
                },
            },
        }

    normalised_data = [normalize_public_transport_itinerary(item) for item in itineraries]
    main = normalised_data[0] if normalised_data else {}
    summary = normalize_route_summary(
        {
            "total_distance": main.get("walk_distance") or estimate_distance_meters(origin, destination),
            "total_time": main.get("duration") or 0,
        },
        route_type,
        origin,
        destination,
        "live",
    )

    return {
        "route_type": route_type,
        "coords": main.get("coords") or [
            [origin["latitude"], origin["longitude"]],
            [destination["latitude"], destination["longitude"]],
        ],
        "summary": summary,
        "details": {
            "provider_mode": "live",
            "plan": data.get("plan"),
            "itineraries": normalised_data,
        }
    }

def create_fallback_route(origin, destination,route_type,reason,error_message=None):
    summary = normalize_route_summary({}, route_type, origin, destination, "fallback")
    summary["message"] = f"A simplified fallback route was created because the live route request failed."
    summary["fallback_reason"] = reason
    if error_message:
        summary["error_message"] = error_message
    return {
        "route_type": route_type,
        "coords": [
            [origin["latitude"], origin["longitude"]],
            [destination["latitude"], destination["longitude"]],
        ],
        "summary": summary,
        "details": {"provider_mode": "fallback"},
    }



def process_other_route(data, origin, destination, route_type="drive"):#walking,driving
    route_geometry = data.get("route_geometry")
    if route_geometry:
        return {
            "route_type": route_type,
            "coords": decode_polyline(route_geometry),
            "summary": normalize_route_summary(data.get("route_summary") or {}, route_type, origin, destination, "live"),
            "details": {
                "provider_mode": "live",
                "route_summary": data.get("route_summary") or {},

            },
        }

    return create_fallback_route(origin,destination,route_type,"unexpected response shape")



def build_route(origin, destination, route_type="drive",MAX_WALK_DISTANCE=500):
    if not origin or not destination:
        return create_fallback_route(origin, destination, route_type, "missing origin or destination")

    token = get_onemap_token()
    if not token:
        return create_fallback_route(origin, destination, route_type, "no onemap token")

    parameters = build_route_parameters(origin, destination, route_type,MAX_WALK_DISTANCE)

    try:
        data = fetch_json(f"{ROUTE_URL}?{parameters}", headers={"Authorization": token})

        if route_type == "pt":
            return process_public_transport_route(data, origin, destination, route_type)

        return process_other_route(data, origin, destination, route_type)

    except Exception as error:
        return create_fallback_route(origin, destination, route_type, "request error", str(error))


def extract_segment_data(segment_route, from_pt, to_pt, index):
    summary = segment_route.get("summary") or {}
    coordinates = segment_route.get("coords") or []

    return {
        "segment_index": index,
        "from": from_pt,
        "to": to_pt,
        "distance_m": summary.get("distance_m", 0),
        "duration_s": summary.get("duration_s", 0),
        "coords": coordinates,
        "provider_mode": segment_route.get("details", {}).get("provider_mode", "fallback"),
        "fallback_reason": summary.get("fallback_reason", "unknown"),
    }

def normalize_coordinate_pair(coord):
    if isinstance(coord, (list, tuple)) and len(coord) >= 2:
        try:
            return [float(coord[0]), float(coord[1])]
        except (TypeError, ValueError):
            return None

    if isinstance(coord, dict):
        latitude = coord.get("latitude")
        longitude = coord.get("longitude")
        if latitude is None or longitude is None:
            return None
        try:
            return [float(latitude), float(longitude)]
        except (TypeError, ValueError):
            return None

    return None


def merge_segment_routes(existing_routes, new_routes):
    if not new_routes:
        return existing_routes

    if not existing_routes:
        return list(new_routes)

    if coordinates_match(existing_routes[-1], new_routes[0]):
        return existing_routes + new_routes[1:]

    return existing_routes + new_routes


def coordinates_match(coord1, coord2, tolerance=1e-6):
    normalized_first = normalize_coordinate_pair(coord1)
    normalized_second = normalize_coordinate_pair(coord2)
    if not normalized_first or not normalized_second:
        return False

    return (
        abs(normalized_first[0] - normalized_second[0]) < tolerance
        and abs(normalized_first[1] - normalized_second[1]) < tolerance
    )


def build_multi_stop_route(origin, stops, route_type="drive", MAX_WALK_DISTANCE=500):
    waypoints = [origin] + list(stops or [])
    segments, final_path = [], []

    for point in range(len(waypoints) - 1):
        segment_route = build_route(waypoints[point], waypoints[point + 1], route_type, MAX_WALK_DISTANCE)
        segment_coordinates = segment_route.get("coords") or []

        segments.append(extract_segment_data(segment_route, waypoints[point], waypoints[point + 1], point))
        final_path = merge_segment_routes(final_path, segment_coordinates)

    total_distance = sum(s["distance_m"] for s in segments)
    total_duration = sum(s["duration_s"] for s in segments)

    return {
        "route_type": route_type,
        "segments": segments,
        "total_distance_m": total_distance,
        "total_duration_s": total_duration,
        "num_stops": len(stops or []),
        "coords": final_path,
    }


