"""Register every model in this app with the Django admin using the default
admin class. The try/except skips any model another module has already
registered.
"""

from django.apps import apps
from django.contrib import admin
from django.contrib.admin.sites import AlreadyRegistered

for model in apps.get_app_config("crew_manage").get_models():
    try:
        admin.site.register(model)
    except AlreadyRegistered:
        pass
