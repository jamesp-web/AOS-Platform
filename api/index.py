"""Vercel serverless entrypoint for the ALIP FastAPI backend.

Vercel's @vercel/python runtime serves this module's ASGI ``app``. The backend
package lives in ../backend, added to sys.path here and bundled into the function
via vercel.json (builds[].config.includeFiles = "backend/**").
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.main import app  # noqa: E402  — ASGI app; Vercel serves it directly
