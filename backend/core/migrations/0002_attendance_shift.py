# Generated manually for shift columns

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='attendance',
            name='shift',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='attendance',
            name='shift_from',
            field=models.TimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='attendance',
            name='shift_to',
            field=models.TimeField(blank=True, null=True),
        ),
    ]
