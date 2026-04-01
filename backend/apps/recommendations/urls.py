from django.urls import include, path
from rest_framework.routers import SimpleRouter

from .views import RecommendationHistoryViewSet, RecommendationView

router = SimpleRouter()
router.register("history", RecommendationHistoryViewSet, basename="history")

urlpatterns = [
    path("generate/", RecommendationView.as_view()),
    path("", include(router.urls)),
]
