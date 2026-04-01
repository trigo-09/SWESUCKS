import logging

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import RecommendationHistory

logger = logging.getLogger(__name__)

from .serializers import RecommendationSerializer
from .services import generate_recommendation


class RecommendationView(APIView):
    def post(self, request):
        serializer = RecommendationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = getattr(request.user, "profile", None)
        origin = serializer.validated_data["origin"]
        destinations = serializer.validated_data["destinations"]
        preference_mode = serializer.validated_data.get("preference_mode") or getattr(profile, "preference_mode", "cost")
        max_walking_distance = serializer.validated_data.get("max_walking_distance") or getattr(profile, "max_walking_distance", "500")
        try:
            payload = generate_recommendation(origin, destinations, preference_mode, max_walking_distance)
        except Exception as error:
            logger.exception("generate_recommendation failed for user=%s", getattr(request.user, "email", "anon"))
            return Response({"detail": str(error)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        if not request.user.is_guest:
            RecommendationHistory.objects.create(
                user=request.user,
                origin_label=origin["label"],
                origin_latitude=origin["latitude"],
                origin_longitude=origin["longitude"],
                destinations=destinations,
                recommendation_payload=payload,
            )
        return Response(payload)
