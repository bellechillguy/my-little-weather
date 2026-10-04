"""Offline contract tests for My Little Weather backend.

Validates:
- Static asset availability and template rendering.
- OpenWeather API parameter formatting, secret redaction, and response normalization.
- In-memory request caching and expiration behavior.
- Error translation for upstream HTTP errors, connection timeouts, and SSL failures.
- Payload validation for missing or non-finite measurements.
"""

from __future__ import annotations

import copy
import importlib.util
import io
import json
from pathlib import Path
import ssl
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlparse

# Dynamically import my-little-weather.py regardless of file naming convention
app_path = Path(__file__).resolve().parents[1] / "my-little-weather.py"
spec = importlib.util.spec_from_file_location("weather_app", app_path)
weather_app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(weather_app)

FIXTURE = {
    "main": {
        "temp": 27.7,
        "feels_like": 31.23,
        "humidity": 79,
        "pressure": 1016,
    },
    "weather": [
        {"id": 803, "description": "broken clouds"}
    ],
    "wind": {"speed": 2.5},
    "clouds": {"all": 84},
    "visibility": 10000,
    "sys": {
        "sunrise": 1790980405,
        "sunset": 1791024229,
    },
    "dt": 1791030742,
}


class WeatherTests(unittest.TestCase):
    """Test suite verifying backend API contracts and offline safety boundaries."""

    def setUp(self) -> None:
        weather_app.app.config["TESTING"] = True
        weather_app._cache = None
        weather_app._cache_until = 0.0
        self.client = weather_app.app.test_client()

        # Mock api_key to ensure tests never depend on real external secrets
        self.key = patch.object(weather_app, "api_key", return_value="test-secret")
        self.key.start()
        self.addCleanup(self.key.stop)

    def upstream(self, data: dict = FIXTURE):
        """Helper to mock urlopen with JSON fixture data."""
        payload = json.dumps(data).encode("utf-8")
        return patch.object(weather_app, "urlopen", return_value=io.BytesIO(payload))

    def test_page_and_all_local_assets_are_available(self) -> None:
        """Verify homepage renders 200 and all referenced media assets exist."""
        result = self.client.get("/")
        self.assertEqual(result.status_code, 200)
        html = result.get_data(as_text=True)

        for asset in [
            "icons/logo.png",
            "images/mlp.gif",
            "images/morning.gif",
            "images/night.gif",
            "images/celestia-cutie-mark.svg",
            "images/luna-cutie-mark.webp",
        ]:
            self.assertIn(asset, html)
            with self.client.get(f"/static/{asset}") as asset_response:
                self.assertEqual(asset_response.status_code, 200)

        with self.client.get("/static/fonts/creampuff.woff") as font_response:
            self.assertEqual(font_response.status_code, 200)

        self.assertNotIn("test-secret", html)
        self.assertEqual(self.client.get("/.env").status_code, 404)

    def test_success_units_language_tls_and_secret_boundary(self) -> None:
        """Verify successful normalization, metric conversion, and TLS enforcement."""
        with self.upstream() as upstream:
            response = self.client.get("/api/weather")

        self.assertEqual(response.status_code, 200)
        data = response.get_json()

        self.assertEqual(data["temperature"], 27.7)
        self.assertEqual(data["wind_speed"], 9)  # 2.5 m/s * 3.6 = 9.0 km/h
        self.assertEqual(data["visibility"], 10)  # 10,000 m / 1,000 = 10 km
        self.assertEqual(data["observed_at"], FIXTURE["dt"])
        self.assertNotIn("test-secret", response.get_data(as_text=True))

        args, kwargs = upstream.call_args
        query = parse_qs(urlparse(args[0].full_url).query)
        self.assertEqual(query["q"], ["Bandung,ID"])
        self.assertEqual(query["units"], ["metric"])
        self.assertEqual(query["lang"], ["en"])
        self.assertTrue(kwargs["context"].check_hostname)
        self.assertEqual(kwargs["context"].verify_mode, ssl.CERT_REQUIRED)
        self.assertEqual(response.headers["Cache-Control"], "no-store")

    def test_cache_expires_and_coalesces_requests(self) -> None:
        """Verify in-memory cache coalesces concurrent requests and expires as expected."""
        with patch.object(weather_app.time, "monotonic", return_value=100.0):
            with self.upstream() as upstream:
                self.client.get("/api/weather")
                self.client.get("/api/weather")
                self.assertEqual(upstream.call_count, 1)

        with patch.object(weather_app.time, "monotonic", return_value=221.0):
            with self.upstream() as upstream:
                self.client.get("/api/weather")
                self.assertEqual(upstream.call_count, 1)

    def test_missing_key_does_not_call_upstream(self) -> None:
        """Verify requests fail gracefully when no OpenWeather API key is configured."""
        with patch.object(weather_app, "api_key", return_value=""), patch.object(weather_app, "urlopen") as upstream:
            self.assertEqual(self.client.get("/api/weather").status_code, 503)
            upstream.assert_not_called()

    def test_provider_errors_are_actionable_and_redacted(self) -> None:
        """Verify upstream HTTP error codes map to actionable messages without leaking credentials."""
        for code, expected in [(401, 502), (403, 502), (429, 503), (500, 502)]:
            with self.subTest(code=code):
                error = HTTPError("https://example.invalid/?appid=test-secret", code, "test-secret", {}, None)
                with patch.object(weather_app, "urlopen", side_effect=error):
                    response = self.client.get("/api/weather")
                self.assertEqual(response.status_code, expected)
                self.assertIn("error", response.get_json())
                self.assertNotIn("test-secret", response.get_data(as_text=True))

    def test_network_timeout_and_certificate_errors(self) -> None:
        """Verify network errors and SSL verification failures return proper error codes."""
        for error, status in [
            (TimeoutError(), 503),
            (URLError("offline"), 503),
            (URLError(ssl.SSLCertVerificationError("untrusted")), 502),
        ]:
            with self.subTest(error=type(error).__name__):
                with patch.object(weather_app, "urlopen", side_effect=error):
                    response = self.client.get("/api/weather")
                self.assertEqual(response.status_code, status)
                self.assertIn("error", response.get_json())

    def test_bad_payload_does_not_poison_cache(self) -> None:
        """Verify malformed upstream responses do not overwrite or poison the cache."""
        with self.upstream({"weather": []}):
            self.assertEqual(self.client.get("/api/weather").status_code, 502)
        self.assertIsNone(weather_app._cache)

        with self.upstream():
            self.assertEqual(self.client.get("/api/weather").status_code, 200)

    def test_nonfinite_measurement_rejected(self) -> None:
        """Verify NaN and non-finite numbers from upstream are rejected."""
        data = copy.deepcopy(FIXTURE)
        data["main"]["temp"] = float("nan")
        with self.upstream(data):
            self.assertEqual(self.client.get("/api/weather").status_code, 502)

    def test_optional_visibility_stays_unknown(self) -> None:
        """Verify missing visibility field is handled cleanly as None."""
        data = copy.deepcopy(FIXTURE)
        del data["visibility"]
        with self.upstream(data):
            self.assertIsNone(self.client.get("/api/weather").get_json()["visibility"])


if __name__ == "__main__":
    unittest.main()
