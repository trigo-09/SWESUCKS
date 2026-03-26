import json
import random
from math import asin, cos, radians, sin, sqrt
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings
from apps.locations.services import build_route


LTA_CARPARK_URL = "https://datamall2.mytransport.sg/ltaodataservice/CarParkAvailabilityv2"
LTA_TAXI_URL = "https://datamall2.mytransport.sg/ltaodataservice/Taxi-Availability"
LTA_TRAFFIC_URL = "https://datamall2.mytransport.sg/ltaodataservice/Traffic-Imagesv2"
WEATHER_2HR_URL = "https://api.data.gov.sg/v1/environment/2-hour-weather-forecast"


def fetch_json(url, headers=None, timeout=20):
    request = Request(url, headers=headers or {})
    try:
        with urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        payload = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP {error.code}: {payload[:200]}")
    except URLError as error:
        raise RuntimeError(f"Network error: {error.reason}")
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Invalid JSON response: {error}")


def haversine_meters(a_lat, a_lng, b_lat, b_lng):
    radius = 6371000
    lat1, lng1, lat2, lng2 = map(radians, [a_lat, a_lng, b_lat, b_lng])
    d_lat = lat2 - lat1
    d_lng = lng2 - lng1
    value = sin(d_lat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(d_lng / 2) ** 2
    return int(2 * radius * asin(sqrt(value)))


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
        return None
    data = fetch_json(LTA_CARPARK_URL, headers={"AccountKey": settings.LTA_ACCOUNT_KEY, "accept": "application/json"})
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
    return sorted(carparks, key=lambda item: item["distance_m"])[:20]


def fetch_lta_taxis(destination, radius_m=3000):
    if not settings.LTA_ACCOUNT_KEY:
        return None
    data = fetch_json(LTA_TAXI_URL, headers={"AccountKey": settings.LTA_ACCOUNT_KEY, "accept": "application/json"})
    count = 0
    for item in data.get("value", []):
        lat = item.get("Latitude")
        lng = item.get("Longitude")
        if lat is None or lng is None:
            continue
        if distance_meters(destination["latitude"], destination["longitude"], float(lat), float(lng)) <= radius_m:
            count += 1
    return count


def fetch_lta_traffic(destination, radius_m=2500):
    if not settings.LTA_ACCOUNT_KEY:
        return None
    data = fetch_json(LTA_TRAFFIC_URL, headers={"AccountKey": settings.LTA_ACCOUNT_KEY, "accept": "application/json"})
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
    data = fetch_json(WEATHER_2HR_URL)
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
    return {
        "label": label,
        "bad_weather": is_bad_weather_label(label),
        "area": best_area,
        "updated_at": data.get("items", [{}])[0].get("timestamp"),
    }


def fetch_live_snapshot(destination):
    carparks = fetch_lta_carparks(destination)
    taxis_available = fetch_lta_taxis(destination)
    traffic = fetch_lta_traffic(destination)
    weather = fetch_weather(destination)
    if carparks is None or taxis_available is None or not carparks:
        return None
    return {
        "provider_mode": "live",
        "carparks": carparks,
        "taxis_available": taxis_available,
        "traffic": traffic,
        "weather": weather,
    }


def get_transport_snapshot(destination):
    try:
        snapshot = fetch_live_snapshot(destination)
        if snapshot:
            return snapshot
    except RuntimeError:
        pass
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
    final_destination = destinations[-1]
    snapshot = get_transport_snapshot(final_destination)
    if not snapshot.get("carparks"):
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
