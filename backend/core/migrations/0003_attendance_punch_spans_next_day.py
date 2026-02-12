# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_attendance_shift'),
    ]

    operations = [
        migrations.AddField(
            model_name='attendance',
            name='punch_spans_next_day',
            field=models.BooleanField(default=False, help_text='True when punch_out is next day (e.g. night shift)'),
        ),
    ]
