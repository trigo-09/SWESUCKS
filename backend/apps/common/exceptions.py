import logging

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    """
    Unified error envelope for all API responses:
      { "error": true, "detail": "...", "code": "...", "errors": {...} }

    - detail: human-readable summary
    - code: machine-readable slug (e.g. "validation_error", "not_found")
    - errors: field-level breakdown for validation failures
    """
    response = drf_exception_handler(exc, context)

    if response is None:
        logger.exception(
            "Unhandled exception in %s",
            context.get("view").__class__.__name__ if context.get("view") else "unknown",
            exc_info=exc,
        )
        return Response(
            {"error": True, "detail": "An unexpected error occurred.", "code": "server_error"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    data = response.data
    detail = ""
    errors = {}
    code = getattr(exc, "default_code", "error")

    if isinstance(data, dict):
        if "detail" in data:
            detail = str(data["detail"])
            code = getattr(data["detail"], "code", code)
        else:
            # Validation errors — flatten field messages into detail
            errors = {field: [str(e) for e in errs] if isinstance(errs, list) else [str(errs)] for field, errs in data.items()}
            detail = "; ".join(
                f"{field}: {errs[0]}" for field, errs in errors.items()
            )
            code = "validation_error"
    elif isinstance(data, list):
        detail = "; ".join(str(e) for e in data)
        code = "validation_error"

    response.data = {"error": True, "detail": detail, "code": code}
    if errors:
        response.data["errors"] = errors

    return response
