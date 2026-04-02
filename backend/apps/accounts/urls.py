from django.urls import path

from .views import (
    ChangePasswordView,
    ForgotPasswordView,
    GoogleAuthView,
    GuestLoginView,
    LoginView,
    LogoutView,
    MeView,
    ProfileView,
    RegisterView,
    ResetPasswordView,
    VerifyEmailView,
    health,
)

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
]
