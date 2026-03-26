from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import RecommendationHistory

from .services import generate_recommendation


class RecommendationView(APIView):
    def post(self, request):
        try:
            origin = request.data.get("origin")
            destinations = request.data.get("destinations", [])
            if not origin or not destinations:
                return Response({"detail": "Origin and at least one destination are required."}, status=status.HTTP_400_BAD_REQUEST)
            profile = getattr(request.user, "profile", None)
            preference_mode = request.data.get("preference_mode") or getattr(profile, "preference_mode", "cost")
            max_walking_distance = request.data.get("max_walking_distance") or getattr(profile, "max_walking_distance", "500")
            payload = generate_recommendation(origin, destinations, preference_mode, max_walking_distance)
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
        except Exception as error:
            return Response({"detail": str(error)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
