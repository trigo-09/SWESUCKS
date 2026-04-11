import uuid
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class User(AbstractUser):
    username = models.CharField(max_length=20, blank=True,unique=False)
    email = models.EmailField(unique=True)
    google_id = models.CharField(max_length=255, blank=True, null=True)
    is_verified = models.BooleanField(default=False)
    is_guest = models.BooleanField(default=False)
    auth_provider = models.CharField(max_length=20, default="email")
    first_login_completed = models.BooleanField(default=False)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    def save(self, *args, **kwargs):
        if not self.username:
            self.username = self.email
        super().save(*args, **kwargs)


class Profile(models.Model):
    PREFERENCE_CHOICES = [("cost", "Cost Priority"), ("time", "Time Priority")]
    WALKING_DISTANCE_CHOICES = [
        ("200", "Less than 200m"),
        ("500", "Less than 500m"),
        ("1000", "Less than 1km"),
        ("2000", "Less than 2km"),
    ]

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    name = models.CharField(max_length=120, blank=True)
    preference_mode = models.CharField(max_length=10, choices=PREFERENCE_CHOICES, default="cost")
    max_walking_distance = models.CharField(max_length=10, choices=WALKING_DISTANCE_CHOICES, default="500")
    can_drive = models.BooleanField(default=True)
    notifications_enabled = models.BooleanField(default=True)


class OTPToken(models.Model):
    PURPOSE_CHOICES = [("verify", "Verify Email"), ("reset", "Reset Password")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="otp_tokens")
    purpose = models.CharField(max_length=10, choices=PURPOSE_CHOICES)
    code = models.CharField(max_length=6)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    attempts = models.PositiveSmallIntegerField(default=0)

    class Meta:
        indexes = [
            models.Index(fields=["user", "purpose", "consumed_at"], name="otp_lookup_idx"),
        ]

    @property
    def is_valid(self):
        from django.conf import settings as django_settings
        max_attempts = getattr(django_settings, "OTP_MAX_ATTEMPTS", 5)
        return (
            self.consumed_at is None
            and timezone.now() < self.expires_at
            and self.attempts < max_attempts
        )

    @classmethod
    def build_expiry(cls):
        return timezone.now() + timedelta(minutes=10)


