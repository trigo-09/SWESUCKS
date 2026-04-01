from django.conf import settings
from rest_framework import status, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import FavouriteLocation
from .serializers import FavouriteLocationSerializer, GeocodeRequestSerializer, ReverseGeocodeRequestSerializer, RouteRequestSerializer, ValidateLocationSerializer
from .services import build_multi_stop_route, geocode_address, is_in_singapore, reverse_geocode


class FavouriteLocationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = FavouriteLocationSerializer
    queryset = FavouriteLocation.objects.none()

    def get_queryset(self):
        if self.request.user.is_guest:
            return FavouriteLocation.objects.none()
        return FavouriteLocation.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        if self.request.user.is_guest:
            raise PermissionDenied("Guest users cannot save favourite locations.")
        max_favourites = getattr(settings, "MAX_FAVOURITE_LOCATIONS", 20)
        if FavouriteLocation.objects.filter(user=self.request.user).count() >= max_favourites:
            raise PermissionDenied(f"You can save a maximum of {max_favourites} favourite locations.")
        serializer.save(user=self.request.user)


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
