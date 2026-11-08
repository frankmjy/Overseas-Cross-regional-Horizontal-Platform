const cache = new Map();
const refreshInterval = 3 * 3600_000; // MET Norway's minimum for locations outside the Nordic region.
const retryInterval = 15 * 60_000;

function weatherAt(series, now) {
  const index = series.findLastIndex(point => Date.parse(point.time) <= now);
  const point = series[index] || series[0];
  const pointTime = Date.parse(point?.time);
  if (!Number.isFinite(pointTime) || Math.abs(pointTime - now) > 6 * 3600_000) return null;
  const temperature = point.data?.instant?.details?.air_temperature;
  const symbol = (point.data?.next_1_hours || point.data?.next_6_hours)?.summary?.symbol_code;
  if (!Number.isFinite(temperature) || typeof symbol !== 'string') return null;
  return { temperature: Math.round(temperature), symbol, forecastAt: point.time };
}

export async function readProjectWeather({ latitude, longitude }) {
  const key = new URLSearchParams({ lat: latitude, lon: longitude }).toString();
  let entry = cache.get(key);
  if (!entry) {
    entry = { series: [], nextRequestAt: 0 };
    cache.set(key, entry);
  }
  if (!entry.pending && Date.now() >= entry.nextRequestAt) {
    entry.pending = (async () => {
      try {
        const headers = { 'User-Agent': 'VNET-Overseas-Platform/1.0 https://www.sm.sjhl.online/' };
        if (entry.lastModified) headers['If-Modified-Since'] = entry.lastModified;
        const response = await fetch('https://api.met.no/weatherapi/locationforecast/2.0/compact?' + key, {
          headers, signal: AbortSignal.timeout(5000),
        });
        if (response.status !== 304) {
          if (!response.ok) throw Error('Weather source unavailable');
          const data = await response.json();
          if (!Array.isArray(data.properties?.timeseries) || !data.properties.timeseries.length) throw Error('Weather source returned no forecast');
          entry.series = data.properties.timeseries;
          entry.lastModified = response.headers.get('last-modified');
        }
        entry.nextRequestAt = Math.max(Date.now() + refreshInterval, Date.parse(response.headers.get('expires')) || 0);
      } catch {
        entry.nextRequestAt = Date.now() + retryInterval;
      } finally {
        entry.pending = null;
      }
    })();
  }
  if (entry.pending && !entry.series.length) await entry.pending;
  return weatherAt(entry.series, Date.now());
}
