import logging
import random

from django.conf import settings
from django.core.cache import caches

from apps.common.utils import fetch_json, haversine_meters
from apps.locations.services import build_route


logger = logging.getLogger(__name__)

LTA_CARPARK_URL = "https://datamall2.mytransport.sg/ltaodataservice/CarParkAvailabilityv2"
LTA_TAXI_URL = "https://datamall2.mytransport.sg/ltaodataservice/Taxi-Availability"
LTA_TRAFFIC_URL = "https://datamall2.mytransport.sg/ltaodataservice/Traffic-Imagesv2"
WEATHER_2HR_URL = "https://api.data.gov.sg/v1/environment/2-hour-weather-forecast"

_SNAPSHOT_CACHE_TTL = 90  # seconds


def distance_meters(a_lat, a_lng, b_lat, b_lng):
    return haversine_meters(a_lat, a_lng, b_lat, b_lng)


def distance_discount(distance_meters_value):
    buckets = max(distance_meters_value // 200, 0)
    return round(0.9 ** buckets, 2)


def taxi_score_from_count(count):
    if count >= 5:
        return 90
    if count >= 2:
        return 60
    return 30


def is_bad_weather_label(label):
    lowered = str(label).lower()
    return any(term in lowered for term in ["rain", "shower", "thunder", "storm"])


def mock_transport_snapshot(destination):
    base_lat = destination["latitude"]
    base_lng = destination["longitude"]
    carparks = []
    for idx in range(4):
        total = random.choice([80, 100, 120])
        available = random.randint(8, total)
        lat = base_lat + random.uniform(-0.003, 0.003)
        lng = base_lng + random.uniform(-0.003, 0.003)
        carparks.append(
            {
                "name": f"Carpark {idx + 1}",
                "latitude": lat,
                "longitude": lng,
                "total_lots": total,
                "available_lots": available,
                "distance_m": distance_meters(base_lat, base_lng, lat, lng),
                "occupancy_rate": round(available / total, 2),
            }
        )
    weather = random.choice(
        [
            {"label": "Light showers", "bad_weather": False, "area": "Singapore", "updated_at": "Just now"},
            {"label": "Cloudy", "bad_weather": False, "area": "Singapore", "updated_at": "Just now"},
            {"label": "Heavy rain", "bad_weather": True, "area": "Singapore", "updated_at": "Just now"},
        ]
    )
    return {
        "provider_mode": "mock",
        "carparks": sorted(carparks, key=lambda item: item["distance_m"]),
        "taxis_available": random.randint(0, 8),
        "traffic": {
            "camera_location": destination["label"],
            "image_url": "https://placehold.co/640x360?text=Traffic+Snapshot",
            "captured_at": "Just now",
            "status": "available",
        },
        "weather": weather,
    }


def fetch_lta_carparks(destination):
    if not settings.LTA_ACCOUNT_KEY:
        logger.debug("LTA_ACCOUNT_KEY not set — skipping carpark fetch")
        return None
    try:
        data = fetch_json(LTA_CARPARK_URL, headers={"AccountKey": settings.LTA_ACCOUNT_KEY, "accept": "application/json"})
    except Exception:
        logger.warning("Failed to fetch LTA carparks", exc_info=True)
        return None
    carparks = []
    for item in data.get("value", []):
        location = item.get("Location")
        if not location or item.get("LotType") != "C":
            continue
        try:
            parts = [part.strip() for part in str(location).replace(",", " ").split()]
            lat_text, lng_text = parts[0], parts[1]
            lat = float(lat_text)
            lng = float(lng_text)
        except (ValueError, TypeError, IndexError):
            continue
        total = int(item.get("TotalLots") or 0)
        available = int(item.get("AvailableLots") or 0)
        if total <= 0:
            total = max(available, 1)
        carparks.append(
            {
                "name": item.get("Development") or item.get("CarParkID") or "Carpark",
                "latitude": lat,
                "longitude": lng,
                "total_lots": total,
                "available_lots": available,
                "distance_m": distance_meters(destination["latitude"], destination["longitude"], lat, lng),
                "occupancy_rate": round(min(available / total, 1), 2),
            }
        )
    result = sorted(carparks, key=lambda item: item["distance_m"])[:20]
    logger.debug("Fetched %d carparks near %s", len(result), destination.get("label"))
    return result


def fetch_lta_taxis(destination, radius_m=3000):
    if not settings.LTA_ACCOUNT_KEY:
        logger.debug("LTA_ACCOUNT_KEY not set — skipping taxi fetch")
        return None
    try:
        data = fetch_json(LTA_TAXI_URL, headers={"AccountKey": settings.LTA_ACCOUNT_KEY, "accept": "application/json"})
    except Exception:
        logger.warning("Failed to fetch LTA taxis", exc_info=True)
        return None
    count = 0
    for item in data.get("value", []):
        lat = item.get("Latitude")
        lng = item.get("Longitude")
        if lat is None or lng is None:
            continue
        if distance_meters(destination["latitude"], destination["longitude"], float(lat), float(lng)) <= radius_m:
            count += 1
    logger.debug("Found %d taxis within %dm of %s", count, radius_m, destination.get("label"))
    return count


def fetch_lta_traffic(destination, radius_m=2500):
    if not settings.LTA_ACCOUNT_KEY:
        logger.debug("LTA_ACCOUNT_KEY not set — skipping traffic fetch")
        return {"camera_location": destination["label"], "image_url": None, "captured_at": None, "status": "unavailable"}
    try:
        data = fetch_json(LTA_TRAFFIC_URL, headers={"AccountKey": settings.LTA_ACCOUNT_KEY, "accept": "application/json"})
    except Exception:
        logger.warning("Failed to fetch LTA traffic images", exc_info=True)
        return {"camera_location": destination["label"], "image_url": None, "captured_at": None, "status": "unavailable"}
    best = None
    best_distance = None
    for item in data.get("value", []):
        lat = item.get("Latitude")
        lng = item.get("Longitude")
        if lat is None or lng is None:
            continue
        current_distance = distance_meters(destination["latitude"], destination["longitude"], float(lat), float(lng))
        if current_distance <= radius_m and (best_distance is None or current_distance < best_distance):
            best = item
            best_distance = current_distance
    if not best:
        return {"camera_location": destination["label"], "image_url": None, "captured_at": None, "status": "unavailable"}
    return {
        "camera_location": destination["label"],
        "image_url": best.get("ImageLink"),
        "captured_at": best.get("LastUpdated") or data.get("LastUpdated"),
        "status": "available",
    }


def fetch_weather(destination):
    try:
        data = fetch_json(WEATHER_2HR_URL)
    except Exception:
        logger.warning("Failed to fetch weather data", exc_info=True)
        return {"label": "Unknown", "bad_weather": False, "area": None, "updated_at": None}
    area_metadata = data.get("area_metadata", [])
    forecasts = data.get("items", [{}])[0].get("forecasts", [])
    best_area = None
    best_distance = None
    for item in area_metadata:
        label_location = item.get("label_location") or {}
        lat = label_location.get("latitude")
        lng = label_location.get("longitude")
        if lat is None or lng is None:
            continue
        current_distance = distance_meters(destination["latitude"], destination["longitude"], float(lat), float(lng))
        if best_distance is None or current_distance < best_distance:
            best_distance = current_distance
            best_area = item.get("name")
    forecast = next((entry for entry in forecasts if entry.get("area") == best_area), None)
    label = forecast.get("forecast") if forecast else "Unknown"
    logger.debug("Weather near %s: %s (area=%s)", destination.get("label"), label, best_area)
    return {
        "label": label,
        "bad_weather": is_bad_weather_label(label),
        "area": best_area,
        "updated_at": data.get("items", [{}])[0].get("timestamp"),
    }


def fetch_live_snapshot(destination):
    """Fetch a live transport snapshot, treating each data source independently.

    Returns None only if both carparks AND taxis are unavailable (no LTA key).
    Traffic and weather failures degrade gracefully to safe fallback values.
    """
    carparks = fetch_lta_carparks(destination)
    taxis_available = fetch_lta_taxis(destination)
    traffic = fetch_lta_traffic(destination)
    weather = fetch_weather(destination)

    # If we have no LTA key at all, signal caller to use mock data
    if carparks is None and taxis_available is None:
        logger.info("No live carpark/taxi data available for %s — falling back to mock", destination.get("label"))
        return None

    return {
        "provider_mode": "live",
        "carparks": carparks or [],
        "taxis_available": taxis_available if taxis_available is not None else 0,
        "traffic": traffic,
        "weather": weather,
    }


def get_transport_snapshot(destination):
    cache_key = f"transport_snapshot_{destination['latitude']}_{destination['longitude']}"
    try:
        cache = caches["recommendations"]
        cached = cache.get(cache_key)
        if cached is not None:
            logger.debug("Cache hit for transport snapshot: %s", destination.get("label"))
            return cached
    except Exception:
        logger.warning("Cache unavailable for transport snapshot", exc_info=True)
        cache = None

    try:
        snapshot = fetch_live_snapshot(destination)
        if snapshot and snapshot.get("carparks"):
            if cache:
                try:
                    cache.set(cache_key, snapshot, _SNAPSHOT_CACHE_TTL)
                except Exception:
                    logger.warning("Failed to write transport snapshot to cache", exc_info=True)
            return snapshot
    except Exception:
        logger.warning("fetch_live_snapshot raised unexpectedly", exc_info=True)

    logger.info("Using mock transport snapshot for %s", destination.get("label"))
    return mock_transport_snapshot(destination)


def build_justifications(mode, context):
    if mode == "drive":
        best = context["best_carpark"]
        return [
            f"Best car park: {best['name']}.",
            f"{best['available_lots']}/{best['total_lots']} lots free, {best['distance_m']}m away.",
            f"Traffic near {context['destination']['label']} is {context['snapshot']['traffic']['status']}.",
        ][:3]
    if mode == "taxi":
        return [
            f"{context['snapshot']['taxis_available']} taxis detected nearby.",
            "Taxi is favored for faster pickup under current conditions.",
            f"Weather is {context['snapshot']['weather']['label'].lower()}.",
        ][:3]
    return [
        "Public transport remains the most balanced option.",
        f"Weather is {context['snapshot']['weather']['label'].lower()}.",
        "No parking search is required for this route.",
    ][:3]


def is_public_transport_available(origin, destination):
    route = build_route(origin, destination, "pt")
    summary = route.get("summary") or {}
    return {
        "available": summary.get("provider_mode") == "live",
        "route": route,
        "fallback_reason": summary.get("fallback_reason"),
    }


def apply_preference(scores, preference_mode):
    coefficients = {
        "cost": {"public_transport": 1.1, "drive": 1.0, "taxi": 0.9},
        "time": {"public_transport": 1.0, "drive": 1.05, "taxi": 1.1},
    }
    chosen = coefficients.get(preference_mode, coefficients["cost"])
    return {mode: round(value * chosen[mode], 2) for mode, value in scores.items()}


def build_map_markers(origin, destinations, snapshot, best_carpark):
    markers = [{"type": "origin", "label": origin["label"], "latitude": origin["latitude"], "longitude": origin["longitude"]}]
    for index, destination in enumerate(destinations, start=1):
        markers.append(
            {
                "type": "destination",
                "label": destination["label"],
                "latitude": destination["latitude"],
                "longitude": destination["longitude"],
                "sequence": index,
            }
        )
    for carpark in snapshot["carparks"][:8]:
        markers.append(
            {
                "type": "carpark",
                "label": carpark["name"],
                "latitude": carpark["latitude"],
                "longitude": carpark["longitude"],
                "distance_m": carpark["distance_m"],
                "available_lots": carpark["available_lots"],
            }
        )
    if best_carpark:
        markers.append(
            {
                "type": "best_carpark",
                "label": best_carpark["name"],
                "latitude": best_carpark["latitude"],
                "longitude": best_carpark["longitude"],
            }
        )
    return markers


def generate_recommendation(origin, destinations, preference_mode, max_walking_distance):
    logger.info(
        "Generating recommendation: origin=%s destinations=%d preference=%s walking_limit=%s",
        origin.get("label"), len(destinations), preference_mode, max_walking_distance,
    )
    final_destination = destinations[-1]
    snapshot = get_transport_snapshot(final_destination)
    if not snapshot.get("carparks"):
        logger.debug("No carparks in snapshot — using mock data for %s", final_destination.get("label"))
        snapshot = mock_transport_snapshot(final_destination)
    pt_availability = is_public_transport_available(origin, final_destination)
    walking_limit = int(max_walking_distance)
    filtered = [cp for cp in snapshot["carparks"] if cp["distance_m"] <= walking_limit]
    best_carpark = filtered[0] if filtered else min(snapshot["carparks"], key=lambda cp: cp["distance_m"])

    weather_penalty = -20 if snapshot["weather"]["bad_weather"] else 0
    weather_bonus = 20 if snapshot["weather"]["bad_weather"] else 0
    traffic_penalty = -15 if snapshot["weather"]["bad_weather"] else -5
    drive_score = max(0, round((best_carpark["occupancy_rate"] * 100 * distance_discount(best_carpark["distance_m"])) + traffic_penalty + weather_penalty, 2))
    taxi_score = taxi_score_from_count(snapshot["taxis_available"]) + weather_bonus
    public_transport_score = 75 + weather_penalty if pt_availability["available"] else 0

    adjusted_scores = apply_preference(
        {"drive": drive_score, "taxi": taxi_score, "public_transport": public_transport_score},
        preference_mode,
    )
    recommended_mode = max(adjusted_scores, key=adjusted_scores.get)
    logger.info("Recommendation result: mode=%s scores=%s", recommended_mode, adjusted_scores)
    context = {"best_carpark": best_carpark, "snapshot": snapshot, "destination": final_destination}
    return {
        "provider_mode": snapshot["provider_mode"],
        "recommended_mode": recommended_mode,
        "scores": adjusted_scores,
        "raw_scores": {"drive": drive_score, "taxi": taxi_score, "public_transport": public_transport_score},
        "justifications": build_justifications(recommended_mode, context),
        "traffic": snapshot["traffic"],
        "weather": snapshot["weather"],
        "carparks": snapshot["carparks"],
        "map_markers": build_map_markers(origin, destinations, snapshot, best_carpark),
        "best_carpark": best_carpark,
        "public_transport_available": pt_availability["available"],
        "public_transport_route": pt_availability["route"],
        "public_transport_fallback_reason": pt_availability["fallback_reason"],
        "origin": origin,
        "destinations": destinations,
        "guest_restrictions": ["save favourite location", "past session history"],
    }
