# Django admin is intentionally not installed for this service - it has no
# end-user auth model (see documents.authentication.ServiceKeyAuthentication),
# only service clients. Manage ServiceClient rows via the
# `seed_service_client` management command or the Django shell.
