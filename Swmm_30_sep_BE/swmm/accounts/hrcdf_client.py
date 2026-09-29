# Developed with Understanding: the only code in swmm that talks HTTP to HRCDF for the
# roster (AR4 approved). The transport logic is carried from IIMA's HrcdfClient as it is
# (R1 G1 steps 1 to 5, G2 "CARRY AS IS") - configuration from settings.HRCDF_SYNC, error
# mapping, the optional token step, the page or startIndex switch, the envelope unwrap and
# the five stop rules. It runs in the Celery worker, never calls a sibling service, and
# every message it raises names the host and never a credential.
"""HTTP client for the HRCDF personnel roster, used by accounts.hrcdf_sync."""

import logging
from urllib.parse import urlsplit

import requests
# Developed with Understanding: settings.HRCDF_API_URL for the single-person lookup (CP-K).
from django.conf import settings

logger = logging.getLogger(__name__)

LINE_INFO = "info"

# Developed with Understanding: the login-time single-person read never holds a request
# longer than this (D27).
PERSON_LOOKUP_TIMEOUT_SECONDS = 5

# Developed with Understanding: IIMA cut every HRCDF text value at 255 characters, the
# widest HRCDF column it had. The engine passes the real column width instead.
MAX_TEXT_LENGTH = 255


# Developed with Understanding: a failure the operator should read as it is, carrying the
# HTTP status the view answers with (IIMA HrcdfSyncError, sync lines 231-238). Anything
# that is not one of these is a genuine bug and is logged with its traceback.
class HrcdfSyncError(Exception):
    """An expected HRCDF sync refusal with the HTTP status to answer with."""

    def __init__(self, http_status, message):
        super().__init__(message)
        self.http_status = http_status
        self.message = message


# Developed with Understanding: IIMA _as_text (sync lines 348-361) - None and blank become
# None, everything else a stripped string cut to max_length, and the cut is logged.
def as_text(value, max_length=MAX_TEXT_LENGTH):
    """Return value as stripped text cut to max_length, or None when blank."""
    if value is None:
        return None
    text = str(value).strip()
    if text == "":
        return None
    if max_length and len(text) > max_length:
        logger.warning("HRCDF value cut to %d characters: %r", max_length, text[:40])
        text = text[:max_length]
    return text


# Developed with Understanding: IIMA _response_info_message (sync lines 364-374), so a
# refusal from HRCDF reaches the operator in HRCDF's own words.
def _response_info_message(body):
    """Join every responseInfo.userMessage in an HRCDF body."""
    info = body.get("responseInfo") if isinstance(body, dict) else None
    if not isinstance(info, list):
        return ""
    messages = [
        str(item.get("userMessage"))
        for item in info
        if isinstance(item, dict) and item.get("userMessage")
    ]
    return " ".join(messages)


# Developed with Understanding: IIMA HrcdfClient (sync lines 377-566) with two additions.
# path lets the same client read HRCDF_SYNC UNITS_PATH for Get Ship Names (OQ7), and
# unit_filter is the home unit code an own-ship run sends under UNIT_FILTER_PARAM when that
# setting is not empty. repeat_key names the field stop rule 2 compares between pages.
class HrcdfClient:
    """Reads one paged HRCDF list endpoint configured by settings.HRCDF_SYNC."""

    def __init__(
        self, config, path=None, unit_filter=None, repeat_key="personnelNumber"
    ):
        self.base_url = (config.get("BASE_URL") or "").strip().rstrip("/")
        self.users_path = path or config.get("USERS_PATH") or "/api/users"
        self.auth_path = (config.get("AUTH_TOKEN_PATH") or "").strip()
        self.auth_username = (config.get("AUTH_USERNAME") or "").strip()
        self.auth_password = config.get("AUTH_PASSWORD") or ""
        self.auth_token_key = config.get("AUTH_TOKEN_KEY") or "token"
        self.auth_header_scheme = config.get("AUTH_HEADER_SCHEME") or "Bearer"
        self.page_param = config.get("PAGE_PARAM") or "page"
        self.page_size_param = config.get("PAGE_SIZE_PARAM") or "pageSize"
        self.page_size = int(config.get("PAGE_SIZE") or 500)
        self.max_pages = int(config.get("MAX_PAGES") or 1000)
        self.timeout = int(config.get("TIMEOUT_SECONDS") or 60)
        self.verify_tls = bool(config.get("VERIFY_TLS", True))
        self.extra_query = dict(config.get("EXTRA_QUERY") or {})
        self.unit_filter_param = (config.get("UNIT_FILTER_PARAM") or "").strip()
        self.unit_filter = (unit_filter or "").strip()
        self.repeat_key = repeat_key
        self.host = urlsplit(self.base_url).netloc if self.base_url else ""
        self.pages_fetched = 0
        # Developed with Understanding: the roster size from the first page that carries
        # pagination. It turns the progress bar from indeterminate into a percentage.
        self.total_records = None
        self.session = requests.Session()
        self.session.headers.update({"Accept": "application/json"})
        self.session.headers.update(dict(config.get("EXTRA_HEADERS") or {}))

    # Developed with Understanding: refuses cleanly where BASE_URL was never set, which is
    # every machine outside the NCN (IIMA sync lines 407-421).
    def ensure_configured(self):
        """Raise HrcdfSyncError 400 unless BASE_URL is an http(s) host address."""
        if not self.base_url:
            raise HrcdfSyncError(
                400,
                "HRCDF sync is not configured on this server. Set the "
                "HRCDF_SYNC_BASE_URL environment variable of the swmm service to the "
                "address of the HRCDF virtual machine.",
            )
        parts = urlsplit(self.base_url)
        if parts.scheme not in ("http", "https") or not parts.netloc:
            raise HrcdfSyncError(
                400,
                "HRCDF_SYNC_BASE_URL must be an http or https address with a host and "
                "port, for example http://host:port, with no trailing slash.",
            )

    # Developed with Understanding: the one place every requests failure becomes an
    # operator message (IIMA sync lines 423-442) - Timeout 504, TLS 502, connection 502.
    def _request(self, method, url, **kwargs):
        """Send one request and map transport failures to HrcdfSyncError."""
        try:
            return self.session.request(
                method, url, timeout=self.timeout, verify=self.verify_tls, **kwargs
            )
        except requests.exceptions.Timeout as exc:
            raise HrcdfSyncError(
                504,
                f"HRCDF at {self.host} did not answer within {self.timeout} seconds.",
            ) from exc
        except requests.exceptions.SSLError as exc:
            raise HrcdfSyncError(
                502,
                f"TLS verification failed talking to HRCDF at {self.host}. Set "
                "HRCDF_SYNC_VERIFY_TLS to False only if the certificate cannot be "
                "installed.",
            ) from exc
        except requests.exceptions.ConnectionError as exc:
            raise HrcdfSyncError(
                502,
                f"Could not connect to HRCDF at {self.host}. Check the address, the "
                "port and that this server can reach the HRCDF virtual machine.",
            ) from exc
        except requests.exceptions.RequestException as exc:
            raise HrcdfSyncError(
                502,
                f"HRCDF request failed at {self.host}: {exc.__class__.__name__}.",
            ) from exc

    # Developed with Understanding: optional token step, skipped when AUTH_USERNAME or
    # AUTH_TOKEN_PATH is empty (IIMA sync lines 444-468).
    def authenticate(self):
        """Fetch a token and set the Authorization header, when configured."""
        if not self.auth_path or not self.auth_username:
            return
        response = self._request(
            "POST",
            self.base_url + self.auth_path,
            json={"username": self.auth_username, "password": self.auth_password},
        )
        if response.status_code != 200:
            raise HrcdfSyncError(
                502, f"HRCDF token endpoint returned HTTP {response.status_code}."
            )
        try:
            body = response.json()
        except ValueError as exc:
            raise HrcdfSyncError(
                502, "HRCDF token endpoint returned a body that is not JSON."
            ) from exc
        token = None
        if isinstance(body, dict):
            token = body.get(self.auth_token_key)
            if not token and isinstance(body.get("data"), dict):
                token = body["data"].get(self.auth_token_key)
        if not token:
            raise HrcdfSyncError(
                502,
                f'HRCDF token response carries no "{self.auth_token_key}" key. Set '
                "HRCDF_SYNC_AUTH_TOKEN_KEY to the key HRCDF actually uses.",
            )
        self.session.headers["Authorization"] = (
            f"{self.auth_header_scheme} {token}"
        ).strip()

    # Developed with Understanding: one GET of one page (IIMA sync lines 470-492). A
    # startIndex parameter carries the record offset, any other name the 1-based page.
    def fetch_page(self, page_number):
        """Return the parsed JSON body of one page."""
        params = dict(self.extra_query)
        if self.page_param == "startIndex":
            params[self.page_param] = (page_number - 1) * self.page_size
        else:
            params[self.page_param] = page_number
        params[self.page_size_param] = self.page_size
        # Developed with Understanding: the swmm addition - an own-ship run narrows the
        # roster to the home unit when HRCDF offers a unit filter parameter.
        if self.unit_filter_param and self.unit_filter:
            params[self.unit_filter_param] = self.unit_filter
        response = self._request("GET", self.base_url + self.users_path, params=params)
        if response.status_code != 200:
            raise HrcdfSyncError(
                502,
                f"HRCDF list endpoint returned HTTP {response.status_code} for page "
                f"{page_number}.",
            )
        try:
            return response.json()
        except ValueError as exc:
            raise HrcdfSyncError(
                502,
                "HRCDF list endpoint returned a body that is not JSON for page "
                f"{page_number}.",
            ) from exc

    # Developed with Understanding: IIMA unwrap (sync lines 494-520) - accepts the observed
    # envelope, a bare list and a data object holding one record. A status other than
    # Success is a refusal reported in HRCDF's words.
    @staticmethod
    def unwrap(body):
        """Return (records, total_count) for one HRCDF response body."""
        if isinstance(body, list):
            return body, None
        if not isinstance(body, dict):
            raise HrcdfSyncError(
                502, "HRCDF response is neither a JSON object nor a JSON list."
            )
        status_value = body.get("status")
        if status_value is not None and str(status_value).strip().lower() != "success":
            raise HrcdfSyncError(
                502,
                (
                    f'HRCDF reported status "{status_value}". '
                    f"{_response_info_message(body)}"
                ).strip(),
            )
        data = body.get("data")
        if isinstance(data, dict):
            data = [data]
        if not isinstance(data, list):
            raise HrcdfSyncError(502, 'HRCDF response carries no "data" list.')
        total = None
        pagination = body.get("pagination")
        if (
            isinstance(pagination, dict)
            and pagination.get("totalRecordCount") is not None
        ):
            try:
                total = int(pagination.get("totalRecordCount"))
            except (TypeError, ValueError):
                total = None
        return data, total

    # Developed with Understanding: yields every record across every page and stops on the
    # five IIMA rules (sync lines 522-566) - (1) an empty page, (2) a page repeating the
    # previous page's first record, (3) the running count reaching totalRecordCount, (4) a
    # short page, (5) MAX_PAGES. emit, when given, receives one line per page.
    def iter_records(self, emit=None):
        """Yield every record of the configured list endpoint."""
        page = 1
        fetched = 0
        previous_first_key = None
        self.pages_fetched = 0
        while True:
            records, total = self.unwrap(self.fetch_page(page))
            self.pages_fetched += 1
            if total is not None and self.total_records is None:
                self.total_records = total
            if emit is not None:
                reported = ""
                if total is not None:
                    reported = f" HRCDF reports {total} record(s) in all."
                emit(
                    LINE_INFO,
                    f"Page {page} fetched: {len(records)} record(s).{reported}",
                )
            if not records:
                break
            first = records[0]
            first_key = None
            if isinstance(first, dict):
                first_key = as_text(first.get(self.repeat_key))
            if page > 1 and first_key is not None and first_key == previous_first_key:
                logger.warning(
                    "HRCDF page %d repeats page %d. Paging is not honoured by the "
                    "endpoint, stopping.",
                    page,
                    page - 1,
                )
                break
            previous_first_key = first_key
            for record in records:
                fetched += 1
                yield record
            if total is not None and fetched >= total:
                break
            if len(records) < self.page_size:
                break
            if self.pages_fetched >= self.max_pages:
                logger.warning(
                    "HRCDF sync stopped at MAX_PAGES=%d with %d records fetched.",
                    self.max_pages,
                    fetched,
                )
                break
            page += 1

    # Developed with Understanding: releases the pooled HTTP connections once a run ends.
    def close(self):
        """Close the underlying requests session."""
        self.session.close()


# Developed with Understanding: the HRCDF single-person read used at login (CP-K, D26 step 4,
# D27, AR4). Same request as userauth accounts/serializers.py _fetch_hrcdf_details -
# settings.HRCDF_API_URL with the query personnels=<number> - with a 5 second timeout and
# the roster client's unwrap. Best effort: every failure is logged with the host and the
# exception class only (never the number or a credential) and answered with None.
def fetch_person(personal_number, timeout=PERSON_LOOKUP_TIMEOUT_SECONDS):
    """Return the first HRCDF record for personal_number, or None. Never raises."""
    url = (getattr(settings, "HRCDF_API_URL", "") or "").strip()
    number = str(personal_number or "").strip()
    if not url or not number:
        return None
    # Developed with Understanding: user:password@ is cut from the host in every message.
    host = urlsplit(url).netloc.rpartition("@")[2]
    try:
        response = requests.get(
            url,
            params={"personnels": number},
            timeout=timeout,
            headers={"Accept": "application/json"},
        )
        if response.status_code != 200:
            logger.warning(
                "HRCDF person lookup at %s returned HTTP %d", host, response.status_code
            )
            return None
        records, _total = HrcdfClient.unwrap(response.json())
    except Exception as exc:
        logger.warning(
            "HRCDF person lookup at %s failed: %s", host, exc.__class__.__name__
        )
        return None
    first = records[0] if records else None
    return first if isinstance(first, dict) else None
