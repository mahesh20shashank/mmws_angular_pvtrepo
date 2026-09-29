from django.conf import settings


class SecurityHeadersMiddleware:
    """Apply lightweight response hardening for API and admin surfaces."""

    AUTH_SENSITIVE_PREFIXES = (
        "/admin/",
        "/api/v1/user/token/",
        "/api/v1/user/token/refresh/",
    )

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        self._set_default_headers(response)
        self._set_cache_headers(request, response)
        return response

    def _set_default_headers(self, response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", settings.SECURE_REFERRER_POLICY)
        response.headers.setdefault(
            "Cross-Origin-Opener-Policy",
            settings.SECURE_CROSS_ORIGIN_OPENER_POLICY,
        )
        response.headers.setdefault(
            "Cross-Origin-Resource-Policy",
            settings.SECURE_CROSS_ORIGIN_RESOURCE_POLICY,
        )
        response.headers.setdefault("Permissions-Policy", settings.PERMISSIONS_POLICY)
        response.headers.setdefault("X-Permitted-Cross-Domain-Policies", "none")

        if self._is_html_response(response):
            response.headers.setdefault(
                "Content-Security-Policy",
                settings.CONTENT_SECURITY_POLICY,
            )

    def _set_cache_headers(self, request, response):
        if response.has_header("Cache-Control"):
            return

        if request.path.startswith(self.AUTH_SENSITIVE_PREFIXES):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"

    @staticmethod
    def _is_html_response(response):
        content_type = response.headers.get("Content-Type", "")
        return content_type.startswith("text/html")
