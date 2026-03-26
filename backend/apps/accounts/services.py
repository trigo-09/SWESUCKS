import random

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from rest_framework.authtoken.models import Token

from .models import OTPToken, Profile, User


def generate_otp():
    return f"{random.randint(0, 999999):06d}"


def ensure_profile(user):
    profile, _ = Profile.objects.get_or_create(user=user)
    return profile


def issue_otp(user, purpose):
    OTPToken.objects.filter(user=user, purpose=purpose, consumed_at__isnull=True).update(consumed_at=timezone.now())
    token = OTPToken.objects.create(user=user, purpose=purpose, code=generate_otp(), expires_at=OTPToken.build_expiry())
    send_mail(
        subject=f"GO-LAH {purpose.title()} OTP",
        message=f"Your OTP is {token.code}. It expires in 10 minutes.",
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )
    return token


@transaction.atomic
def create_email_user(email, password):
    user = User.objects.create_user(email=email.lower(), password=password, username=email.lower(), auth_provider="email")
    ensure_profile(user)
    verification = issue_otp(user, "verify")
    return user, verification


@transaction.atomic
def create_or_login_google_user(email, name=""):
    user, created = User.objects.get_or_create(
        email=email.lower(),
        defaults={
            "username": email.lower(),
            "auth_provider": "google",
            "is_verified": True,
            "first_name": name,
        },
    )
    if not created and user.auth_provider != "google":
        return None, False, "Email already linked with existing account."
    user.is_verified = True
    if name and not user.first_name:
        user.first_name = name
    user.auth_provider = "google"
    user.save()
    ensure_profile(user)
    token, _ = Token.objects.get_or_create(user=user)
    return (user, token.key), created, None


def verify_google_credential(credential):
    try:
        payload = google_id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
        )
    except Exception as error:
        raise ValueError("Invalid Google credential.") from error

    if payload.get("iss") not in {"accounts.google.com", "https://accounts.google.com"}:
        raise ValueError("Invalid Google issuer.")
    if not payload.get("email") or not payload.get("email_verified"):
        raise ValueError("Google account email is not verified.")

    return {
        "email": payload["email"].lower(),
        "name": payload.get("name") or payload.get("given_name") or "",
        "sub": payload.get("sub"),
    }
