"""My Little Weather — backend service for Bandung weather observations.

Provides two main endpoints:
  - GET /            : Serves the single-page retro weather dashboard.
  - GET /api/weather : Returns normalized, sanitized OpenWeather data for Bandung,
                       cached in-memory for 120 seconds to coalesce concurrent requests
                       and protect upstream rate limits.
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path
import socket
import ssl
import threading
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from flask import Flask, Response, jsonify, render_template

app = Flask(__name__)

# Application-wide paths and cache configuration.
BASE_DIR = Path(__file__).resolve().parent
CACHE_SECONDS = 120

# The cache is process-local and protected because Flask may serve concurrent requests.
_cache: dict[str, Any] | None = None
_cache_until: float = 0.0
_cache_lock = threading.Lock()


def api_key() -> str:
    """Resolve the OpenWeather API key.

    Environment variables take precedence over the local .env file.
    Returns an empty string if no key is configured.
    """
    if "OPENWEATHER_API_KEY" in os.environ:
        return os.environ["OPENWEATHER_API_KEY"].strip()

    env_file = BASE_DIR / ".env"
    if env_file.is_file():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            key, separator, value = line.strip().partition("=")
            if separator and key.strip() == "OPENWEATHER_API_KEY":
                return value.strip().strip("\"'")

    return ""


def normalize_weather(data: dict[str, Any]) -> dict[str, Any]:
    """Transform raw OpenWeather payload into a lean, frontend-safe schema.

    - Validates that measurements are finite numbers.
    - Converts wind speed from m/s to km/h.
    - Strips internal upstream keys and sensitive account data.
    """
    main = data["main"]
    condition = data["weather"][0]
    sun = data["sys"]

    def number(value: Any) -> float | int:
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError("Invalid weather measurement")
        return value

    return {
        "city": "Bandung",
        "country": "Indonesia",
        "temperature": number(main["temp"]),
        "feels_like": number(main["feels_like"]),
        "humidity": number(main["humidity"]),
        "pressure": number(main["pressure"]),
        "wind_speed": round(number(data["wind"]["speed"]) * 3.6, 1),
        "clouds": number(data["clouds"]["all"]),
        "visibility": number(data["visibility"]) / 1000 if "visibility" in data else None,
        "condition_id": number(condition["id"]),
        "description": str(condition["description"]),
        "sunrise": number(sun["sunrise"]),
        "sunset": number(sun["sunset"]),
        "observed_at": number(data["dt"]),
        "fetched_at": int(time.time()),
        "timezone": "Asia/Jakarta",
        "source": "OpenWeather",
    }


def failure(message: str, status: int) -> tuple[Response, int]:
    """Return a uniform JSON error payload with the given HTTP status code."""
    return jsonify({"error": message}), status


@app.get("/")
def index() -> str:
    """Render the primary single-page weather dashboard."""
    return render_template("index.html")


@app.get("/api/weather")
def weather() -> Response | tuple[Response, int]:
    """Fetch and return Bandung weather conditions, with in-memory caching."""
    global _cache, _cache_until

    key = api_key()
    if not key:
        return failure("No API key is configured. Set OPENWEATHER_API_KEY in .env and try again.", 503)

    with _cache_lock:
        # Reuse a fresh response to avoid unnecessary upstream requests.
        if _cache is not None and time.monotonic() < _cache_until:
            return jsonify(_cache)

        query = urlencode({
            "q": "Bandung,ID",
            "appid": key,
            "units": "metric",
            "lang": "en",
        })
        upstream = Request(
            "https://api.openweathermap.org/data/2.5/weather?" + query,
            headers={"User-Agent": "MyLittleWeather/1.0"},
        )

        try:
            # Use the macOS system CA bundle when Python has no configured CA file.
            system_ca = Path("/etc/ssl/cert.pem")
            use_system_ca = (
                not ssl.get_default_verify_paths().cafile
                and not os.environ.get("SSL_CERT_FILE")
                and system_ca.is_file()
            )
            context = ssl.create_default_context(cafile=str(system_ca) if use_system_ca else None)

            with urlopen(upstream, timeout=10, context=context) as response:
                result = normalize_weather(json.load(response))

        except HTTPError as error:
            if error.code in (401, 403):
                return failure(
                    "The OpenWeather API key is inactive or invalid. Check OPENWEATHER_API_KEY in .env.",
                    502,
                )
            if error.code == 429:
                return failure(
                    "The weather request limit has been reached. Wait a few minutes and try again.",
                    503,
                )
            return failure("OpenWeather is currently unavailable. Please try again shortly.", 502)

        except (URLError, TimeoutError, socket.timeout, ssl.SSLError) as error:
            reason = getattr(error, "reason", error)
            if isinstance(reason, ssl.SSLCertVerificationError):
                return failure(
                    "A secure connection to OpenWeather could not be established. "
                    "Check the server’s Python certificates or SSL_CERT_FILE setting.",
                    502,
                )
            return failure(
                "Could not connect to OpenWeather. Check your internet connection and try again.",
                503,
            )

        except (ValueError, KeyError, IndexError, TypeError):
            return failure(
                "OpenWeather returned incomplete data. Please refresh to try again shortly.",
                502,
            )

        _cache = result
        _cache_until = time.monotonic() + CACHE_SECONDS
        return jsonify(result)


@app.after_request
def response_headers(response: Response) -> Response:
    """Set baseline security and caching headers on all outgoing responses."""
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if response.content_type.startswith("application/json"):
        response.headers["Cache-Control"] = "no-store"
    return response


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="127.0.0.1", port=port, debug=False, load_dotenv=False)
