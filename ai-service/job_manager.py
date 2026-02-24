"""
Job queue manager for async frame interpolation.

Handles job creation, persistent folder storage, and a background worker
thread that processes jobs sequentially using the RIFE model.
"""

import base64
import io
import json
import math
import os
import queue
import threading
import time
import uuid
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path
from typing import Optional

from PIL import Image


class JobStatus(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


JOBS_DIR = Path(__file__).parent / "jobs"


@dataclass
class Job:
    id: str
    status: JobStatus
    num_frames: int
    scale: int
    created_at: float
    completed_at: Optional[float] = None
    error: Optional[str] = None
    output_count: int = 0
    flow_scale: float = 1.0

    def to_dict(self) -> dict:
        d = asdict(self)
        d["status"] = self.status.value
        return d

    @staticmethod
    def from_dict(d: dict) -> "Job":
        d = dict(d)
        d["status"] = JobStatus(d["status"])
        return Job(**{k: v for k, v in d.items() if k in Job.__dataclass_fields__})


def _job_dir(job_id: str) -> Path:
    return JOBS_DIR / job_id


def _save_job_meta(job: Job) -> None:
    path = _job_dir(job.id) / "job.json"
    path.write_text(json.dumps(job.to_dict(), indent=2))


def _load_job_meta(job_id: str) -> Optional[Job]:
    path = _job_dir(job_id) / "job.json"
    if not path.exists():
        return None
    return Job.from_dict(json.loads(path.read_text()))


def _decode_b64_image(b64: str) -> Image.Image:
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(b64)))


def _encode_image_b64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


# ---------------------------------------------------------------------------
# In-memory queue + worker
# ---------------------------------------------------------------------------

_work_queue: queue.Queue[str] = queue.Queue()
_worker_thread: Optional[threading.Thread] = None


def _worker_loop() -> None:
    """Background thread that processes jobs one at a time."""
    from interpolate import interpolate_frames  # deferred to avoid import at module level

    while True:
        job_id = _work_queue.get()
        job = _load_job_meta(job_id)
        if job is None:
            _work_queue.task_done()
            continue

        job.status = JobStatus.PROCESSING
        _save_job_meta(job)

        try:
            jdir = _job_dir(job_id)
            img_start = Image.open(jdir / "input" / "frame_start.png")
            img_end = Image.open(jdir / "input" / "frame_end.png")

            frames = interpolate_frames(
                img_start, img_end,
                num_frames=job.num_frames,
                scale=job.scale,
                flow_scale=job.flow_scale,
            )

            out_dir = jdir / "output"
            out_dir.mkdir(exist_ok=True)
            for i, frame in enumerate(frames):
                frame.save(out_dir / f"frame_{i + 1:03d}.png")

            job.status = JobStatus.COMPLETED
            job.completed_at = time.time()
            job.output_count = len(frames)
            _save_job_meta(job)

        except Exception as e:
            job.status = JobStatus.FAILED
            job.completed_at = time.time()
            job.error = str(e)
            _save_job_meta(job)

        finally:
            _work_queue.task_done()


def start_worker() -> None:
    """Start the background worker thread (idempotent)."""
    global _worker_thread
    if _worker_thread is not None and _worker_thread.is_alive():
        return
    _worker_thread = threading.Thread(target=_worker_loop, daemon=True)
    _worker_thread.start()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def create_job(
    frame_start_b64: str,
    frame_end_b64: str,
    num_frames: int,
    scale: int = 4,
    flow_scale: float = 1.0,
) -> Job:
    """Create a new interpolation job, save inputs to disk, and enqueue."""
    job_id = uuid.uuid4().hex[:12]
    jdir = _job_dir(job_id)
    (jdir / "input").mkdir(parents=True, exist_ok=True)
    (jdir / "output").mkdir(parents=True, exist_ok=True)

    img_start = _decode_b64_image(frame_start_b64)
    img_end = _decode_b64_image(frame_end_b64)
    img_start.save(jdir / "input" / "frame_start.png")
    img_end.save(jdir / "input" / "frame_end.png")

    job = Job(
        id=job_id,
        status=JobStatus.QUEUED,
        num_frames=num_frames,
        scale=scale,
        created_at=time.time(),
        flow_scale=flow_scale,
    )
    _save_job_meta(job)
    _work_queue.put(job_id)
    return job


def get_job(job_id: str) -> Optional[Job]:
    """Load a job's metadata from disk."""
    return _load_job_meta(job_id)


def get_job_output_b64(job_id: str) -> list[str]:
    """Return base64-encoded output frames for a completed job."""
    out_dir = _job_dir(job_id) / "output"
    if not out_dir.exists():
        return []
    files = sorted(out_dir.glob("frame_*.png"))
    results = []
    for f in files:
        results.append(base64.b64encode(f.read_bytes()).decode("ascii"))
    return results


def list_jobs(
    status: Optional[str] = None,
    page: int = 1,
    per_page: int = 20,
) -> dict:
    """List jobs with optional status filter and pagination."""
    JOBS_DIR.mkdir(parents=True, exist_ok=True)
    all_jobs: list[Job] = []

    for d in JOBS_DIR.iterdir():
        if not d.is_dir():
            continue
        meta = d / "job.json"
        if not meta.exists():
            continue
        try:
            job = Job.from_dict(json.loads(meta.read_text()))
            if status and job.status.value != status:
                continue
            all_jobs.append(job)
        except Exception:
            continue

    # Sort: queued/processing first (by created_at asc), then completed (by completed_at desc)
    def sort_key(j: Job):
        if j.status in (JobStatus.QUEUED, JobStatus.PROCESSING):
            return (0, j.created_at)
        return (1, -(j.completed_at or 0))

    all_jobs.sort(key=sort_key)

    total = len(all_jobs)
    total_pages = max(1, math.ceil(total / per_page))
    start = (page - 1) * per_page
    page_jobs = all_jobs[start : start + per_page]

    return {
        "jobs": [j.to_dict() for j in page_jobs],
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": total_pages,
    }


def get_dashboard(
    queued_page: int = 1,
    completed_page: int = 1,
    errors_page: int = 1,
    per_page: int = 20,
) -> dict:
    """Return all job categories in a single disk scan."""
    JOBS_DIR.mkdir(parents=True, exist_ok=True)

    buckets: dict[str, list[Job]] = {
        "queued": [],
        "processing": [],
        "completed": [],
        "failed": [],
    }

    for d in JOBS_DIR.iterdir():
        if not d.is_dir():
            continue
        meta = d / "job.json"
        if not meta.exists():
            continue
        try:
            job = Job.from_dict(json.loads(meta.read_text()))
            buckets.setdefault(job.status.value, []).append(job)
        except Exception:
            continue

    def _paginate(jobs: list[Job], page: int) -> dict:
        total = len(jobs)
        total_pages = max(1, math.ceil(total / per_page))
        start = (page - 1) * per_page
        return {
            "jobs": [j.to_dict() for j in jobs[start : start + per_page]],
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
        }

    queue_jobs = buckets["processing"] + buckets["queued"]
    queue_jobs.sort(key=lambda j: j.created_at)

    buckets["completed"].sort(key=lambda j: -(j.completed_at or 0))
    buckets["failed"].sort(key=lambda j: -(j.completed_at or 0))

    return {
        "queued": _paginate(queue_jobs, queued_page),
        "completed": _paginate(buckets["completed"], completed_page),
        "errors": _paginate(buckets["failed"], errors_page),
    }


def delete_job(job_id: str) -> bool:
    """Delete a job and its directory from disk. Returns True if deleted."""
    jdir = _job_dir(job_id)
    if not jdir.exists():
        return False
    import shutil
    shutil.rmtree(jdir, ignore_errors=True)
    return True


def cleanup_old_completed(max_age_seconds: float = 3600) -> int:
    """Remove completed jobs older than *max_age_seconds*. Failed jobs are kept."""
    JOBS_DIR.mkdir(parents=True, exist_ok=True)
    now = time.time()
    removed = 0

    for d in list(JOBS_DIR.iterdir()):
        if not d.is_dir():
            continue
        meta = d / "job.json"
        if not meta.exists():
            continue
        try:
            job = Job.from_dict(json.loads(meta.read_text()))
        except Exception:
            continue

        if job.status != JobStatus.COMPLETED:
            continue
        finished = job.completed_at or job.created_at
        if now - finished > max_age_seconds:
            import shutil
            shutil.rmtree(d, ignore_errors=True)
            removed += 1

    return removed


def job_input_path(job_id: str, filename: str) -> Optional[Path]:
    p = _job_dir(job_id) / "input" / filename
    return p if p.exists() else None


def job_output_path(job_id: str, filename: str) -> Optional[Path]:
    p = _job_dir(job_id) / "output" / filename
    return p if p.exists() else None
