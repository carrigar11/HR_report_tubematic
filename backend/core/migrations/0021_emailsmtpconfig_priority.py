# Add priority to EmailSmtpConfig for multi-SMTP try order

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0020_company_contact_email_contact_phone_address'),
    ]

    operations = [
        migrations.AddField(
            model_name='emailsmtpconfig',
            name='priority',
            field=models.PositiveIntegerField(default=0, help_text='Try order: lower = first. System tries each active config until send succeeds.'),
        ),
        migrations.AlterModelOptions(
            name='emailsmtpconfig',
            options={'ordering': ['priority', 'id'], 'verbose_name': 'Email SMTP config', 'verbose_name_plural': 'Email SMTP configs'},
        ),
    ]
