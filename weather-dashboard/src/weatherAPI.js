// src/weatherAPI.js
export default class WeatherAPI {
  // Relative URL: Vite's dev proxy forwards /api to http://localhost:3001
  constructor(baseURL = '/api/v1') {
    this.baseURL = baseURL;
  }

  async request(path) {
    let response;
    try {
      response = await fetch(`${this.baseURL}${path}`);
    } catch {
      throw new Error('Cannot reach the server. Is the backend running?');
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Request failed (${response.status})`);
    }
    return response.json();
  }

  getCurrentWeatherByCoords(lat, lon, units = 'metric') {
    return this.request(`/weather/current?lat=${lat}&lon=${lon}&units=${units}`);
  }

  getForecast(lat, lon, units = 'metric') {
    return this.request(`/weather/forecast?lat=${lat}&lon=${lon}&units=${units}`);
  }

  getAirPollution(lat, lon) {
    return this.request(`/weather/air-pollution?lat=${lat}&lon=${lon}`);
  }

  searchLocations(query, limit = 5) {
    return this.request(`/locations/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  }

  reverseGeocode(lat, lon) {
    return this.request(`/locations/reverse?lat=${lat}&lon=${lon}`);
  }

  // Browser geolocation wrapped in a promise
  getCurrentLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        return reject(new Error('Geolocation is not supported by this browser.'));
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        (err) => reject(new Error(err.code === 1 ? 'Location access was denied.' : 'Could not get your location.')),
        { timeout: 10000, maximumAge: 300000 }
      );
    });
  }
}