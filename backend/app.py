import os
import sys
import logging
import mimetypes
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

import os.path

from fastapi import FastAPI, Response, status
from fastapi.staticfiles import StaticFiles
from starlette.types import Scope
from starlette.responses import FileResponse


class SPAStaticFiles:
    """Static file server for the React SPA.

    - Serves real files from disk (assets, favicon).
    - For GET/HEAD requests that aren't a real file, falls back to index.html
      so client-side routes (/trades, /stats, ...) work on refresh.
    - Non-GET/HEAD requests fall through so FastAPI handles API routes and 404.
    """
    def __init__(self, directory: str, html: bool = False):
        self._directory = directory
        self._html = html
        self._app = StaticFiles(directory=directory, html=html)

    async def __call__(self, scope: Scope, receive, send):
        if scope["type"] != "http" or scope["method"] not in ("GET", "HEAD"):
            # Let FastAPI handle — don't intercept POST/PUT/DELETE
            return

        path = scope.get("path", "").lstrip("/")
        if path == "":
            return await self._app(scope, receive, send)

        # If a real file exists, serve it; otherwise fall back to index.html
        full = os.path.join(self._directory, path)
        if os.path.isfile(full):
            return await self._app(scope, receive, send)

        index_path = os.path.join(self._directory, "index.html")
        if os.path.isfile(index_path):
            response = FileResponse(index_path)
            return await response(scope, receive, send)

        return await self._app(scope, receive, send)


from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from .logging_config import setup_logging
from . import db

setup_logging()
logger = logging.getLogger(__name__)


def _log_uncaught_exceptions(exc_type, exc_value, exc_traceback):
    if issubclass(exc_type, KeyboardInterrupt):
        sys.__excepthook__(exc_type, exc_value, exc_traceback)
        return
    logging.getLogger("backend").critical(
        "Uncaught exception", exc_info=(exc_type, exc_value, exc_traceback)
    )


sys.excepthook = _log_uncaught_exceptions

mimetypes.add_type('application/javascript', '.js')


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    db.init_db()
    logger.info("Diário de Trader iniciado.")
    yield


def _register_all_routers(app: FastAPI):
    """Register all routers eagerly. Must happen before mounting static files."""
    from .api.router_trades import router as trades_router
    app.include_router(trades_router, prefix="/api")

    from .api.router_journal import router as journal_router
    app.include_router(journal_router, prefix="/api")

    from .api.router_stats import router as stats_router
    app.include_router(stats_router)

    from .api.router_import import router as import_router
    app.include_router(import_router, prefix="/api")

    from .api.router_strategies import router as strategies_router
    app.include_router(strategies_router, prefix="/api")

    from .api.router_risk import router as risk_router
    app.include_router(risk_router, prefix="/api")

    from .api.router_accounts import router as accounts_router
    app.include_router(accounts_router)

    from .api.router_options import router as options_router
    app.include_router(options_router)


# ---- App construction (order matters: routes before mount) ----
app = FastAPI(title="Diário de Trader API", lifespan=lifespan)

app.add_middleware(GZipMiddleware, minimum_size=1000)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.get('/api/health', include_in_schema=False)
async def health_check():
    return {"status": "ok"}


@app.get('/favicon.ico', include_in_schema=False)
async def favicon():
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Register routers BEFORE mounting static files (critical: mount at "/" catches all)
_register_all_routers(app)

# Mount frontend static files last (built React app) — only GET/HEAD
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'frontend', 'dist')
if os.path.exists(frontend_dir):
    app.mount("/", SPAStaticFiles(directory=frontend_dir, html=True), name="frontend")
else:
    logger.info("frontend/dist não encontrado — rodando apenas API (use 'npm run build' no frontend).")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
