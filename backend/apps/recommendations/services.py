import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

from django.conf import settings
from django.core.cache import caches

from apps.common.utils import fetch_json, haversine_meters
from apps.locations.services import build_multi_stop_route, build_route
from .constants import (
    DISTANCE_BUCKET_METERS,
    DISTANCE_DECAY_FACTOR,
    LTA_CARPARK_URL,
    LTA_TAXI_URL,
    LTA_TRAFFIC_URL,
    PT_BASE_SCORE,
    SNAPSHOT_CACHE_TTL_SUCCESS,
    TAXI_COUNT_HIGH,
    TAXI_COUNT_MEDIUM,
    TAXI_SCORE_HIGH,
    TAXI_SCORE_LOW,
    TAXI_SCORE_MEDIUM,
    TAXI_SEARCH_RADIUS_M,
    TRAFFIC_PENALTY_BAD_WEATHER,
    TRAFFIC_PENALTY_GOOD_WEATHER,
    TRAFFIC_SEARCH_RADIUS_M,
    WEATHER_2HR_URL,
    WEATHER_BONUS_BAD,
    WEATHER_PENALTY_BAD,
)


logger = logging.getLogger(__name__)


def distance_meters(a_lat, a_lng, b_lat, b_lng):
    return haversine_meters(a_lat, a_lng, b_lat, b_lng)


def distance_discount(distance_meters_value):
    buckets = max(distance_meters_value // DISTANCE_BUCKET_METERS, 0)
    return round(DISTANCE_DECAY_FACTOR ** buckets, 2)


def taxi_score_from_count(count):
    if count >= TAXI_COUNT_HIGH:
        return TAXI_SCORE_HIGH
    if count >= TAXI_COUNT_MEDIUM:
        return TAXI_SCORE_MEDIUM
    return TAXI_SCORE_LOW


def is_bad_weather_label(label):
    lowered = str(label).lower()
    return any(term in lowered for term in ["rain", "shower", "thunder", "storm"])



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


def fetch_lta_taxis(destination, radius_m=TAXI_SEARCH_RADIUS_M):
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


def fetch_lta_traffic(destination, radius_m=TRAFFIC_SEARCH_RADIUS_M):
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
    """
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {
            'carparks': executor.submit(fetch_lta_carparks, destination),
            'taxis': executor.submit(fetch_lta_taxis, destination),
            'traffic': executor.submit(fetch_lta_traffic, destination),
            'weather': executor.submit(fetch_weather, destination),
        }

        results = {}
        for name, future in futures.items():
            try:
                results[name] = future.result(timeout=10)  # Prevent hangs
            except Exception as e:
                logger.warning(f"{name} fetch failed: {e}")
                results[name] = None

    carparks = results.get('carparks')
    taxis_available = results.get('taxis')
    traffic = results.get('traffic')
    weather = results.get('weather')

    if carparks is None and taxis_available is None:
        logger.info("No live carpark/taxi data available for %s", destination.get("label"))
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
                    cache.set(cache_key, snapshot, SNAPSHOT_CACHE_TTL_SUCCESS)
                except Exception:
                    logger.warning("Failed to write transport snapshot to cache", exc_info=True)
            return snapshot
    except Exception:
        logger.warning("fetch_live_snapshot raised unexpectedly", exc_info=True)

    return None


def build_justifications(mode, context):
    if mode == "drive":
        best = context["best_carpark"]
        return [
            f"Best car park: {best['name']}.",
            f"{best['available_lots']}/{best['total_lots']} lots free, {int(best['distance_m'])}m away.",
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
    ][:3]


def is_public_transport_available(origin, destinations):
    route = build_multi_stop_route(origin, destinations, route_type="pt")
    segments = route.get("segments") or []
    all_live = segments and all(s.get("provider_mode") == "live" for s in segments)
    fallback_reasons = [s.get("fallback_reason") for s in segments if s.get("provider_mode") != "live"]
    return {
        "available": all_live,
        "route": route,
        "fallback_reason": fallback_reasons[0] if fallback_reasons else None,
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

def mode_to_route_type(mode):
    return {
        "drive": "drive",
        "taxi": "drive",
        "public_transport": "pt",
        "walk": "walk",
    }.get(mode, "drive")

def normalize_leg_route_preview(route_preview):
    if not route_preview:
        return None

    details = route_preview.get("details") or {}
    flattened_details = dict(details.get("route_details") or {})

    for key in ("provider_mode", "plan", "itineraries", "raw_response_excerpt", "error"):
        if key in details and key not in flattened_details:
            flattened_details[key] = details[key]

    if (
        "route_origin" not in flattened_details
        and route_preview.get("summary", {}).get("route_type") == "pt"
    ):
        flattened_details["route_origin"] = None
        flattened_details["route_destination"] = None

    return {
        "route_type": route_preview.get("route_type"),
        "coords": route_preview.get("coords") or [],
        "summary": route_preview.get("summary") or {},
        "details": flattened_details,
    }

def generate_leg_recommendation(origin, destination, preference_mode, max_walking_distance):
    # Phase 1: fetch snapshot and PT availability in parallel — they're independent
    with ThreadPoolExecutor(max_workers=2) as executor:
        snapshot_future = executor.submit(get_transport_snapshot, destination)
        pt_future = executor.submit(is_public_transport_available, origin, [destination])
        snapshot = snapshot_future.result()
        pt_availability = pt_future.result()

    if not snapshot or not snapshot.get("carparks"):
        logger.warning("No carpark data available for %s", destination.get("label"))
        raise RuntimeError("No car parks available near this destination.")

    walking_limit = int(max_walking_distance)
    filtered = [cp for cp in snapshot["carparks"] if cp["distance_m"] <= walking_limit]
    best_carpark = filtered[0] if filtered else min(snapshot["carparks"], key=lambda cp: cp["distance_m"])

    bad_weather = snapshot["weather"]["bad_weather"]
    weather_penalty = WEATHER_PENALTY_BAD if bad_weather else 0
    weather_bonus = WEATHER_BONUS_BAD if bad_weather else 0
    traffic_penalty = TRAFFIC_PENALTY_BAD_WEATHER if bad_weather else TRAFFIC_PENALTY_GOOD_WEATHER
    drive_score = max(0, round((best_carpark["occupancy_rate"] * 100 * distance_discount(best_carpark["distance_m"])) + traffic_penalty + weather_penalty, 2))
    taxi_score = taxi_score_from_count(snapshot["taxis_available"]) + weather_bonus
    public_transport_score = PT_BASE_SCORE + weather_penalty if pt_availability["available"] else 0

    adjusted_scores = apply_preference(
        {"drive": drive_score, "taxi": taxi_score, "public_transport": public_transport_score},
        preference_mode,
    )

    recommended_mode = max(adjusted_scores, key=adjusted_scores.get)
    context = {"best_carpark": best_carpark, "snapshot": snapshot, "destination": destination}

    # Phase 2: fetch main route preview and carpark route in parallel — also independent
    best_carpark_location = {
        "label": best_carpark["name"],
        "latitude": best_carpark["latitude"],
        "longitude": best_carpark["longitude"],
    }
    with ThreadPoolExecutor(max_workers=2) as executor:
        route_future = executor.submit(
            build_route, origin, destination, mode_to_route_type(recommended_mode)
        )
        carpark_route_future = executor.submit(
            build_route, destination, best_carpark_location, "drive"
        )
        route_preview = normalize_leg_route_preview(route_future.result())
        best_carpark_route = normalize_leg_route_preview(carpark_route_future.result())

    return {
        "provider_mode": snapshot["provider_mode"],
        "origin": origin,
        "destination": destination,
        "recommended_mode": recommended_mode,
        "scores": adjusted_scores,
        "raw_scores": {
            "drive": drive_score,
            "taxi": taxi_score,
            "public_transport": public_transport_score,
        },
        "justifications": build_justifications(recommended_mode, context),
        "traffic": snapshot["traffic"],
        "weather": snapshot["weather"],
        "carparks": snapshot["carparks"],
        "best_carpark": best_carpark,
        "public_transport_available": pt_availability["available"],
        "public_transport_route": pt_availability["route"],
        "public_transport_fallback_reason": pt_availability["fallback_reason"],
        "route_preview": route_preview,
        "best_carpark_route": best_carpark_route,
    }


def generate_recommendation(origin, destinations, preference_mode, max_walking_distance):
    logger.info(
        "Generating recommendation: origin=%s destinations=%d preference=%s walking_limit=%s",
        origin.get("label"), len(destinations), preference_mode, max_walking_distance,
    )

    # Build all (origin, destination) pairs upfront — order matters for display
    waypoints = [origin] + list(destinations)
    legs = [(waypoints[i], waypoints[i + 1]) for i in range(len(waypoints) - 1)]

    # Run all legs in parallel — each leg's API calls are independent
    with ThreadPoolExecutor(max_workers=len(legs)) as executor:
        future_to_index = {
            executor.submit(
                generate_leg_recommendation, leg_origin, leg_dest, preference_mode, max_walking_distance
            ): idx
            for idx, (leg_origin, leg_dest) in enumerate(legs)
        }
        leg_results = {}
        for future in as_completed(future_to_index):
            idx = future_to_index[future]
            leg_results[idx] = future.result()

    leg_recommendations = [leg_results[i] for i in range(len(legs))]

    final_leg = leg_recommendations[-1]

    aggregate_scores = {}
    for mode in ["drive", "taxi", "public_transport"]:
        aggregate_scores[mode] = round(
            sum(leg["scores"][mode] for leg in leg_recommendations) / len(leg_recommendations),
            2,
        )

    recommended_mode = max(aggregate_scores, key=aggregate_scores.get)
    providers = {leg["provider_mode"] for leg in leg_recommendations}
    provider_mode = providers.pop() if len(providers) == 1 else "mixed"
    all_pt_available = all(leg["public_transport_available"] for leg in leg_recommendations)
    segment_routes = []
    for index, leg in enumerate(leg_recommendations):
        segment_routes.append(
            {
                "index": index + 1,
                "mode": leg["recommended_mode"],
                "route_type": (leg["route_preview"] or {}).get("route_type"),
                "coords": (leg["route_preview"] or {}).get("coords") or [],
                "origin": leg["origin"]["label"],
                "destination": leg["destination"]["label"],
            }
        )
        best_carpark_route = leg.get("best_carpark_route") or {}
        best_carpark = leg.get("best_carpark") or {}
        best_carpark_coords = best_carpark_route.get("coords") or []
        if best_carpark_coords:
            segment_routes.append(
                {
                    "index": index + 1,
                    "mode": "drive",
                    "route_type": best_carpark_route.get("route_type"),
                    "coords": best_carpark_coords,
                    "origin": leg["destination"]["label"],
                    "destination": best_carpark.get("name") or "Best carpark",
                    "variant": "best_carpark",
                    "color": "#dc2626",
                }
            )

    return {
        "provider_mode": provider_mode,
        "recommended_mode": recommended_mode,
        "scores": aggregate_scores,
        "raw_scores": final_leg["raw_scores"],
        "justifications": final_leg["justifications"],
        "traffic": final_leg["traffic"],
        "weather": final_leg["weather"],
        "carparks": final_leg["carparks"],
        "map_markers": build_map_markers(
            origin,
            destinations,
            {
                "carparks": final_leg["carparks"],
                "traffic": final_leg["traffic"],
                "weather": final_leg["weather"],
                "taxis_available": 0,
            },
            final_leg["best_carpark"],
        )
        if len(destinations) == 1
        else [{"type": "origin", "label": origin["label"], "latitude": origin["latitude"], "longitude": origin["longitude"]}]
        + [
            {
                "type": "destination",
                "label": destination["label"],
                "latitude": destination["latitude"],
                "longitude": destination["longitude"],
                "sequence": index + 1,
            }
            for index, destination in enumerate(destinations)
        ]
        + [
            {
                "type": "carpark",
                "label": carpark["name"],
                "latitude": carpark["latitude"],
                "longitude": carpark["longitude"],
                "distance_m": carpark["distance_m"],
                "available_lots": carpark["available_lots"],
                "sequence": index + 1,
                "destination_label": leg["destination"]["label"],
            }
            for index, leg in enumerate(leg_recommendations)
            for carpark in leg.get("carparks", [])[:8]
        ]
        + [
            {
                "type": "best_carpark",
                "label": leg["best_carpark"]["name"],
                "latitude": leg["best_carpark"]["latitude"],
                "longitude": leg["best_carpark"]["longitude"],
                "sequence": index + 1,
                "destination_label": leg["destination"]["label"],
            }
            for index, leg in enumerate(leg_recommendations)
            if leg.get("best_carpark")
        ],
        "best_carpark": final_leg["best_carpark"],
        "public_transport_available": all_pt_available,
        "public_transport_route": final_leg["public_transport_route"],
        "public_transport_fallback_reason": final_leg["public_transport_fallback_reason"],
        "origin": origin,
        "destinations": destinations,
        "leg_recommendations": [
            {
                **leg,
                "segment_index": index + 1,
            }
            for index, leg in enumerate(leg_recommendations)
        ],
        "segment_routes": segment_routes,
        "guest_restrictions": ["save favourite location", "past session history"],
    }