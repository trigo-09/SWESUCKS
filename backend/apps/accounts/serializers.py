from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from apps.locations.services import is_in_singapore
from .models import FavouriteLocation, Profile, RecommendationHistory, User


class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = ["name", "preference_mode", "max_walking_distance", "notifications_enabled"]


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
        user = authenticate(username=attrs["email"].lower(), password=attrs["password"])
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


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)
    confirm_new_password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["confirm_new_password"]:
            raise serializers.ValidationError({"confirm_new_password": "Not matching password."})
        validate_password(attrs["new_password"])
        return attrs


class FavouriteLocationSerializer(serializers.ModelSerializer):
    def validate(self, attrs):
        if not is_in_singapore(attrs["latitude"], attrs["longitude"]):
            raise serializers.ValidationError("Invalid Address, try again")
        return attrs

    class Meta:
        model = FavouriteLocation
        fields = ["id","user" ,"name", "address", "latitude", "longitude", "created_at", "updated_at"]
        read_only_fields = ["user", "created_at", "updated_at"]


class RecommendationHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = RecommendationHistory
        fields = ["id", "origin_label", "origin_latitude", "origin_longitude", "destinations", "recommendation_payload", "created_at"]
