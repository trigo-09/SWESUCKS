from django.urls import include, path
from rest_framework.routers import SimpleRouter

from .views import AutocompleteView, FavouriteLocationViewSet, ReverseGeocodeView, RoutePreviewView, ValidateLocationView

router = SimpleRouter()
router.register("favourites", FavouriteLocationViewSet, basename="favourites")

urlpatterns = [
    path("autocomplete/", AutocompleteView.as_view()),
    path("validate/", ValidateLocationView.as_view()),
    path("reverse-geocode/", ReverseGeocodeView.as_view()),
    path("route-preview/", RoutePreviewView.as_view()),
    path("", include(router.urls)),
]
