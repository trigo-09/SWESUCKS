from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import GeocodeRequestSerializer, ReverseGeocodeRequestSerializer, RouteRequestSerializer, ValidateLocationSerializer
from .services import build_multi_stop_route, geocode_address, is_in_singapore, reverse_geocode


class AutocompleteView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        serializer = GeocodeRequestSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        return Response(geocode_address(serializer.validated_data["q"]))


class ValidateLocationView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ValidateLocationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        latitude = serializer.validated_data.get("latitude")
        longitude = serializer.validated_data.get("longitude")
        label = serializer.validated_data.get("label", "")

        if latitude is None or longitude is None:
            matches = geocode_address(label)
            if not matches:
                return Response({"valid": False, "message": "Invalid Address, try again"}, status=status.HTTP_400_BAD_REQUEST)
            location = matches[0]
            if not is_in_singapore(location["latitude"], location["longitude"]):
                return Response({"valid": False, "message": "Invalid Address, try again"}, status=status.HTTP_400_BAD_REQUEST)
            return Response({"valid": True, "location": location})

        location = {"latitude": latitude, "longitude": longitude, "label": label or "Current location"}
        if not is_in_singapore(location["latitude"], location["longitude"]):
            return Response({"valid": False, "message": "Invalid Address, try again"}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"valid": True, "location": location})


class ReverseGeocodeView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        serializer = ReverseGeocodeRequestSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        return Response(reverse_geocode(serializer.validated_data["latitude"], serializer.validated_data["longitude"]))


class RoutePreviewView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        data = request.data.copy()
        # Backwards compatibility for older payload shape.
        if "destinations" not in data and data.get("destination"):
            data["destinations"] = [data["destination"]]

        serializer = RouteRequestSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        return Response(build_multi_stop_route(
            serializer.validated_data["origin"],
            serializer.validated_data["destinations"],
            serializer.validated_data["route_type"],
        ), status=200)
