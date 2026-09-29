# Generated manually for Event.status field

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('activity_planner', '0002_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='event',
            name='status',
            field=models.CharField(
                choices=[
                    ('scheduled', 'Scheduled'),
                    ('active', 'Active'),
                    ('delayed', 'Delayed'),
                    ('conflict', 'Conflict'),
                    ('completed', 'Completed'),
                    ('cancelled', 'Cancelled'),
                ],
                default='scheduled',
                max_length=20,
            ),
        ),
    ]
