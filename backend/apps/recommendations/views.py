import logging

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import RecommendationHistory
from .serializers import RecommendationHistorySerializer, RecommendationSerializer
from .services import generate_recommendation

logger = logging.getLogger(__name__)


class RecommendationHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = RecommendationHistorySerializer
    queryset = RecommendationHistory.objects.none()

    def get_queryset(self):
        if self.request.user.is_guest:
            return RecommendationHistory.objects.none()
        return RecommendationHistory.objects.filter(user=self.request.user)

    @action(detail=True, methods=["get"])
    def rerun_payload(self, request, pk=None):
        history = self.get_object()
        profile = getattr(request.user, "profile", None)
        payload = generate_recommendation(
            {
                "label": history.origin_label,
                "latitude": history.origin_latitude,
                "longitude": history.origin_longitude,
            },
            history.destinations,
            getattr(profile, "preference_mode", "cost"),
            getattr(profile, "max_walking_distance", "500"),
        )
        return Response(payload)


class RecommendationView(APIView):
    permission_classes = [IsAuthenticated]

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
