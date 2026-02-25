# Add contact and address fields to Company

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0019_admin_is_system_owner_companyregistrationrequest'),
    ]

    operations = [
        migrations.AddField(
            model_name='company',
            name='contact_email',
            field=models.EmailField(blank=True, max_length=254),
        ),
        migrations.AddField(
            model_name='company',
            name='contact_phone',
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name='company',
            name='address',
            field=models.TextField(blank=True),
        ),
    ]
