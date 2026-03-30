from rest_framework import serializers

class GeocodeRequestSerializer(serializers.Serializer):
    q = serializers.CharField(
        max_length=200,
        min_length=2,
        required=True,
        help_text="Address or location name to search"
    )

    limit = serializers.IntegerField(
        default=5,
        min_value=1,
        max_value=10,
        required=False,
    )


class ReverseGeocodeRequestSerializer(serializers.Serializer):
    """Validate reverse geocoding input."""
    latitude = serializers.FloatField(
        min_value=-90,
        max_value=90,
        required=True,
    )
    longitude = serializers.FloatField(
        min_value=-180,
        max_value=180,
        required=True,
    )


class LocationResponseSerializer(serializers.Serializer):
    """Standardized location output format."""
    label = serializers.CharField()
    latitude = serializers.FloatField()
    longitude = serializers.FloatField()
    postal_code = serializers.CharField(allow_null=True)
    source = serializers.CharField()


class RouteRequestSerializer(serializers.Serializer):
    """Validate route building input."""
    origin = serializers.DictField(required=True)
    destinations = serializers.ListField(
        child=serializers.DictField(),
        required=True,
    )
    route_type = serializers.CharField(
        default="drive",
        help_text="drive, walk, cycle, or pt"
    )



class RouteRequestSerializer(serializers.Serializer):
    """Validate route request BEFORE it reaches services."""

    origin = serializers.DictField(required=True)
    destinations = serializers.ListField(
        child=serializers.DictField(),
        required=True,
    )
    route_type = serializers.CharField(default="drive")

    # ✅ Validate origin structure
    def validate_origin(self, value):
        if "latitude" not in value or "longitude" not in value:
            raise serializers.ValidationError(
                "Origin must have 'latitude' and 'longitude' keys"
            )
        try:
            lat = float(value["latitude"])
            lng = float(value["longitude"])
            if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
                raise serializers.ValidationError(
                    "Coordinates must be valid latitude/longitude"
                )
        except (TypeError, ValueError):
            raise serializers.ValidationError(
                "Latitude and longitude must be numbers"
            )
        return value

    # ✅ Validate destinations structure
    def validate_destinations(self, value):
        if len(value) == 0:
            raise serializers.ValidationError(
                "At least one destination is required"
            )
        for i, dest in enumerate(value):
            if "latitude" not in dest or "longitude" not in dest:
                raise serializers.ValidationError(
                    f"Destination {i} must have 'latitude' and 'longitude'"
                )
        return value

    # ✅ Validate route_type
    def validate_route_type(self, value):
        allowed = ["drive", "walk", "cycle", "pt"]
        if value not in allowed:
            raise serializers.ValidationError(
                f"route_type must be one of: {', '.join(allowed)}"
            )
        return value