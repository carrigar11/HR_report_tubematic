# Data migration: insert default SMTP config from [sendmail] for push email

from django.db import migrations


def insert_smtp_config(apps, schema_editor):
    EmailSmtpConfig = apps.get_model('core', 'EmailSmtpConfig')
    if not EmailSmtpConfig.objects.exists():
        EmailSmtpConfig.objects.create(
            smtp_server='smtp.gmail.com',
            smtp_port=587,
            error_logfile='error.log',
            debug_logfile='debug.log',
            auth_username='otpsender191@gmail.com',
            auth_password='euwd ghss ahwy rblq',
            force_sender='otpsender191@gmail.com',
            is_active=True,
        )


def remove_smtp_config(apps, schema_editor):
    EmailSmtpConfig = apps.get_model('core', 'EmailSmtpConfig')
    EmailSmtpConfig.objects.filter(
        auth_username='otpsender191@gmail.com',
        smtp_server='smtp.gmail.com',
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0011_add_email_smtp_config'),
    ]

    operations = [
        migrations.RunPython(insert_smtp_config, remove_smtp_config),
    ]
