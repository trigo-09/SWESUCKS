from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0004_remove_recommendationhistory_user_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="profile",
            name="can_drive",
            field=models.BooleanField(default=True),
        ),
    ]
