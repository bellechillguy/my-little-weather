'use strict';

/**
 * Frontend Contract & Presentation Tests
 *
 * Runs `static/js/script.js` in a lightweight Node.js VM sandbox with a mocked
 * DOM and timer environment to verify:
 * - Live copy formatting and weather classification.
 * - Temperature unit conversions (°C <-> °F).
 * - Theme selection and auto-daylight independence.
 * - Network timeouts, error states, and stale report notifications.
 * - Sun arc calculations across different daylight intervals.
 * - Icon asset resolution and local file existence.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('static/js/script.js', 'utf8');
const now = Date.parse('2026-10-04T03:00:00Z');

const baseline = {
  temperature: 27,
  feels_like: 28,
  humidity: 60,
  wind_speed: 5,
  clouds: 100,
  visibility: 10,
  pressure: 1016,
  condition_id: 804,
  description: 'overcast clouds',
  sunrise: now / 1000 - 4 * 3600,
  sunset: now / 1000 + 7 * 3600,
  observed_at: now / 1000,
  fetched_at: now / 1000,
};

/**
 * Spin up an isolated VM page instance with mocked DOM nodes.
 */
async function page(overrides = {}, offline = false) {
  const nodes = new Map();

  const node = (id) => {
    if (!nodes.has(id)) {
      nodes.set(id, {
        textContent: '',
        dataset: {},
        style: {},
        classList: {
          add() {},
          remove() {},
        },
        handlers: {},
        setAttribute(k, v) {
          this[k] = v;
        },
        addEventListener(k, f) {
          this.handlers[k] = f;
        },
      });
    }
    return nodes.get(id);
  };

  const modes = ['day', 'night', 'auto'].map((mode) =>
    Object.assign(node(mode), { dataset: { mode } })
  );
  const units = ['c', 'f'].map((unit) =>
    Object.assign(node(unit), { dataset: { unit } })
  );

  let unavailable = offline;

  class TestDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }
    static now() {
      return now;
    }
  }

  vm.runInNewContext(source, {
    Date: TestDate,
    Intl,
    AbortController,
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
    },
    document: {
      documentElement: node('root'),
      getElementById: node,
      querySelector: () => node('meta'),
      querySelectorAll: (s) => (s === '[data-mode]' ? modes : units),
      addEventListener() {},
      hidden: false,
    },
    window: {
      setTimeout,
      setInterval() {},
    },
    fetch: async () => {
      if (unavailable) throw new TypeError('offline');
      return {
        ok: true,
        json: async () => ({ ...baseline, ...overrides }),
      };
    },
  });

  await new Promise((resolve) => setImmediate(resolve));

  return {
    node,
    offline() {
      unavailable = true;
    },
  };
}

(async () => {
  // 1. Initial page load & overcast sky report
  const cloudy = await page();
  assert.match(cloudy.node('station-announcement').textContent, /27°C.*overcast clouds/);
  assert.match(cloudy.node('weather-tip').textContent, /Rainbow Dash/);
  assert.doesNotMatch(cloudy.node('laundry-business').textContent, /under cover/);

  // 2. Unit conversion from Celsius to Fahrenheit
  cloudy.node('f').handlers.click();
  assert.equal(cloudy.node('temperature').textContent, 81);
  assert.match(cloudy.node('station-announcement').textContent, /81°F/);
  assert.match(cloudy.node('weather-tip').textContent, /81°F/);

  // 3. Manual theme selection (Celestia / Luna) vs. daylight facts
  cloudy.node('night').handlers.change();
  assert.equal(cloudy.node('root').dataset.theme, 'night');
  assert.equal(cloudy.node('cloud-business').textContent, 'One big grey blanket');

  // 4. Stale cache and offline recovery
  cloudy.offline();
  await cloudy.node('refresh').handlers.click();
  assert.match(cloudy.node('station-announcement').textContent, /Last report/);
  assert.match(cloudy.node('business-note').textContent, /Last available/);
  assert.match(cloudy.node('updated-at').textContent, /^Last observed/);
  assert.equal(cloudy.node('night').checked, true);
  assert.equal(cloudy.node('auto').checked, false);

  // 5. Rain condition recommendations
  const rain = await page({ condition_id: 500, description: 'light rain' });
  assert.equal(rain.node('picnic-business').textContent, 'Not in this weather.');
  assert.equal(rain.node('laundry-business').textContent, 'Absolutely not.');

  assert.match(rain.node('weather-tip').textContent, /Umbrella weather today/);
  rain.node('day').handlers.change();
  assert.equal(rain.node('theme-note').textContent, 'Celestia theme is active.');
  const rainyNight = await page({ condition_id: 500, description: 'light rain', sunrise: now / 1000 - 7200, sunset: now / 1000 - 3600 });
  assert.equal(rainyNight.node('picnic-business').textContent, 'Not tonight.');
  assert.match(rainyNight.node('weather-tip').textContent, /Umbrella weather tonight/);

  // 6. Complete network outage from the start
  const missing = await page({}, true);
  assert.match(missing.node('station-announcement').textContent, /unavailable/);
  assert.equal(missing.node('picnic-business').textContent, 'No current report');

  // 7. Stale data warning threshold (over 30 minutes old)
  const stale = await page({ observed_at: now / 1000 - 3600 });
  assert.match(stale.node('weather-tip').textContent, /last available report/);
  assert.equal(stale.node('updated-at').textContent, 'Last observed 1h ago');
  assert.equal(stale.node('status-message').hidden, false);

  // 8. Fresh data relative observation timestamp
  const recent = await page({ observed_at: now / 1000 - 360 });
  assert.equal(recent.node('updated-at').textContent, 'Observed 6 min ago');
  assert.equal(recent.node('updated-at').dateTime, new Date(now - 360000).toISOString());
  assert.equal(recent.node('live-label').hidden, true);
  assert.equal(recent.node('status-message').hidden, true);

  const yesterday = await page({ observed_at: now / 1000 - 86400 });
  assert.equal(yesterday.node('updated-at').textContent, 'Last observed 1 day ago');

  const broken = await page({ condition_id: 803, clouds: 82 });
  assert.match(broken.node('weather-tip').textContent, /A few blue gaps slipped through/);
  broken.node('night').handlers.change();
  assert.match(broken.node('weather-tip').textContent, /A few blue gaps slipped through/);
  const nightClouds = await page({ condition_id: 803, clouds: 82, sunrise: now / 1000 - 7200, sunset: now / 1000 - 3600 });
  assert.match(nightClouds.node('weather-tip').textContent, /clouds tonight/);

  // 9. Daylight position at solar midday (marker centered at top of arc)
  const midday = await page({ sunrise: now / 1000 - 3600, sunset: now / 1000 + 3600 });
  assert.equal(midday.node('sun-marker').hidden, false);
  assert.ok(Math.abs(parseFloat(midday.node('sun-marker').style.left) - 50) < 0.001);
  assert.equal(midday.node('sun-marker').style.bottom, '100%');
  assert.equal(midday.node('sun-marker').title, 'Celestia has been on duty for 1h 0m');

  midday.node('night').handlers.change();
  assert.equal(midday.node('sun-marker').hidden, false);

  // 10. Daylight calculation before dawn
  const beforeDawn = await page({ sunrise: now / 1000 + 3600, sunset: now / 1000 + 7200 });
  assert.equal(beforeDawn.node('sun-marker').hidden, false);
  assert.equal(beforeDawn.node('sun-marker').dataset.phase, 'before-dawn');
  assert.equal(beforeDawn.node('sun-marker').style.left, '0%');
  assert.equal(beforeDawn.node('sun-position').textContent, 'Before sunrise');

  // 11. Daylight calculation after dusk
  const afterSunset = await page({ sunrise: now / 1000 - 7200, sunset: now / 1000 - 3600 });
  assert.equal(afterSunset.node('sun-marker').hidden, false);
  assert.equal(afterSunset.node('sun-marker').dataset.phase, 'after-sunset');
  assert.equal(afterSunset.node('sun-marker').style.left, '100%');
  assert.equal(afterSunset.node('sun-position').textContent, 'The sun has set');

  // 12. Stale or invalid sunrise/sunset times
  const oldSun = await page({ sunrise: now / 1000 - 86400, sunset: now / 1000 - 43200 });
  assert.equal(oldSun.node('sun-marker').hidden, true);
  assert.match(oldSun.node('sun-position').textContent, /Waiting/);

  // 13. Pixelarticons mapping and asset file existence
  const iconMappings = [
    [200, 'weather/cloud-storm'],
    [300, 'weather/cloud-drizzle'],
    [500, 'weather/cloud-rain'],
    [600, 'pixelarticons/snowflake'],
    [701, 'weather/fog'],
    [800, 'pixelarticons/sun'],
    [801, 'pixelarticons/cloud-sun'],
    [804, 'pixelarticons/cloud'],
  ];

  for (const [condition_id, icon] of iconMappings) {
    const state = await page({ condition_id });
    assert.equal(state.node('weather-image').src, `/static/icons/${icon}.svg`);
    assert.ok(fs.existsSync(`static/icons/${icon}.svg`));
  }

  const clearDay = await page({condition_id: 800});
  clearDay.node('night').handlers.change();
  assert.equal(clearDay.node('weather-image').src, '/static/icons/pixelarticons/sun.svg');
  const clearNight = await page({condition_id: 800, sunrise: now / 1000 - 7200, sunset: now / 1000 - 3600});
  clearNight.node('day').handlers.change();
  assert.equal(clearNight.node('weather-image').src, '/static/icons/pixelarticons/moon.svg');

  console.log(
    'Weather presentation checks passed: live copy, units, themes, rain, offline, stale data, relative timestamps, sun position, and pixel icons.'
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
