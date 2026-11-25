// src/App.jsx
import { useState, useEffect } from 'react';
import {
  Search, MapPin, Wind, Droplets, Eye, Gauge,
  Sun, Cloud, CloudRain, CloudSnow, Zap, RefreshCw, Navigation,
} from 'lucide-react';
import WeatherAPI from './weatherAPI';

const api = new WeatherAPI();

const DEFAULT_LOCATIONS = [
  { name: 'Bristol', country: 'GB', lat: 51.4545, lon: -2.5879 },
  { name: 'New York', country: 'US', lat: 40.7128, lon: -74.006 },
  { name: 'Tokyo', country: 'JP', lat: 35.6762, lon: 139.6503 },
];

const CARD = 'bg-white bg-opacity-10 backdrop-blur-md rounded-2xl border border-white border-opacity-20';
const TILE = 'bg-white bg-opacity-10 rounded-lg p-4';

// OpenWeatherMap icon codes look like "10d" / "01n": the first two digits give the condition
const WeatherIcon = ({ code = '01d', className = 'w-8 h-8' }) => {
  const kind = code.slice(0, 2);
  if (kind === '01') return <Sun className={`${className} text-yellow-400`} />;
  if (kind === '09' || kind === '10') return <CloudRain className={`${className} text-blue-300`} />;
  if (kind === '11') return <Zap className={`${className} text-purple-300`} />;
  if (kind === '13') return <CloudSnow className={`${className} text-blue-100`} />;
  return <Cloud className={`${className} text-gray-300`} />;
};

const AQI = {
  1: { text: 'Good', color: 'text-green-400' },
  2: { text: 'Fair', color: 'text-yellow-400' },
  3: { text: 'Moderate', color: 'text-orange-400' },
  4: { text: 'Poor', color: 'text-red-400' },
  5: { text: 'Very Poor', color: 'text-red-500' },
};

// Show a timestamp in the *city's* local time using OpenWeatherMap's UTC offset (seconds)
const localTime = (ms, tzOffsetSeconds = 0) =>
  new Date(ms + tzOffsetSeconds * 1000).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });

const dayLabel = (dateStr, index) =>
  index === 0
    ? 'Today'
    : new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-GB', {
        weekday: 'short',
        timeZone: 'UTC',
      });

export default function App() {
  const [selectedLocation, setSelectedLocation] = useState(DEFAULT_LOCATIONS[0]);
  const [units, setUnits] = useState('metric');
  const [currentWeather, setCurrentWeather] = useState(null);
  const [forecast, setForecast] = useState([]);
  const [airPollution, setAirPollution] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  const tempUnit = units === 'metric' ? '°C' : '°F';
  const windUnit = units === 'metric' ? 'm/s' : 'mph';
  const formatTemp = (t) => `${Math.round(t)}${tempUnit}`;

  // Load weather whenever the location, units, or refresh counter changes
  useEffect(() => {
    let cancelled = false; // ignore stale responses if the user switches quickly

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const { lat, lon } = selectedLocation;
        const [weather, fc] = await Promise.all([
          api.getCurrentWeatherByCoords(lat, lon, units),
          api.getForecast(lat, lon, units),
        ]);
        if (cancelled) return;
        setCurrentWeather(weather);
        setForecast(fc.forecast || []);

        // Air quality is optional: don't fail the whole dashboard if it errors
        api
          .getAirPollution(lat, lon)
          .then((a) => !cancelled && setAirPollution(a))
          .catch(() => !cancelled && setAirPollution(null));
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedLocation, units, refreshKey]);

  // Debounced city search
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await api.searchLocations(q, 5);
        setSearchResults(res.locations || []);
      } catch {
        setSearchResults([]);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const chooseLocation = (loc) => {
    setSelectedLocation(loc);
    setSearchQuery('');
    setSearchResults([]);
  };

  const useMyLocation = async () => {
    setError('');
    try {
      const { lat, lon } = await api.getCurrentLocation();
      const res = await api.reverseGeocode(lat, lon);
      const place = res.locations?.[0];
      chooseLocation(place || { name: `${lat.toFixed(2)}, ${lon.toFixed(2)}`, country: '', lat, lon });
    } catch (err) {
      setError(err.message);
    }
  };

  const w = currentWeather;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 text-white">
      {/* Header */}
      <header className="bg-black bg-opacity-20 backdrop-blur-md p-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-3xl font-bold">Weather Dashboard</h1>

          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300" />
            <input
              type="text"
              placeholder="Search for a city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white bg-opacity-20 rounded-lg border border-white border-opacity-30 focus:outline-none focus:ring-2 focus:ring-blue-400 text-white placeholder-gray-300"
            />
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg max-h-60 overflow-y-auto z-50">
                {searchResults.map((loc, i) => (
                  <button
                    key={`${loc.name}-${loc.lat}-${loc.lon}-${i}`}
                    onClick={() => chooseLocation(loc)}
                    className="w-full text-left px-4 py-3 text-gray-800 hover:bg-blue-100 flex items-center gap-2"
                  >
                    <MapPin className="w-4 h-4 text-blue-600" />
                    <span>
                      {loc.name}
                      {loc.state && `, ${loc.state}`}
                      {loc.country && `, ${loc.country}`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={useMyLocation}
              title="Use my location"
              className="p-2 bg-white bg-opacity-20 rounded-lg hover:bg-opacity-30 transition-colors"
            >
              <Navigation className="w-5 h-5" />
            </button>
            <button
              onClick={() => setUnits(units === 'metric' ? 'imperial' : 'metric')}
              className="px-3 py-2 bg-white bg-opacity-20 rounded-lg hover:bg-opacity-30 transition-colors text-sm"
            >
              {tempUnit}
            </button>
            <button
              onClick={() => setRefreshKey((k) => k + 1)}
              disabled={loading}
              title="Refresh"
              className="p-2 bg-white bg-opacity-20 rounded-lg hover:bg-opacity-30 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Quick locations */}
        <div className="flex gap-3 overflow-x-auto pb-2">
          {DEFAULT_LOCATIONS.map((loc) => {
            const active = selectedLocation.name === loc.name && selectedLocation.country === loc.country;
            return (
              <button
                key={`${loc.name}-${loc.country}`}
                onClick={() => chooseLocation(loc)}
                className={`flex-shrink-0 px-4 py-2 rounded-lg transition-colors ${
                  active ? 'bg-blue-600' : 'bg-white bg-opacity-20 hover:bg-opacity-30'
                }`}
              >
                <MapPin className="w-4 h-4 inline mr-2" />
                {loc.name}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="bg-red-500 bg-opacity-20 border border-red-400 border-opacity-40 rounded-lg p-4 text-red-100">
            {error}
          </div>
        )}

        {loading && !w && (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-8 h-8 animate-spin" />
            <span className="ml-3 text-xl">Loading weather data...</span>
          </div>
        )}

        {w && (
          <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 transition-opacity ${loading ? 'opacity-60' : ''}`}>
            {/* Current weather */}
            <section className={`lg:col-span-2 p-8 ${CARD}`}>
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-semibold">
                    {w.location.name}
                    {w.location.country && `, ${w.location.country}`}
                  </h2>
                  <p className="text-gray-300">Current weather</p>
                </div>
                <p className="text-sm text-gray-300 text-right">
                  Updated
                  <br />
                  {new Date(w.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="text-center md:text-left">
                  <div className="flex items-center justify-center md:justify-start gap-4 mb-4">
                    <WeatherIcon code={w.current.weather.icon} className="w-16 h-16" />
                    <div>
                      <div className="text-5xl font-bold">{formatTemp(w.current.temp)}</div>
                      <div className="text-gray-300">Feels like {formatTemp(w.current.feels_like)}</div>
                    </div>
                  </div>
                  <p className="text-xl capitalize">{w.current.weather.description}</p>
                  <p className="text-gray-300">
                    H: {formatTemp(w.current.temp_max)} &nbsp; L: {formatTemp(w.current.temp_min)}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className={TILE}>
                    <div className="flex items-center gap-2 mb-2 text-sm text-gray-300">
                      <Wind className="w-5 h-5 text-blue-300" /> Wind
                    </div>
                    <div className="text-xl font-semibold">
                      {w.current.wind_speed.toFixed(1)} {windUnit}
                    </div>
                    <div className="text-xs text-gray-400">{w.current.wind_deg}°</div>
                  </div>
                  <div className={TILE}>
                    <div className="flex items-center gap-2 mb-2 text-sm text-gray-300">
                      <Droplets className="w-5 h-5 text-blue-300" /> Humidity
                    </div>
                    <div className="text-xl font-semibold">{w.current.humidity}%</div>
                  </div>
                  <div className={TILE}>
                    <div className="flex items-center gap-2 mb-2 text-sm text-gray-300">
                      <Gauge className="w-5 h-5 text-blue-300" /> Pressure
                    </div>
                    <div className="text-xl font-semibold">{w.current.pressure} hPa</div>
                  </div>
                  <div className={TILE}>
                    <div className="flex items-center gap-2 mb-2 text-sm text-gray-300">
                      <Eye className="w-5 h-5 text-blue-300" /> Visibility
                    </div>
                    <div className="text-xl font-semibold">{(w.current.visibility / 1000).toFixed(1)} km</div>
                  </div>
                </div>
              </div>
            </section>

            {/* Details */}
            <aside className={`p-6 ${CARD}`}>
              <h3 className="text-xl font-semibold mb-4">Details</h3>
              <dl className="space-y-4">
                <div className="flex justify-between">
                  <dt className="text-gray-300">Cloud cover</dt>
                  <dd className="font-semibold">{w.current.clouds}%</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-300">Sunrise</dt>
                  <dd className="font-semibold">{localTime(w.current.sunrise, w.location.timezone)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-300">Sunset</dt>
                  <dd className="font-semibold">{localTime(w.current.sunset, w.location.timezone)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-300">Coordinates</dt>
                  <dd className="font-semibold text-sm">
                    {w.location.lat.toFixed(2)}, {w.location.lon.toFixed(2)}
                  </dd>
                </div>
                {airPollution && (
                  <div className="pt-4 border-t border-white border-opacity-20 flex justify-between">
                    <dt className="text-gray-300">Air quality</dt>
                    <dd className={`font-semibold ${AQI[airPollution.aqi]?.color || ''}`}>
                      {AQI[airPollution.aqi]?.text || 'Unknown'}
                    </dd>
                  </div>
                )}
              </dl>
            </aside>
          </div>
        )}

        {/* Forecast */}
        {forecast.length > 0 && (
          <section className={`p-6 ${CARD}`}>
            <h3 className="text-xl font-semibold mb-6">5-Day Forecast</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {forecast.map((day, i) => (
                <div
                  key={day.date}
                  className="bg-white bg-opacity-10 rounded-lg p-4 text-center hover:bg-opacity-20 transition-colors"
                >
                  <div className="font-semibold mb-2">{dayLabel(day.date, i)}</div>
                  <div className="flex justify-center mb-2">
                    <WeatherIcon code={day.weather.icon} />
                  </div>
                  <div className="text-sm text-gray-300 mb-2 capitalize">{day.weather.description}</div>
                  <div className="font-semibold">
                    {formatTemp(day.temp_max)}
                    <span className="text-gray-400 ml-2">{formatTemp(day.temp_min)}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-2">
                    <div>💧 {day.humidity}%</div>
                    <div>
                      💨 {day.wind_speed.toFixed(1)} {windUnit}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="text-center text-gray-400 py-6 text-sm">
          Weather data provided by OpenWeatherMap
        </footer>
      </main>
    </div>
  );
}