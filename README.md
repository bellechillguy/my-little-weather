# My Little Weather

<img width="735" height="726" alt="Image" src="https://github.com/user-attachments/assets/d73c6bec-65f8-4da3-87cd-53857888cf53" />
<img width="735" height="726" alt="Image" src="https://github.com/user-attachments/assets/756ceee1-6e04-4fcb-96f3-7d22198790fc" />

My Little Weather is a small Flask weather app for Bandung, Indonesia. It uses OpenWeather data and wraps it in a retro My Little Pony inspired interface with separate Celestia and Luna themes.

The project uses Python and Flask on the backend, with plain HTML, CSS, and JavaScript on the frontend. The OpenWeather API key stays on the server and is never exposed to the browser.

## Getting started

Create a virtual environment and install the dependencies:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

For a fresh checkout, copy `.env.example` to `.env` and add your OpenWeather API key:

```env
OPENWEATHER_API_KEY=your_api_key_here
```

This workspace already has a configured `.env`, so you can keep it unless you want to use another key. Git ignores `.env`. If `OPENWEATHER_API_KEY` is also set as an environment variable, that value takes priority over the file.

Run the app:

```sh
.venv/bin/python my-little-weather.py
```

Then open:

```text
http://127.0.0.1:5000
```

To use another port:

```sh
PORT=5050 .venv/bin/python my-little-weather.py
```

The app runs as a local development server with Flask debug mode disabled. You need an internet connection during installation and when requesting live weather data.

## How it works

1. Flask renders `templates/index.html` and serves the local assets.
2. `static/js/script.js` requests `/api/weather` from the backend.
3. The backend reads `OPENWEATHER_API_KEY`, fetches the current Bandung weather from OpenWeather, and normalizes the response.
4. The normalized response is cached in memory for up to 120 seconds.
5. The frontend updates the weather card, station notes, theme, unit controls, observation age, and daylight marker.

If OpenWeather returns an error, the backend sends a clear error response with the matching HTTP status. The app does not generate fake weather data as a fallback.

## Features

- Current weather for `Bandung,ID` from OpenWeather.
- Temperature, feels-like temperature, humidity, wind speed, cloud cover, pressure, visibility, sunrise, and sunset.
- Celsius and Fahrenheit switching without another API request.
- Celestia, Luna, and Auto themes.
- Automatic theme switching based on Bandung sunrise and sunset times.
- A 06:00 to 18:00 daytime fallback before weather data is available.
- Theme and unit preferences stored in the browser.
- A local Bandung clock in WIB, or UTC+7, with an English date display.
- Automatic weather refresh every 5 minutes while the tab is visible.
- A 2-minute server-side weather cache.
- A Cloudsdale field log, station notes, greeting text, and activity notes based on current observations.
- Loading, timeout, invalid-key, rate-limit, connection, and stale-data states.
- Responsive layouts, keyboard navigation, an accessible dialog, and screen-reader status messages.

The activity notes describe current conditions only. They are not weather forecasts.

## API

### `GET /api/weather`

A successful request returns normalized JSON in this shape:

| Field | Description |
| --- | --- |
| `city`, `country` | Fixed location labels for Bandung, Indonesia |
| `temperature`, `feels_like` | Temperatures in Celsius |
| `humidity`, `pressure`, `clouds` | Current measurements from OpenWeather |
| `wind_speed` | Wind speed in kilometres per hour |
| `visibility` | Visibility in kilometres, or `null` if unavailable |
| `condition_id`, `description` | OpenWeather condition ID and English description |
| `sunrise`, `sunset`, `observed_at` | Unix timestamps from OpenWeather |
| `fetched_at` | Timestamp for the server fetch |
| `timezone`, `source` | Metadata used by the interface |

Errors use this shape:

```json
{
  "error": "..."
}
```

JSON responses use `no-store` headers.

## Project structure

```text
my-little-weather.py
    Flask app, configuration, API-key handling, weather requests,
    normalization, caching, and response headers

templates/index.html
    Page structure and Jinja macros for local icons

static/css/style.css
    Design tokens, Celestia and Luna palettes, responsive layouts,
    Creampuff and Montserrat typography, and weather illustrations

static/js/script.js
    Weather fetching, rendering, themes, units, local clock,
    freshness labels, and daylight calculations

tests/test_weather.py
    Backend route, normalization, error handling, and local-asset tests

tests/test_frontend.cjs
    Frontend behavior tests with a mocked DOM and network layer
```

## Running the tests

Run the backend tests with:

```sh
.venv/bin/python -m unittest discover -s tests -v
```

Run the frontend tests with:

```sh
node tests/test_frontend.cjs
```

## Artwork, fonts, and third-party sources

The project uses these local assets:

- `logo.png`
- `mlp.gif`
- `morning.gif`
- `night.gif`
- `celestia-cutie-mark.svg`
- `luna-cutie-mark.webp`

The morning and night GIFs follow the selected theme.

External sources used by the project:

- Weather data: [OpenWeather Current Weather](https://openweathermap.org/api/current)
- Interface icons: [Lucide](https://lucide.dev/), stored in `static/icons/lucide/`
- Pixel weather icons: [Pixelarticons](https://github.com/halfmage/pixelarticons) by Gerrit Halfmann, stored in `static/icons/pixelarticons/`
- Display font: [Creampuff](https://fontsme.com/creampuff.font) by Nick Curtis
- UI and body font: [Montserrat](https://fonts.google.com/specimen/Montserrat)

License and source notes for the icon files are in `static/icons/README.md`. Font notes are in `static/fonts/README.md`.

The project keeps the original `static/fonts/creampuff.ttf` and a compatible `static/fonts/creampuff.woff`. Montserrat loads through Google Fonts with a sans-serif fallback.

My Little Pony and its characters belong to their respective owners. This is an unofficial fan project and is not affiliated with Hasbro.

## Troubleshooting

### Invalid API key

Check the key in your OpenWeather account and `.env`. New OpenWeather keys sometimes need a short activation period before they work.

### Certificate error

If Python cannot find its own CA bundle, the app uses `/etc/ssl/cert.pem`. If TLS requests still fail, repair the Python or operating-system trust store, or set `SSL_CERT_FILE` to a trusted CA bundle for your network.

TLS verification remains enabled.

### Request limit or connection error

Wait for the upstream service or connection to recover, then click `Refresh`.

If the refresh fails after weather data has already loaded, the app keeps the last successful result on screen and marks it as stale. The observation time shown in the interface comes from OpenWeather, not from the time the app downloaded the response.
