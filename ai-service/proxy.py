"""
Transparent proxy that forwards all AI service API requests to a remote
GPU-equipped machine running the AI service in GPU mode.
"""

import httpx
from fastapi import APIRouter, Request, Response

router = APIRouter()

_remote_url: str = ""
_client: httpx.AsyncClient | None = None


def configure(remote_url: str) -> None:
    global _remote_url
    _remote_url = remote_url.rstrip("/")


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=120.0)
    return _client


async def _forward(method: str, path: str, request: Request) -> Response:
    """Forward an HTTP request to the remote AI service."""
    if not _remote_url:
        return Response(
            content='{"error":"AI_REMOTE_URL not configured. Set this environment variable to the URL of a GPU machine running the AI service."}',
            status_code=503,
            media_type="application/json",
        )

    url = f"{_remote_url}{path}"
    qs = str(request.url.query)
    if qs:
        url = f"{url}?{qs}"

    headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in ("host", "content-length", "transfer-encoding")
    }

    body = await request.body()

    client = _get_client()
    resp = await client.request(
        method,
        url,
        headers=headers,
        content=body if body else None,
    )

    excluded = {"content-encoding", "content-length", "transfer-encoding"}
    resp_headers = {
        k: v for k, v in resp.headers.items()
        if k.lower() not in excluded
    }

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        headers=resp_headers,
        media_type=resp.headers.get("content-type"),
    )


@router.api_route("/health", methods=["GET"])
async def proxy_health(request: Request):
    if not _remote_url:
        return Response(
            content='{"status":"ok","mode":"proxy","remote_configured":false}',
            status_code=200,
            media_type="application/json",
        )
    return await _forward("GET", "/health", request)


@router.api_route("/heartbeat", methods=["GET"])
async def proxy_heartbeat(request: Request):
    return await _forward("GET", "/heartbeat", request)


@router.api_route("/dashboard", methods=["GET"])
async def proxy_dashboard(request: Request):
    resp = await _forward("GET", "/dashboard", request)
    if resp.status_code == 200 and resp.media_type and "json" in resp.media_type:
        import json as _json
        try:
            body = _json.loads(resp.body)
            body["mode"] = "proxy"
            body["remote_configured"] = bool(_remote_url)
            return Response(
                content=_json.dumps(body),
                status_code=200,
                media_type="application/json",
            )
        except Exception:
            pass
    return resp


@router.api_route("/jobs", methods=["GET", "POST"])
async def proxy_jobs(request: Request):
    return await _forward(request.method, "/jobs", request)


@router.api_route("/jobs/{job_id}", methods=["GET"])
async def proxy_job_detail(job_id: str, request: Request):
    return await _forward("GET", f"/jobs/{job_id}", request)


@router.api_route("/jobs/{job_id}", methods=["DELETE"])
async def proxy_job_delete(job_id: str, request: Request):
    return await _forward("DELETE", f"/jobs/{job_id}", request)


@router.api_route("/jobs/{job_id}/input/{filename}", methods=["GET"])
async def proxy_job_input(job_id: str, filename: str, request: Request):
    return await _forward("GET", f"/jobs/{job_id}/input/{filename}", request)


@router.api_route("/jobs/{job_id}/output/{filename}", methods=["GET"])
async def proxy_job_output(job_id: str, filename: str, request: Request):
    return await _forward("GET", f"/jobs/{job_id}/output/{filename}", request)


@router.api_route("/interpolate", methods=["POST"])
async def proxy_interpolate(request: Request):
    """Legacy sync endpoint forwarding."""
    return await _forward("POST", "/interpolate", request)
