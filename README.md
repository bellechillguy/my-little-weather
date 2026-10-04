# My Little Weather ☀

A Bandung weather app built with Python/Flask, HTML, CSS, and JavaScript. A retro personal website with Princess Celestia and Princess Luna themes, English copy, and a few quiet nods to My Little Pony.

## Getting started

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

For a fresh checkout, copy `.env.example` to `.env` and set `OPENWEATHER_API_KEY` to your OpenWeather API key. This workspace already has a configured `.env`; keep it unless you want to replace the key. Git ignores `.env`. The `OPENWEATHER_API_KEY` environment variable takes precedence over the file.

```sh
.venv/bin/python my-little-weather.py
```

Open http://127.0.0.1:5000. To use a different port:

```sh
PORT=5050 .venv/bin/python my-little-weather.py
```

This is a local development server with debug mode disabled. Installation and live weather requests need an internet connection.

## Application flow

1. Flask renders `templates/index.html` and serves the local assets.
2. The browser controller in `static/js/script.js` requests `/api/weather`.
3. The backend reads `OPENWEATHER_API_KEY`, requests Bandung conditions from OpenWeather, and normalizes the response.
4. A process-local cache serves the normalized response for up to 120 seconds.
5. The frontend renders the weather card, station notes, theme, unit conversion, observation age, and daylight marker.

The backend never sends the OpenWeather API key to the browser. When an upstream request fails, the API returns a user-facing error message with an appropriate HTTP status instead of simulated weather data.

## API contract

### `GET /api/weather`

Successful responses contain this normalized schema:

| Field | Description |
| --- | --- |
| `city`, `country` | Fixed location labels for Bandung, Indonesia |
| `temperature`, `feels_like` | Temperatures in Celsius |
| `humidity`, `pressure`, `clouds` | Current measurements from OpenWeather |
| `wind_speed` | Wind speed converted to kilometres per hour |
| `visibility` | Visibility in kilometres, or `null` when unavailable |
| `condition_id`, `description` | OpenWeather condition classification and English description |
| `sunrise`, `sunset`, `observed_at` | Unix timestamps from the upstream response |
| `fetched_at` | Server fetch timestamp |
| `timezone`, `source` | Display metadata |

Error responses use the shape `{ "error": "..." }`. JSON responses are marked `no-store` by the Flask response hook.

## Source guide

- `my-little-weather.py`: configuration, API-key resolution, upstream request handling, normalization, caching, and HTTP headers.
- `templates/index.html`: semantic page structure and Jinja macros for local icons.
- `static/css/style.css`: design tokens, component styles, responsive breakpoints, and the final alignment section.
- `static/js/script.js`: browser state, API rendering, theme/unit controls, freshness labels, and daylight calculations.
- `tests/test_weather.py`: Flask route, normalization, error handling, and local-asset checks.
- `tests/test_frontend.cjs`: isolated frontend behavior tests using a mocked DOM and network layer.

## Features

- Current OpenWeather conditions for `Bandung,ID`, with English descriptions and metric units.
- Temperature, feels-like temperature, humidity, wind speed, cloud cover, pressure, visibility, sunrise, and sunset.
- Celsius/Fahrenheit switching without extra API requests.
- Manual Celestia/Luna themes or automatic switching at sunrise and sunset. Before weather data is available, daytime runs from 06:00 to 18:00 in Bandung.
- Native radio options for Celestia, Luna, and Auto. Observation age updates every minute; exact observation time remains available. The daylight marker tracks Bandung’s sunrise and sunset independently of the chosen theme.
- Theme and unit preferences saved in the browser.
- An English date and a local clock in Western Indonesia Time (WIB, UTC+7). Automatic updates every 5 minutes while the tab is visible; a 2-minute server cache.
- A Cloudsdale field log, data-driven station notes and greeting, and activity notes based on current observations (not a forecast).
- Clear loading, timeout, invalid-key, request-limit, connection, and stale-data states. No simulated weather is served by the application.
- Responsive layouts, keyboard navigation, an accessible dialog, screen-reader status messages.

## Project structure

- `my-little-weather.py`: Flask page and `/api/weather` endpoint. The API key stays on the server.
- `templates/index.html`: page structure and all original local artwork.
- `static/css/style.css`: palettes, responsive layouts, Creampuff/Montserrat typography, and local SVG weather illustrations.
- `static/js/script.js`: fetching, rendering, themes, units, and clock.
- `tests/test_weather.py`: offline backend contract and failure-handling tests.

```sh
.venv/bin/python -m unittest discover -s tests -v
node tests/test_frontend.cjs
```

## Artwork and sources

All six original assets are used: `logo.png`, `mlp.gif`, `morning.gif`, `night.gif`, `celestia-cutie-mark.svg`, and `luna-cutie-mark.webp`. The morning/night GIF follows the selected theme.

- Weather: [OpenWeather Current Weather](https://openweathermap.org/api/current).
- Interface icons: [Lucide](https://lucide.dev/), stored in `static/icons/lucide/`.
- Pixel weather icons: [Pixelarticons](https://github.com/halfmage/pixelarticons) by Gerrit Halfmann, stored in `static/icons/pixelarticons/`. Source and license details are in `static/icons/README.md`. No icon images are hotlinked.
- [Creampuff](https://fontsme.com/creampuff.font), by Nick Curtis: the original `static/fonts/creampuff.ttf` and compatible webfont `static/fonts/creampuff.woff`. Source and licensing notes are in `static/fonts/README.md`.
- [Montserrat](https://fonts.google.com/specimen/Montserrat) for headings, labels, and body text, through Google Fonts with a sans-serif fallback. Creampuff remains the display font.
- My Little Pony and its characters belong to their respective owners. This is an unofficial fan project, not affiliated with Hasbro.

## Troubleshooting

- **Invalid API key:** check your OpenWeather account and `.env`. New keys may not be active yet.
- **Certificate error:** the app uses `/etc/ssl/cert.pem` when Python has no CA bundle of its own. If the connection still fails, repair the Python/OS trust store or set `SSL_CERT_FILE` to a trusted CA bundle for your network. TLS verification stays enabled.
- **Request limit or connection error:** wait, then click **Refresh**. If an update fails, the last successfully loaded data remains visible with a clear label. The displayed observation time comes from OpenWeather, not the download time.
