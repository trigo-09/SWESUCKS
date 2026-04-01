from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_user_google_id_alter_user_username"),
    ]

    operations = [
        migrations.AddField(
            model_name="otptoken",
            name="attempts",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddIndex(
            model_name="otptoken",
            index=models.Index(fields=["user", "purpose", "consumed_at"], name="otp_lookup_idx"),
        ),
    ]
