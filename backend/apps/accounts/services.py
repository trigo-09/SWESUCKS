import logging
import secrets
import threading

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from rest_framework.authtoken.models import Token

from .models import OTPToken, Profile, User

logger = logging.getLogger(__name__)


def generate_otp():
    return f"{secrets.randbelow(1_000_000):06d}"


def ensure_profile(user):
    profile, _ = Profile.objects.get_or_create(user=user)
    return profile


def _send_otp_email(email, subject, message):
    """Fire-and-forget email sender on a background thread."""
    def _send():
        try:
            send_mail(subject=subject, message=message, from_email=settings.DEFAULT_FROM_EMAIL, recipient_list=[email], fail_silently=False)
            logger.info("OTP email sent to %s", email)
        except Exception:
            logger.exception("Failed to send OTP email to %s", email)

    threading.Thread(target=_send, daemon=True).start()


def issue_otp(user, purpose):
    OTPToken.objects.filter(user=user, purpose=purpose, consumed_at__isnull=True).update(consumed_at=timezone.now())
    token = OTPToken.objects.create(user=user, purpose=purpose, code=generate_otp(), expires_at=OTPToken.build_expiry())
    logger.info("OTP issued for user=%s purpose=%s", user.email, purpose)
    _send_otp_email(
        user.email,
        subject=f"GO-LAH {purpose.title()} OTP",
        message=f"Your OTP is {token.code}. It expires in 10 minutes.",
    )
    return token


@transaction.atomic
def create_email_user(email, password):
    user = User.objects.create_user(email=email.lower(), password=password, username=email.lower(), auth_provider="email")
    _ = ensure_profile(user)
    logger.info("New email user created: %s", email)
    verification = issue_otp(user, "verify")
    return user, verification


@transaction.atomic
def create_or_login_google_user(email, name="", google_id=None):
    if google_id:
        user = User.objects.filter(google_id=google_id).first()
        if user:
            update_fields = []
            if name and not user.first_name:
                user.first_name = name
                update_fields.append("first_name")
            if update_fields:
                user.save(update_fields=update_fields)
            ensure_profile(user)
            token, _ = Token.objects.get_or_create(user=user)
            logger.info("Google login via google_id for user=%s", user.email)
            return (user, token.key), False, None

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

    update_fields = ["is_verified", "auth_provider"]
    user.is_verified = True
    user.auth_provider = "google"
    if name and not user.first_name:
        user.first_name = name
        update_fields.append("first_name")
    # Persist google_id on email-match so future logins hit the fast google_id path
    if google_id and not user.google_id:
        user.google_id = google_id
        update_fields.append("google_id")
    user.save(update_fields=update_fields)
    ensure_profile(user)
    token, _ = Token.objects.get_or_create(user=user)
    logger.info("Google %s for user=%s", "signup" if created else "login", user.email)
    return (user, token.key), created, None


def verify_google_credential(credential):
    try:
        payload = google_id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
        )
        logger.debug("Google credential verified for sub=%s", payload.get("sub"))
        return payload
    except Exception as error:
        logger.warning("Google credential verification failed: %s", error)
        raise ValueError("Invalid Google credential.") from error
