from rest_framework import serializers


class GeocodeRequestSerializer(serializers.Serializer):
    q = serializers.CharField(
        max_length=200,
        min_length=2,
        required=True,
        help_text="Address or location name to search",
    )


class ValidateLocationSerializer(serializers.Serializer):
    latitude = serializers.FloatField(required=False, allow_null=True)
    longitude = serializers.FloatField(required=False, allow_null=True)
    label = serializers.CharField(required=False, default="")


class ReverseGeocodeRequestSerializer(serializers.Serializer):
    latitude = serializers.FloatField(min_value=-90, max_value=90, required=True)
    longitude = serializers.FloatField(min_value=-180, max_value=180, required=True)


class RouteRequestSerializer(serializers.Serializer):
    origin = serializers.DictField(required=True)
    destinations = serializers.ListField(child=serializers.DictField(), required=True)
    route_type = serializers.CharField(default="drive")

    def validate_origin(self, value):
        if "latitude" not in value or "longitude" not in value:
            raise serializers.ValidationError("Origin must have 'latitude' and 'longitude' keys.")
        try:
            lat = float(value["latitude"])
            lng = float(value["longitude"])
            if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
                raise serializers.ValidationError("Coordinates must be valid latitude/longitude.")
        except (TypeError, ValueError):
            raise serializers.ValidationError("Latitude and longitude must be numbers.")
        return value

    def validate_destinations(self, value):
        if not value:
            raise serializers.ValidationError("At least one destination is required.")
        for i, dest in enumerate(value):
            if "latitude" not in dest or "longitude" not in dest:
                raise serializers.ValidationError(f"Destination {i} must have 'latitude' and 'longitude'.")
        return value

    def validate_route_type(self, value):
        allowed = ["drive", "walk", "cycle", "pt"]
        if value not in allowed:
            raise serializers.ValidationError(f"route_type must be one of: {', '.join(allowed)}.")
        return value
