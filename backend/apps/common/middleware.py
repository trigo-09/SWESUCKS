import uuid

from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class SearchRateThrottle(AnonRateThrottle):
    """Throttle for location search/autocomplete endpoints — higher limit to support keystroke-level queries."""
    scope = "search"


class RouteRateThrottle(UserRateThrottle):
    """Throttle for route preview and recommendation endpoints — moderate limit per authenticated user."""
    scope = "route"


class RequestIdMiddleware:
    """
    Attaches a unique X-Request-ID to every request and response.
    Reads the header from the client if provided, otherwise generates one.
    Attach to settings.MIDDLEWARE after CorsMiddleware.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        request.request_id = request_id
        response = self.get_response(request)
        response["X-Request-ID"] = request_id
        return response
