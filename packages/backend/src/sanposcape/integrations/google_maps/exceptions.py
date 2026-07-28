class GoogleMapsError(Exception):
    """Base class for sanitized Google Maps integration failures."""


class GoogleMapsQuotaError(GoogleMapsError):
    pass


class GoogleMapsUnavailableError(GoogleMapsError):
    pass
