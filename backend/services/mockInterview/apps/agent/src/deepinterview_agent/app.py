"""FastAPI application factory for the DeepInterview agent API.

Exposes a health check plus the prep and score routers. ``main()`` runs the app
under uvicorn on the configured port.
"""

from __future__ import annotations

from fastapi import Depends, FastAPI

from .api import coach as coach_api
from .api import kb as kb_api
from .api import prep as prep_api
from .api import score as score_api
from .api import session as session_api
from .api import traces as traces_api
from .api.auth import require_internal_secret
from .core.config import get_settings
from .core.observability import init_observability


def create_app() -> FastAPI:
    # Sync Settings (.env + env) into the tracer + Sentry/Langfuse once per
    # process. Idempotent; a no-op for hosted providers without keys, while
    # local JSONL tracing works out of the box (TRACE_ENABLED=0 disables).
    init_observability(get_settings())

    app = FastAPI(title="DeepInterview Agent API")

    @app.get("/health")
    async def health() -> dict[str, bool]:
        return {"ok": True}

    # Write/compute routers are gated by the optional internal secret (a no-op
    # unless INTERNAL_API_SECRET is set). The session router is included WITHOUT
    # the gate because it also serves the capability-guarded GET read path; its
    # live-result write carries the dependency on the route itself.
    guarded = [Depends(require_internal_secret)]
    app.include_router(prep_api.router, dependencies=guarded)
    app.include_router(score_api.router, dependencies=guarded)
    app.include_router(coach_api.router, dependencies=guarded)
    app.include_router(kb_api.router, dependencies=guarded)
    app.include_router(session_api.router)
    # Trace viewer (read-only): list + detail over the local JSONL trace store.
    # Unguarded like the session GET — trace files hold lengths/metadata, and
    # prompt text only when TRACE_INCLUDE_PROMPTS=1.
    app.include_router(traces_api.router)
    return app


app = create_app()


def main() -> None:
    import uvicorn

    settings = get_settings()
    uvicorn.run(app, host="0.0.0.0", port=settings.agent_api_port)


if __name__ == "__main__":
    main()
