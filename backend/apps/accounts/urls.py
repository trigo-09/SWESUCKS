from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    FavouriteLocationViewSet,
    ChangePasswordView,
    ForgotPasswordView,
    GoogleAuthView,
    GuestLoginView,
    LoginView,
    LogoutView,
    MeView,
    ProfileView,
    RecommendationHistoryViewSet,
    RegisterView,
    ResetPasswordView,
    VerifyEmailView,
    health,
)

router = DefaultRouter()
router.register("favourites", FavouriteLocationViewSet, basename="favourites")
router.register("history", RecommendationHistoryViewSet, basename="history")

urlpatterns = [
    path("health/", health),
    path("register/", RegisterView.as_view()),
    path("verify-email/", VerifyEmailView.as_view()),
    path("login/", LoginView.as_view()),
    path("guest-login/", GuestLoginView.as_view()),
    path("google/", GoogleAuthView.as_view()),
    path("forgot-password/", ForgotPasswordView.as_view()),
    path("reset-password/", ResetPasswordView.as_view()),
    path("me/", MeView.as_view()),
    path("logout/", LogoutView.as_view()),
    path("profile/", ProfileView.as_view()),
    path("change-password/", ChangePasswordView.as_view()),
    path("", include(router.urls)),
]
