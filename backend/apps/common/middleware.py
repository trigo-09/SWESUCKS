import uuid


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
