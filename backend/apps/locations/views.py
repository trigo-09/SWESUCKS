from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .services import build_route, geocode_address, is_in_singapore, is_within_singapore_bounds, reverse_geocode


class AutocompleteView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        query = request.query_params.get("q", "").strip()
        if not query:
            return Response([])
        return Response(geocode_address(query))


class ValidateLocationView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        latitude = request.data.get("latitude")
        longitude = request.data.get("longitude")
        label = request.data.get("label", "")
        if latitude is None or longitude is None:
            matches = geocode_address(label)
            if not matches:
                return Response({"valid": False, "message": "Invalid Address, try again"}, status=status.HTTP_400_BAD_REQUEST)
            location = matches[0]
            if not is_within_singapore_bounds(location["latitude"], location["longitude"]):
                return Response({"valid": False, "message": "Invalid Address, try again"}, status=status.HTTP_400_BAD_REQUEST)
            return Response({"valid": True, "location": location})

        location = {"latitude": float(latitude), "longitude": float(longitude), "label": label or "Current location"}
        if not is_within_singapore_bounds(location["latitude"], location["longitude"]):
            return Response({"valid": False, "message": "Invalid Address, try again"}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"valid": True, "location": location})


class ReverseGeocodeView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        latitude = float(request.query_params.get("latitude"))
        longitude = float(request.query_params.get("longitude"))
        return Response(reverse_geocode(latitude, longitude))


class RoutePreviewView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        origin = request.data.get("origin")
        destination = request.data.get("destination")
        route_type = request.data.get("route_type", "drive")
        if not origin or not destination:
            return Response({"detail": "Origin and destination are required."}, status=status.HTTP_400_BAD_REQUEST)
        return Response(build_route(origin, destination, route_type))
