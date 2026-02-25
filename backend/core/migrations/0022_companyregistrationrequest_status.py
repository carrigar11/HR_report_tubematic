# Add status to CompanyRegistrationRequest (pending / approved / declined)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0021_emailsmtpconfig_priority'),
    ]

    operations = [
        migrations.AddField(
            model_name='companyregistrationrequest',
            name='status',
            field=models.CharField(
                choices=[('pending', 'Pending'), ('approved', 'Approved'), ('declined', 'Declined')],
                db_index=True,
                default='pending',
                max_length=20,
            ),
        ),
    ]
