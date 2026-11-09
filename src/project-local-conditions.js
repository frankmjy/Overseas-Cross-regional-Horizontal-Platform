import { readPlatformSession } from './platform-context.js';
import { platformProjects } from './project-context-model.mjs';

async function switchProject(select, status, session) {
  const projectId = select.value;
  const params = new URLSearchParams({
    project: projectId,
    returnTo: location.pathname + location.search + location.hash,
  });
  select.disabled = true;
  status.textContent = '切换中…';
  try {
    const response = await fetch('/api/auth/project?' + params, {
      method: 'POST',
      headers: { 'X-CSRF-Token': session.csrf },
      signal: AbortSignal.timeout(8000),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw Error(result.error);
    window.location.replace(result.destination);
  } catch {
    // A lost response can follow a successful switch. Recheck before restoring the picker.
    const current = await readPlatformSession(true).catch(() => null);
    if (current?.project?.id === projectId) return;
    select.value = session.project.id;
    select.disabled = false;
    status.textContent = '切换未确认，请重试。';
  }
}

const weatherIcons = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon: '<path d="M20.5 14a8.8 8.8 0 0 1-10.6-10.6A8.8 8.8 0 1 0 20.5 14Z"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 1 1 1.4-8.8 5.5 5.5 0 0 1 10.7 2.1A3.4 3.4 0 0 1 19 18Z"/>',
  partly: '<path class="weather-sun" d="M8 1v2M2 5l1.5 1M14 4l-1.5 1.5M4.5 11a4 4 0 1 1 7-3"/><path d="M8 19a3.5 3.5 0 1 1 0-7 5 5 0 0 1 9.5 1A3 3 0 1 1 19 19Z"/>',
  rain: '<path d="M6 15a3.8 3.8 0 1 1 1.5-7.3 5 5 0 0 1 9.8 2A2.7 2.7 0 0 1 18 15M9 16l-2 4m7-4-2 4m7-4-2 4"/>',
  storm: '<path d="M6 14a3.8 3.8 0 1 1 1.5-7.3 5 5 0 0 1 9.8 2A2.7 2.7 0 0 1 18 14m-5-1-3 5h4l-3 4"/>',
  fog: '<path d="M5 11h14M3 15h18M6 19h12m2-11a4 4 0 0 0-8-1 3 3 0 0 0-5 1"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9m0-9-15.6 9"/>',
};
function weatherLabel(symbol) {
  if (symbol.includes('thunder')) return ['雷雨', 'storm'];
  if (symbol.includes('snow') || symbol.includes('sleet')) return ['雨雪', 'snow'];
  if (symbol.includes('rain')) return [symbol.includes('showers') ? '阵雨' : '降雨', 'rain'];
  if (symbol === 'fog') return ['雾', 'fog'];
  if (symbol.startsWith('clearsky') || symbol.startsWith('fair')) return ['晴', symbol.endsWith('_night') ? 'moon' : 'sun'];
  if (symbol.startsWith('partlycloudy')) return ['局部多云', symbol.endsWith('_night') ? 'cloud' : 'partly'];
  return [symbol === 'cloudy' ? '多云' : '天气预报', 'cloud'];
}

let weatherCache;
function loadWeather(projectId) {
  if (weatherCache?.projectId === projectId && weatherCache.expires > Date.now()) return weatherCache.result;
  const result = fetch('/api/project-weather', { cache: 'no-store', signal: AbortSignal.timeout(7000) })
    .then(async response => response.ok ? (await response.json()).weather : null)
    .catch(() => null);
  weatherCache = { projectId, expires: Date.now() + 5 * 60_000, result };
  return result;
}

class ProjectLocalConditions extends HTMLElement {
  async connectedCallback() {
    const session = await readPlatformSession().catch(() => null);
    const project = session?.project, location = project?.location;
    if (!this.isConnected || !session?.authenticated || !location) return;
    this.innerHTML = `
      <div class="local-project-picker">
        <svg class="local-project-pin" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.3"/></svg>
        <select class="local-project" aria-label="切换项目" title="切换项目"></select>
      </div>
      <time class="local-time" aria-label="项目当地时间"></time>
      <span class="local-project-status" role="status"></span>
      <span class="local-weather-state" hidden></span>
      <details class="local-weather" hidden>
        <summary>
          <svg class="local-weather-icon" viewBox="0 0 24 24" aria-hidden="true"></svg>
          <strong class="local-temperature"></strong><span class="local-weather-label"></span>
        </summary>
        <div class="local-weather-info">
          <span class="local-forecast-time"></span>
          <a href="https://docs.api.met.no/doc/License.html" target="_blank" rel="noopener noreferrer">MET Norway · CC BY 4.0</a>
        </div>
      </details>`;
    const select = this.querySelector('.local-project');
    this.compact = matchMedia('(max-width: 480px)');
    this.labelProjects = () => {
      const selected = select.value || project.id;
      select.replaceChildren(...session.projects.map(item => {
        const shortName = platformProjects.find(project => project.id === item.id)?.shortName;
        return new Option(this.compact.matches && shortName ? shortName : item.name, item.id);
      }));
      select.value = selected;
    };
    this.labelProjects();
    this.compact.addEventListener('change', this.labelProjects);
    select.addEventListener('change', () => switchProject(select, this.querySelector('.local-project-status'), session));
    const clock = this.querySelector('.local-time');
    clock.title = `${location.label}当地时间`;
    const format = new Intl.DateTimeFormat('en-GB', { timeZone: location.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const tick = () => { clock.textContent = format.format(); };
    tick();
    this.hidden = false;
    this.clockTimer = setInterval(tick, 1000);
    if (Number.isFinite(location.latitude)) {
      const refresh = () => this.refreshWeather(project.id, format, location.label);
      refresh();
      this.weatherTimer = setInterval(() => { if (!document.hidden) refresh(); }, 15 * 60_000);
    }
  }

  async refreshWeather(projectId, format, labelOfPlace) {
    const weather = await loadWeather(projectId);
    if (!this.isConnected) return;
    const details = this.querySelector('.local-weather'), status = this.querySelector('.local-weather-state');
    const available = Number.isFinite(weather?.temperature) && typeof weather?.symbol === 'string';
    details.hidden = !available;
    status.hidden = available;
    if (!available) {
      status.textContent = '天气暂不可用';
      return;
    }
    const [label, icon] = weatherLabel(weather.symbol);
    details.dataset.weather = icon;
    this.querySelector('.local-weather-icon').innerHTML = weatherIcons[icon];
    this.querySelector('.local-temperature').textContent = `${weather.temperature}°C`;
    this.querySelector('.local-weather-label').textContent = label;
    const forecastAt = Date.parse(weather.forecastAt);
    this.querySelector('.local-forecast-time').textContent = Number.isFinite(forecastAt)
      ? `${labelOfPlace} · ${format.format(forecastAt)} 预报` : `${labelOfPlace} · 当地预报`;
  }

  disconnectedCallback() {
    clearInterval(this.clockTimer);
    clearInterval(this.weatherTimer);
    this.compact?.removeEventListener('change', this.labelProjects);
  }
}

const stylesheet = document.createElement('link');
stylesheet.rel = 'stylesheet';
stylesheet.href = '/src/project-local-conditions.css';
document.head.append(stylesheet);
customElements.define('project-local-conditions', ProjectLocalConditions);
