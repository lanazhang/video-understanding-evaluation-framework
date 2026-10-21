"""Provider-neutral errors, so callers don't depend on a particular HTTP client."""


class ProviderError(Exception):
    pass


class ConnectionFailed(ProviderError):
    """The endpoint could not be reached (tunnel down, server stopped, timeout, gateway error)."""


class RequestRejected(ProviderError):
    """The endpoint answered but refused the request (bad input, over the length limit, model error)."""
