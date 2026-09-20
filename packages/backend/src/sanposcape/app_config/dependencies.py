from fastapi import Request

from sanposcape.core.feature_flags import FeatureFlags


def get_feature_flags(request: Request) -> FeatureFlags:
    """App-lifespan singleton; router tests can override this dependency directly.

    `maps/dependencies.py` の `get_google_maps_provider()` と同じ形（`app.state` から
    取り出すだけ）。実体は `main.py` の `_lifespan` で `app.state.feature_flags` に積む。
    """
    return request.app.state.feature_flags
