require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const PORT = process.env.PORT || 3001;
const API_KEY = process.env.OPENWEATHER_API_KEY;
const WEATHER_URL = 'https://api.openweathermap.org/data/2.5';
const GEO_URL = 'https://api.openweathermap.org/geo/1.0';

if (!API_KEY) {
  console.error('Missing OPENWEATHER_API_KEY. Add it to your .env file.');
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

app.use(
  '/api/',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later.' },
  })
);

// ---------- Helpers ----------

const toApiError = (error) => {
  if (error.status) return error; // already converted
  if (error.response) {
    const map = {
      401: 'Invalid API key (new keys can take up to a few hours to activate)',
      404: 'Location not found',
      429: 'OpenWeatherMap rate limit exceeded',
    };
    const status = error.response.status;
    return { status, message: map[status] || 'Weather service unavailable' };
  }
  return { status: 502, message: 'Could not reach weather service' };
};

const parseCoords = (lat, lon) => {
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lon);
  if (
    Number.isNaN(latitude) || Number.isNaN(longitude) ||
    latitude < -90 || latitude > 90 ||
    longitude < -180 || longitude > 180
  ) {
    throw { status: 400, message: 'Invalid coordinates' };
  }
  return { lat: latitude, lon: longitude };
};

const VALID_UNITS = ['metric', 'imperial', 'standard'];
const parseUnits = (units = 'metric') => {
  if (!VALID_UNITS.includes(units)) {
    throw { status: 400, message: `units must be one of: ${VALID_UNITS.join(', ')}` };
  }
  return units;
};

const owm = async (url, params) => {
  const { data } = await axios.get(url, {
    params: { ...params, appid: API_KEY },
    timeout: 5000,
  });
  return data;
};

// ---------- Normalizers ----------

const normalizeCurrent = (d) => ({
  location: {
    name: d.name,
    country: d.sys.country,
    lat: d.coord.lat,
    lon: d.coord.lon,
    timezone: d.timezone,
  },
  current: {
    temp: Math.round(d.main.temp),
    feels_like: Math.round(d.main.feels_like),
    temp_min: Math.round(d.main.temp_min),
    temp_max: Math.round(d.main.temp_max),
    pressure: d.main.pressure,
    humidity: d.main.humidity,
    visibility: d.visibility ?? 0,
    uv_index: null, // not included in the free current-weather endpoint
    wind_speed: d.wind?.speed ?? 0,
    wind_deg: d.wind?.deg ?? 0,
    clouds: d.clouds?.all ?? 0,
    weather: {
      main: d.weather[0].main,
      description: d.weather[0].description,
      icon: d.weather[0].icon,
    },
    sunrise: d.sys.sunrise * 1000,
    sunset: d.sys.sunset * 1000,
  },
  timestamp: Date.now(),
});

// The free /forecast endpoint returns 3-hour steps for 5 days.
// Group by day and summarise.
const normalizeForecast = (d) => {
  const days = {};

  d.list.forEach((item) => {
    const key = item.dt_txt.split(' ')[0]; // YYYY-MM-DD (UTC)
    if (!days[key]) days[key] = [];
    days[key].push(item);
  });

  return Object.entries(days)
    .slice(0, 5)
    .map(([date, items]) => {
      const temps = items.map((i) => i.main.temp);
      // Entry closest to midday to represent the day's conditions
      const midday =
        items.find((i) => i.dt_txt.includes('12:00:00')) || items[Math.floor(items.length / 2)];

      return {
        date,
        temp_max: Math.round(Math.max(...temps)),
        temp_min: Math.round(Math.min(...temps)),
        weather: {
          main: midday.weather[0].main,
          description: midday.weather[0].description,
          icon: midday.weather[0].icon,
        },
        humidity: midday.main.humidity,
        wind_speed: midday.wind?.speed ?? 0,
        clouds: midday.clouds?.all ?? 0,
      };
    });
};

const mapGeo = (list) =>
  list.map((l) => ({
    name: l.name,
    country: l.country,
    state: l.state,
    lat: l.lat,
    lon: l.lon,
  }));

// ---------- Routes ----------

const wrap = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (err) {
    const { status, message } = toApiError(err);
    if (status >= 500) console.error(err.message || err);
    res.status(status).json({ error: message });
  }
};

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Current weather: ?lat=&lon= or ?city=
app.get(
  '/api/v1/weather/current',
  wrap(async (req, res) => {
    const { lat, lon, city } = req.query;
    const units = parseUnits(req.query.units);

    let data;
    if (city) {
      data = await owm(`${WEATHER_URL}/weather`, { q: city, units });
    } else if (lat !== undefined && lon !== undefined) {
      const c = parseCoords(lat, lon);
      data = await owm(`${WEATHER_URL}/weather`, { ...c, units });
    } else {
      throw { status: 400, message: 'Provide lat & lon, or city' };
    }

    res.json(normalizeCurrent(data));
  })
);

// 5-day forecast: ?lat=&lon=
app.get(
  '/api/v1/weather/forecast',
  wrap(async (req, res) => {
    const c = parseCoords(req.query.lat, req.query.lon);
    const units = parseUnits(req.query.units);
    const data = await owm(`${WEATHER_URL}/forecast`, { ...c, units });
    res.json({ forecast: normalizeForecast(data), location: c });
  })
);

// Air pollution: ?lat=&lon=
app.get(
  '/api/v1/weather/air-pollution',
  wrap(async (req, res) => {
    const c = parseCoords(req.query.lat, req.query.lon);
    const data = await owm(`${WEATHER_URL}/air_pollution`, c);
    const entry = data.list[0];
    res.json({
      aqi: entry.main.aqi,
      components: entry.components,
      timestamp: entry.dt * 1000,
    });
  })
);

// City search (geocoding): ?q=
app.get(
  '/api/v1/locations/search',
  wrap(async (req, res) => {
    const { q } = req.query;
    if (!q || !q.trim()) throw { status: 400, message: 'Query parameter q is required' };
    const limit = Math.min(parseInt(req.query.limit, 10) || 5, 10);
    const data = await owm(`${GEO_URL}/direct`, { q, limit });
    res.json({ locations: mapGeo(data) });
  })
);

// Reverse geocoding: ?lat=&lon=
app.get(
  '/api/v1/locations/reverse',
  wrap(async (req, res) => {
    const c = parseCoords(req.query.lat, req.query.lon);
    const data = await owm(`${GEO_URL}/reverse`, { ...c, limit: 1 });
    res.json({ locations: mapGeo(data) });
  })
);

// 404 + error handlers
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.originalUrl });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong' });
});

app.listen(PORT, () => {
  console.log(`Weather API running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;