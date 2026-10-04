'use strict';

/**
 * My Little Weather — Frontend Controller
 *
 * Coordinates:
 * - Dynamic Celestia (day) / Luna (night) / Auto theme switching.
 * - Celsius / Fahrenheit temperature conversions.
 * - Live Western Indonesia Time (WIB) clock and daylight tracking.
 * - Periodic weather polling, in-memory freshness tracking, and offline states.
 */
(() => {
  // DOM & Storage Utilities
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;

  const stored = (key, fallback) => {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  };

  const save = (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Preferences remain in-memory if storage is restricted or disabled.
    }
  };

  // State Management
  const modes = ['auto', 'day', 'night'];
  let mode = stored('mlw-theme', 'auto');
  if (!modes.includes(mode)) mode = 'auto';

  let unit = stored('mlw-unit', 'c') === 'f' ? 'f' : 'c';
  let weather = null;
  let loading = false;
  let failed = false;

  // Regional Formatters (Western Indonesia Time / Asia/Jakarta)
  const timeFormat = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  const clockFormat = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const dateFormat = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const dayFormat = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const decimal = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

  const bandungHour = () => Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date())
  );

  const timeText = (unix) => timeFormat.format(new Date(unix * 1000)).replace('.', ':');

  const hasTodaySun = () =>
    weather &&
    dayFormat.format(new Date(weather.sunrise * 1000)) === dayFormat.format(new Date());

  // Theme & Sky Keeper Management
  function setTheme() {
    let isDay = bandungHour() >= 6 && bandungHour() < 18;
    if (hasTodaySun()) {
      const now = Date.now() / 1000;
      isDay = now >= weather.sunrise && now < weather.sunset;
    }

    const theme = mode === 'auto' ? (isDay ? 'day' : 'night') : mode;
    root.dataset.theme = theme;
    renderWeatherIcon(isDay);

    document.querySelector('meta[name="theme-color"]').content =
      theme === 'day' ? '#fbe995' : '#000000';

    document.querySelectorAll('[data-mode]').forEach((input) => {
      input.checked = input.dataset.mode === mode;
    });

    $('theme-note').textContent = mode === 'auto'
      ? (hasTodaySun() ? 'Theme follows Bandung’s daylight.' : 'Theme follows local time: 06:00–18:00.')
      : (mode === 'day' ? 'Celestia theme is active.' : 'Luna theme is active.');
  }

  function renderWeatherIcon(isDay) {
    const sky = weather ? skyNotes(weather.condition_id)[0] : 'clouds';

    const files = {
      clear: isDay ? 'sun' : 'moon',
      clouds: weather && weather.condition_id === 804 ? 'cloud' : `cloud-${isDay ? 'sun' : 'moon'}`,
      rain: weather && weather.condition_id < 400 ? 'cloud-drizzle' : 'cloud-rain',
      storm: 'cloud-storm',
      snow: 'snowflake',
      mist: 'fog',
    };

    const file = files[sky];
    const folder = ['cloud-drizzle', 'cloud-rain', 'cloud-storm', 'fog'].includes(file) ? 'weather' : 'pixelarticons';
    $('weather-image').src = `/static/icons/${folder}/${file}.svg`;
  }

  // Temperature & Unit Conversion
  function renderTemperatures() {
    const convert = (value) => Math.round(unit === 'c' ? value : value * 9 / 5 + 32);

    $('degree').textContent = unit === 'c' ? '°C' : '°F';
    document.querySelectorAll('[data-unit]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.unit === unit));
    });

    if (!weather) return;

    $('temperature').textContent = convert(weather.temperature);
    $('feels-like').textContent = `${convert(weather.feels_like)} °${unit.toUpperCase()}`;
    renderStationNotes();
  }

  // Weather Condition Classification
  function skyNotes(id) {
    if (id < 300) return ['storm', 'Thunder on the report.'];
    if (id < 600) return ['rain', 'Rain duty.'];
    if (id < 700) return ['snow', 'Snow on the report.'];
    if (id < 800) return ['mist', 'A hazy view from the station.'];
    if (id === 800) return ['clear', 'Cloud crew off duty.'];
    return ['clouds', 'Cloud crew on duty.'];
  }

  // Station Journal & Daily Pony Business
  function renderStationNotes() {
    if (!weather) return;

    const [sky, title] = skyNotes(weather.condition_id);
    const temperature = `${Math.round(unit === 'c' ? weather.temperature : weather.temperature * 9 / 5 + 32)}°${unit.toUpperCase()}`;
    const clouds = `${decimal.format(weather.clouds)}%`;
    const wind = `${decimal.format(weather.wind_speed)} km/h`;
    const visibility = weather.visibility === null
      ? 'Visibility was not reported.'
      : `Visibility: ${decimal.format(weather.visibility)} km.`;

    const old = failed || Date.now() / 1000 - weather.observed_at >= 1800;
    const hour = bandungHour();
    const daylight = hasTodaySun()
      ? Date.now() / 1000 >= weather.sunrise && Date.now() / 1000 < weather.sunset
      : hour >= 6 && hour < 18;
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const description = weather.description.charAt(0).toUpperCase() + weather.description.slice(1);

    $('station-announcement').textContent = old
      ? `Hello, everypony! Last report: ${temperature}, ${weather.description.toLowerCase()}. Check the observation time below.`
      : `${greeting}, everypony! Bandung is ${temperature} with ${weather.description.toLowerCase()}.`;

    const notes = {
      storm: `${temperature} with thunderstorms reported. Wind: ${wind}. Outdoor plans can wait until the storm passes.`,
      rain: `${description} over Bandung. Umbrella weather ${daylight ? 'today' : 'tonight'}. The laundry can wait.`,
      snow: `${description} at ${temperature}. An unusual report for Bandung; check local conditions before heading out.`,
      mist: `${description} at ${temperature}. ${visibility} Check the view outside before travelling.`,
      clear: `${clouds} cloud cover and ${temperature}. The cloud crew has very little to file.`,
      clouds: `${clouds} cloud cover over Bandung, ${temperature}. ${weather.clouds >= 90 ? 'Rainbow Dash has a full shift today.' : daylight ? 'A few blue gaps slipped through.' : 'Some gaps between the clouds tonight.'}`,
    };

    $('tip-title').textContent = title;
    $('weather-tip').textContent = `${old ? 'From the last available report: ' : ''}${notes[sky]}`;

    const wet = ['rain', 'storm', 'snow'].includes(sky);
    const poorVisibility = sky === 'mist' || (weather.visibility !== null && weather.visibility < 2);

    $('cloud-business').textContent = wet
      ? 'Window seat recommended.'
      : poorVisibility
        ? 'View obscured'
        : !daylight
          ? 'After sunrise'
          : weather.clouds === 0
            ? 'No clouds reported'
            : weather.clouds >= 90
              ? 'One big grey blanket'
              : 'Pretty good, actually';

    $('picnic-business').textContent = wet
      ? (daylight ? 'Not in this weather.' : 'Not tonight.')
      : poorVisibility
        ? 'Check visibility first'
        : weather.wind_speed >= 30
          ? 'Too breezy for a blanket'
          : weather.feels_like >= 32
            ? 'Find a tree'
            : !daylight
              ? 'Bring a light'
              : 'Maybe; check for rain';

    $('laundry-business').textContent = wet
      ? 'Absolutely not.'
      : !daylight
        ? 'Wait for daylight'
        : weather.humidity >= 80
          ? 'Likely slow drying'
          : 'Keep one eye on the sky';

    $('business-note').textContent = old
      ? 'Last available observations. Refresh before making plans.'
      : 'current conditions only · not a forecast';
  }

  // Data Freshness & Observation Time Tracking
  function refreshFreshness() {
    if (!weather) return;

    const ageMinutes = Math.max(0, Math.floor((Date.now() / 1000 - weather.observed_at) / 60));
    const age = ageMinutes < 1
      ? 'just now'
      : ageMinutes < 60
        ? `${ageMinutes} min ago`
        : ageMinutes < 1440
          ? `${Math.floor(ageMinutes / 60)}h${ageMinutes % 60 ? ` ${ageMinutes % 60}m` : ''} ago`
          : `${Math.floor(ageMinutes / 1440)} ${ageMinutes < 2880 ? 'day' : 'days'} ago`;

    const observed = new Date(weather.observed_at * 1000);
    const date = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(observed);

    $('updated-at').textContent = `${failed || ageMinutes >= 30 ? 'Last observed' : 'Observed'} ${age}`;
    $('updated-at').dateTime = observed.toISOString();
    $('updated-at').title = `${date}, ${timeText(weather.observed_at)} WIB`;
    $('journal-byline').textContent = `filed from Bandung · ${date}, ${timeText(weather.observed_at)} WIB`;

    renderStationNotes();

    if (loading || failed) return;

    const old = ageMinutes >= 30;
    $('live-label').hidden = true;
    $('status-message').hidden = !old;
    $('status-message').textContent = old
      ? 'This report is over 30 minutes old. Refresh for newer observations.'
      : '';
  }

  // Sun Path Arc Calculation
  function renderSunPosition() {
    const marker = $('sun-marker');
    if (!hasTodaySun() || weather.sunset <= weather.sunrise) {
      marker.hidden = true;
      marker.title = '';
      marker.dataset.phase = 'unknown';
      $('sun-position').textContent = 'Waiting for today’s daylight times.';
      return;
    }

    const now = Date.now() / 1000;
    const progress = Math.max(0, Math.min(1, (now - weather.sunrise) / (weather.sunset - weather.sunrise)));
    marker.hidden = false;
    marker.dataset.phase = now < weather.sunrise ? 'before-dawn' : now >= weather.sunset ? 'after-sunset' : 'daylight';

    // Position along the upper half of an ellipse from sunrise to sunset
    marker.style.left = `${50 - 50 * Math.cos(Math.PI * progress)}%`;
    marker.style.bottom = `${100 * Math.sin(Math.PI * progress)}%`;
    const onDuty = Math.max(0, Math.floor((now - weather.sunrise) / 60));
    marker.title = marker.dataset.phase === 'daylight'
      ? `Celestia has been on duty for ${Math.floor(onDuty / 60)}h ${onDuty % 60}m`
      : marker.dataset.phase === 'before-dawn' ? 'Celestia is not on duty yet.' : 'Celestia has clocked out.';

    $('sun-position').textContent = now < weather.sunrise
      ? 'Before sunrise'
      : now >= weather.sunset
        ? 'The sun has set'
        : `${Math.round(progress * 100)}% through daylight`;
  }

  // Overall Weather Presentation
  function renderWeather() {
    renderTemperatures();
    $('condition').textContent = weather.description;
    $('humidity').textContent = `${decimal.format(weather.humidity)}%`;
    $('wind').textContent = `${decimal.format(weather.wind_speed)} km/h`;
    $('clouds').textContent = `${decimal.format(weather.clouds)}%`;
    $('visibility').textContent = weather.visibility === null ? 'Not available' : `${decimal.format(weather.visibility)} km`;
    $('pressure').textContent = `${decimal.format(weather.pressure)} hPa`;
    $('sunrise').textContent = timeText(weather.sunrise);
    $('sunset').textContent = timeText(weather.sunset);

    const daylight = Math.max(0, Math.round((weather.sunset - weather.sunrise) / 60));
    $('day-length').textContent = `${Math.floor(daylight / 60)}h ${daylight % 60}m total`;
    $('weather-art').dataset.sky = skyNotes(weather.condition_id)[0];

    renderSunPosition();
    setTheme();
  }

  // Network Fetching Engine
  async function loadWeather() {
    if (loading) return;
    loading = true;

    $('weather').setAttribute('aria-busy', 'true');
    $('refresh').disabled = true;
    $('refresh-label').textContent = 'Loading…';
    $('live-label').hidden = false;
    $('status-message').hidden = false;
    $('live-label').textContent = 'LOADING';
    $('live-label').dataset.state = 'loading';
    $('status-message').classList.remove('is-error');
    $('status-message').textContent = 'Fetching the latest weather from OpenWeather…';

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch('/api/weather', {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });

      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error('The weather server could not send a valid response. Please try again shortly.');
      }

      if (!response.ok) {
        throw new Error(data.error || 'Weather is unavailable. Please refresh to try again.');
      }

      const numericFields = [
        'temperature', 'feels_like', 'humidity', 'pressure',
        'wind_speed', 'clouds', 'condition_id', 'sunrise',
        'sunset', 'observed_at',
      ];
      if (!numericFields.every((field) => Number.isFinite(data[field])) || typeof data.description !== 'string') {
        throw new Error('Some weather data is missing. Please refresh to try again.');
      }

      weather = data;
      failed = false;
      renderWeather();

    } catch (error) {
      failed = true;
      $('live-label').textContent = weather ? 'LAST KNOWN' : 'NOT CONNECTED';
      $('live-label').dataset.state = 'error';

      const message = error.name === 'AbortError'
        ? 'The connection timed out. Please refresh to try again.'
        : error instanceof TypeError
          ? 'The server connection was lost. Check your internet connection and try again.'
          : error.message;

      $('status-message').textContent = `${message}${weather ? ' Showing the last successfully loaded conditions.' : ''}`;
      $('status-message').classList.add('is-error');

      if (weather) renderStationNotes();

      if (!weather) {
        $('station-announcement').textContent = 'Hello, everypony! The weather report is unavailable. Try Refresh below.';
        ['cloud-business', 'picnic-business', 'laundry-business'].forEach((id) => {
          $(id).textContent = 'No current report';
        });
        $('business-note').textContent = 'Waiting for current observations.';
        $('condition').textContent = 'Weather unavailable';
        $('tip-title').textContent = 'A little trouble connecting.';
        $('weather-tip').textContent = 'We couldn’t load the weather just now. You can still choose a theme while you wait, then try Refresh.';
      }

    } finally {
      clearTimeout(timeout);
      loading = false;
      $('weather').setAttribute('aria-busy', 'false');
      $('refresh').disabled = false;
      $('refresh-label').textContent = 'Refresh';
      refreshFreshness();
    }
  }

  // Real-Time Clock
  function tick() {
    const now = new Date();
    $('local-clock').textContent = clockFormat.format(now);
    $('local-clock').dateTime = now.toISOString();
    $('local-date').textContent = dateFormat.format(now);
  }

  // User Interaction & Event Handlers
  document.querySelectorAll('[data-mode]').forEach((input) => {
    input.addEventListener('change', () => {
      mode = input.dataset.mode;
      save('mlw-theme', mode);
      setTheme();
    });
  });

  document.querySelectorAll('[data-unit]').forEach((button) => {
    button.addEventListener('click', () => {
      unit = button.dataset.unit;
      save('mlw-unit', unit);
      renderTemperatures();
    });
  });

  $('refresh').addEventListener('click', loadWeather);

  // About Dialog Modal Controls
  $('about-open').addEventListener('click', () => $('about-dialog').showModal());
  $('about-close').addEventListener('click', () => $('about-dialog').close());
  $('about-dialog').addEventListener('click', (event) => {
    if (event.target !== $('about-dialog')) return;
    const box = $('about-dialog').getBoundingClientRect();
    if (
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    ) {
      $('about-dialog').close();
    }
  });

  // Initialization & Timers
  setTheme();
  renderTemperatures();
  tick();
  loadWeather();

  window.setInterval(tick, 1000);
  window.setInterval(() => {
    setTheme();
    refreshFreshness();
    renderSunPosition();
  }, 60000);
  window.setInterval(() => {
    if (!document.hidden) loadWeather();
  }, 300000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      tick();
      setTheme();
      refreshFreshness();
      renderSunPosition();
      if (!weather || Date.now() / 1000 - weather.fetched_at >= 300) {
        loadWeather();
      }
    }
  });
})();
