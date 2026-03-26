from django.urls import path

from .views import AutocompleteView, ReverseGeocodeView, RoutePreviewView, ValidateLocationView


urlpatterns = [
    path("autocomplete/", AutocompleteView.as_view()),
    path("validate/", ValidateLocationView.as_view()),
    path("reverse-geocode/", ReverseGeocodeView.as_view()),
    path("route-preview/", RoutePreviewView.as_view()),
]
