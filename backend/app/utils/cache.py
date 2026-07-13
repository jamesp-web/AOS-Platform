"""Simple TTL cache for research results (in-memory + JSON file persistence).

Keyed by normalised company name so a company researched recently is reused
instead of calling Tavily again.
"""
import json
import time
from pathlib import Path
from typing import Any, Dict, Optional


class TTLCache:
    def __init__(self, path: Path, ttl_seconds: float):
        self.path = path
        self.ttl = ttl_seconds
        self._data: Dict[str, Dict[str, Any]] = {}
        self._load()

    def _load(self) -> None:
        try:
            if self.path.exists():
                self._data = json.loads(self.path.read_text())
        except Exception:
            self._data = {}

    def _persist(self) -> None:
        try:
            self.path.write_text(json.dumps(self._data))
        except Exception:
            pass

    def get(self, key: str) -> Optional[Any]:
        entry = self._data.get(key)
        if not entry:
            return None
        if (time.time() - entry.get("fetched_at", 0)) >= self.ttl:
            return None
        return entry.get("value")

    def set(self, key: str, value: Any) -> None:
        self._data[key] = {"value": value, "fetched_at": time.time()}
        self._persist()
