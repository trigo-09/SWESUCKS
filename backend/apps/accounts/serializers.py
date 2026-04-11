from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from apps.locations.serializers import FavouriteLocationSerializer
from .models import Profile, User
from .services import verify_google_credential


class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = ["name", "preference_mode", "max_walking_distance", "can_drive", "notifications_enabled"]


class UserSerializer(serializers.ModelSerializer):
    profile = serializers.SerializerMethodField()
    favourite_locations = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "email", "is_verified", "is_guest", "auth_provider", "first_login_completed", "profile", "favourite_locations"]

    def get_profile(self, obj):
        profile = getattr(obj, "profile", None)
        return ProfileSerializer(profile).data if profile else None

    def get_favourite_locations(self, obj):
        return FavouriteLocationSerializer(obj.favourite_locations.all(), many=True).data


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    confirm_password = serializers.CharField(write_only=True)

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Email already linked with existing account.")
        return value.lower()

    def validate(self, attrs):
        if attrs["password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Not matching password."})
        validate_password(attrs["password"])
        return attrs


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        email = attrs["email"].lower()
        existing_user = User.objects.filter(email__iexact=email).first()

        if existing_user and existing_user.auth_provider != "email":
            raise serializers.ValidationError(
                "This account uses Google sign-in. Please continue with Google."
            )

        user = authenticate(username=email, password=attrs["password"])
        if not user:
            raise serializers.ValidationError("Invalid email or password.")
        if user.auth_provider == "email" and not user.is_verified:
            raise serializers.ValidationError("Please verify your email before logging in.")
        attrs["user"] = user
        return attrs


class OTPVerifySerializer(serializers.Serializer):
    email = serializers.EmailField()
    otp = serializers.CharField(max_length=6)


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ResetPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()
    otp = serializers.CharField(max_length=6)
    new_password = serializers.CharField(write_only=True)
    confirm_new_password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["confirm_new_password"]:
            raise serializers.ValidationError({"confirm_new_password": "Not matching password."})
        validate_password(attrs["new_password"])
        return attrs


class GoogleAuthSerializer(serializers.Serializer):
    credential = serializers.CharField()

    def validate_credential(self, value):
        try:
            payload = verify_google_credential(value)
        except ValueError as error:
            raise serializers.ValidationError(str(error))
        if payload.get("iss") not in {"accounts.google.com", "https://accounts.google.com"}:
            raise serializers.ValidationError("Invalid Google issuer.")
        if not payload.get("email") or not payload.get("email_verified"):
            raise serializers.ValidationError("Google account email is not verified.")
        return {
            "email": payload["email"].lower(),
            "name": payload.get("name") or payload.get("given_name") or "",
            "sub": payload.get("sub"),
        }


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)
    confirm_new_password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["confirm_new_password"]:
            raise serializers.ValidationError({"confirm_new_password": "Not matching password."})
        validate_password(attrs["new_password"])
        return attrs


