from django.contrib.auth import logout
from django.db import transaction
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from .models import FavouriteLocation, OTPToken, RecommendationHistory, User
from .serializers import (
    ChangePasswordSerializer,
    FavouriteLocationSerializer,
    ForgotPasswordSerializer,
    GoogleAuthSerializer,
    LoginSerializer,
    OTPVerifySerializer,
    ProfileSerializer,
    RecommendationHistorySerializer,
    RegisterSerializer,
    ResetPasswordSerializer,
    UserSerializer,
)
from .services import create_email_user, create_or_login_google_user, ensure_profile, issue_otp
import uuid

class RegisterView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            user, verification = create_email_user(serializer.validated_data["email"], serializer.validated_data["password"])
        except Exception:
            return Response(
                {"detail": "Registration failed. Please try again later."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR, #good practice to write in the status code
            )

        return Response(
            {
                "message": "Registration successful. Verify your email with the OTP sent.",
                "user": UserSerializer(user).data,
            },
            status=status.HTTP_201_CREATED,
        )


class VerifyEmailView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        serializer = OTPVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(email=serializer.validated_data["email"].lower()).first()

        if not user:
            return Response({"detail": "Account not found."}, status=404)

        otp = OTPToken.objects.filter(user=user, purpose="verify", code=serializer.validated_data["otp"]).order_by("-created_at").first()
        if not otp or not otp.is_valid:
            return Response({"detail": "Invalid or expired OTP."}, status=400)

        with transaction.atomic():
            otp.consumed_at = timezone.now()
            otp.save(update_fields=["consumed_at"])
            user.is_verified = True
            user.save(update_fields=["is_verified"])

        return Response({"message": "Email verified successfully."}, status=200)


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        token, _ = Token.objects.get_or_create(user=user) # to be updated to refresh token
        return Response({"token": token.key, "user": UserSerializer(user).data}, status=200)


class GuestLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        guest_id = uuid.uuid4().hex
        email = f"guest-{guest_id}@guest.local"
        user = User.objects.create_user(
            username=email,
            email=email,
            password=None,
            is_guest=True,
            is_verified=True,
            auth_provider="guest",
        )
        _ = ensure_profile(user)
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "user": UserSerializer(user).data}, status=201)


class GoogleAuthView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        serializer = GoogleAuthSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        google_identity = serializer.validated_data["credential"]
        result, _, error = create_or_login_google_user(
            google_identity["email"],
            google_identity.get("name", ""),
            google_id=google_identity.get("sub"),
        )

        if error:
            return Response({"detail": error}, status=400)

        user, token = result
        return Response(
            {
                "token": token,
                "user": UserSerializer(user).data,
                "google_oauth_enabled": True,
                "message": "Google sign-in successful.",
            },
            status=200
        )


class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(email=serializer.validated_data["email"].lower()).first()

        if not user:
            return Response({"detail": "If an account exists with this email, an OTP has been sent."}, status=200) #preventing revealing email existence

        try:
            issue_otp(user, "reset")
        except Exception:
            return Response(
                {"detail": "Unable to reset password right now. Please try again later."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return Response({"message": "OTP sent to email."}, status=200)


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(email=serializer.validated_data["email"].lower()).first()

        if not user:
            return Response({"detail": "If valid, your password has been reset."}, status=200)#preventing revealing email existence

        otp = OTPToken.objects.filter(user=user, purpose="reset", code=serializer.validated_data["otp"]).order_by("-created_at").first()
        if not otp or not otp.is_valid:
            return Response({"detail": "Invalid or expired OTP."}, status=400)

        if user.check_password(serializer.validated_data["new_password"]):
            return Response({"detail": "New password cannot be the same as previous password."}, status=400)

        with transaction.atomic():
            otp.consumed_at = timezone.now()
            otp.save(update_fields=["consumed_at"])

            user.set_password(serializer.validated_data["new_password"])
            user.save(update_fields=["password"])

            Token.objects.filter(user=user).delete()
        return Response({"message": "Password updated successfully."}, status=200)


class MeView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [UserRateThrottle]

    def get(self, request):
        ensure_profile(request.user)
        return Response(UserSerializer(request.user).data, status=200)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [UserRateThrottle]

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        logout(request)
        return Response({"message": "Logged out successfully."}, status=200)


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [UserRateThrottle]


    def patch(self, request):
        profile = ensure_profile(request.user)

        serializer = ProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            serializer.save()
            user = request.user
            if not user.first_login_completed:
                user.first_login_completed = True
                user.save(update_fields=["first_login_completed"])

        return Response(serializer.data, status=200)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [UserRateThrottle]


    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if request.user.auth_provider != "email":
            return Response({"detail": "Password change is only available for email-password accounts."}, status=400)

        if not request.user.check_password(serializer.validated_data["current_password"]):
            return Response({"detail": "Incorrect current password."}, status=400)

        if request.user.check_password(serializer.validated_data["new_password"]):
            return Response({"detail": "New password cannot be the same as previous password."}, status=400)

        with transaction.atomic():
            request.user.set_password(serializer.validated_data["new_password"])
            request.user.save(update_fields=["password"])
            Token.objects.filter(user=request.user).delete()
            token = Token.objects.create(user=request.user)

        return Response({"message": "Password updated successfully.", "token": token.key}, status=200)


class FavouriteLocationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    serializer_class = FavouriteLocationSerializer
    queryset = FavouriteLocation.objects.none()

    def get_queryset(self):
        if self.request.user.is_guest:
            return FavouriteLocation.objects.none()
        return FavouriteLocation.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        if self.request.user.is_guest:
            raise PermissionDenied("Guest users cannot save favourite locations.")
        serializer.save(user=self.request.user)

# ─────────────────────────────────────
# BUSINESS LOGIC VIEWS (TODO: Move to recommendations app)
# ─────────────────────────────────────
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
        from apps.recommendations.services import generate_recommendation

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


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    return Response({"status": "ok"})
