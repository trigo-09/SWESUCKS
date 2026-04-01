from rest_framework import serializers


class LocationSerializer(serializers.Serializer):
    label = serializers.CharField()
    latitude = serializers.FloatField()
    longitude = serializers.FloatField()


class RecommendationSerializer(serializers.Serializer):
    origin = LocationSerializer()
    destinations = LocationSerializer(many=True)
    preference_mode = serializers.CharField(required=False)
    max_walking_distance = serializers.CharField(required=False)

    def validate_destinations(self, value):
        if not value:
            raise serializers.ValidationError("At least one destination is required.")
        return value
