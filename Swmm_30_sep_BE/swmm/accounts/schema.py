"""drf-spectacular schema extension for the accounts app.

``FleetJWTScheme`` teaches drf-spectacular that this app's
``FleetJWTAuthentication`` is bearer-JWT auth. drf-spectacular's bundled
``SimpleJWTScheme`` only matches the exact
``rest_framework_simplejwt.authentication.JWTAuthentication`` class (it sets no
``match_subclasses``), so without this every view that relies on the default
authenticator (``DEFAULT_AUTHENTICATION_CLASSES`` -> our subclass) is emitted
with **no** ``security`` block and Swagger UI treats it as public.

Registered from ``AccountsConfig.ready()``. The users app registers an
equivalent extension for ``users.authentication.FleetJWTAuthentication``;
whichever class ``DEFAULT_AUTHENTICATION_CLASSES`` actually names is the one
drf-spectacular looks up.
"""

from drf_spectacular.contrib.rest_framework_simplejwt import SimpleJWTScheme


class FleetJWTScheme(SimpleJWTScheme):
    target_class = "accounts.authentication.FleetJWTAuthentication"
    name = "jwtAuth"
