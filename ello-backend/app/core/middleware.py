class AddDefaultOriginMiddleware:
    """ASGI middleware that ensures a websocket scope has an Origin header.

    Some websocket clients (non-browser) omit the Origin header. Starlette's
    CORSMiddleware may reject websocket connections when Origin is missing.
    This middleware injects a default Origin header of 'null' for websocket
    connections that don't provide one, allowing CORSMiddleware to evaluate
    and (in permissive config) accept the handshake.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        # Only operate on websocket connections
        if scope.get("type") == "websocket":
            headers = scope.get("headers", [])
            # header keys are lowercase bytes
            has_origin = any(h[0] == b"origin" for h in headers)
            if not has_origin:
                # add a default origin header
                headers = list(headers) + [(b"origin", b"null")]
                scope["headers"] = headers
        return await self.app(scope, receive, send)
