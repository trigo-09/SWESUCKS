import logging

from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from rest_framework.authtoken.models import Token

from apps.accounts.models import User

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Delete guest users and their tokens that are older than a given number of hours (default 24)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--hours",
            type=int,
            default=24,
            help="Delete guest accounts older than this many hours (default: 24).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print how many records would be deleted without actually deleting.",
        )

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(hours=options["hours"])
        guests = User.objects.filter(is_guest=True, date_joined__lt=cutoff)
        count = guests.count()

        if options["dry_run"]:
            self.stdout.write(f"[dry-run] Would delete {count} guest account(s) older than {options['hours']}h.")
            return

        # Tokens cascade on User delete, but explicitly cleaning up first is safer
        Token.objects.filter(user__in=guests).delete()
        deleted, _ = guests.delete()
        logger.info("cleanup_guests deleted %d guest accounts (cutoff=%s)", deleted, cutoff)
        self.stdout.write(self.style.SUCCESS(f"Deleted {deleted} guest account(s)."))
