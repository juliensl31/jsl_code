(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const DEFAULT_CITY = { name: 'Toulouse', admin1: 'Occitanie', country: 'France', latitude: 43.6045, longitude: 1.4440, timezone: 'Europe/Paris' };
  const STORAGE_KEY = 'meteo-live-v2-place';
  const UNIT_KEY = 'meteo-live-v2-fahrenheit';
  const icons = {
    sun: '<circle cx="40" cy="40" r="14" fill="#FBD98B"/><g stroke="#FBD98B" stroke-width="3.5" stroke-linecap="round"><path d="M40 7v9M40 64v9M7 40h9M64 40h9M17 17l6.5 6.5M56.5 56.5 63 63M17 63l6.5-6.5M56.5 23.5 63 17"/></g>',
    moon: '<path d="M58 61A29 29 0 0 1 34 9a27 27 0 1 0 24 52Z" fill="#C5D9FF" stroke="#DDEAFF" stroke-width="2"/>',
    cloud: '<path d="M22 58h36c9 0 15-6 15-14S66 30 57 30h-3C50 18 34 14 24 23a20 20 0 0 0-6 13C4 38 7 58 22 58Z" fill="#D7E7F9" stroke="#B0CDEB" stroke-width="2"/>',
    rain: '<path d="M25 63l-5 9m21-9-5 9m21-9-5 9" stroke="#80C9F8" stroke-width="4" stroke-linecap="round"/>',
    snow: '<g stroke="#D4F2FF" stroke-width="3" stroke-linecap="round"><path d="M25 64v11m-5-6h10m12-5v11m-5-6h10m12-5v11m-5-6h10"/></g>',
    storm: '<path d="m40 58-10 16h11l-4 13 18-23H43l6-6Z" fill="#F3D57F"/>',
    fog: '<g stroke="#B7CFE4" stroke-width="3" stroke-linecap="round"><path d="M14 64h53M23 72h36"/></g>'
  };
  const svg = (kind, night = false) => {
    let fragment = '';
    if (kind === 'sun') fragment = night ? icons.moon : icons.sun;
    else if (kind === 'cloud') fragment = (night ? icons.moon : icons.sun).replace(/cx="40" cy="40"/,'cx="42" cy="29"') + icons.cloud;
    else fragment = ((kind === 'rain' || kind === 'storm' || kind === 'snow') ? icons.cloud + icons[kind] : icons.cloud + icons.fog);
    return '<svg viewBox="0 0 80 84" role="presentation" aria-hidden="true">' + fragment + '</svg>';
  };
  const weatherInfo = (code, isDay = true) => {
    if (code === 0) return { text: isDay ? 'Ciel dégagé' : 'Nuit claire', kind: 'sun', type: 'clear' };
    if (code <= 3) return { text: code === 1 ? 'Peu nuageux' : code === 2 ? 'Partiellement nuageux' : 'Couvert', kind: 'cloud', type: 'cloud' };
    if (code === 45 || code === 48) return { text: 'Brouillard', kind: 'fog', type: 'cloud' };
    if (code >= 51 && code <= 67 || code >= 80 && code <= 82) return { text: code >= 80 ? 'Averses' : 'Pluie', kind: 'rain', type: 'rain' };
    if (code >= 71 && code <= 77 || code === 85 || code === 86) return { text: 'Neige', kind: 'snow', type: 'snow' };
    if (code >= 95) return { text: 'Orage', kind: 'storm', type: 'rain' };
    return { text: 'Nuageux', kind: 'cloud', type: 'cloud' };
  };
  const state = { city: DEFAULT_CITY, fahrenheit: false, forecast: null, requestId: 0, searchId: 0, searchTimer: null, searchController: null };
  const secureStore = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } }
  };
  const stored = secureStore.get(STORAGE_KEY);
  if (stored) { try { const c = JSON.parse(stored); if (c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude) && Math.abs(c.latitude) <= 90 && Math.abs(c.longitude) <= 180 && typeof c.name === 'string') state.city = c; } catch { /* invalid saved city */ } }
  state.fahrenheit = secureStore.get(UNIT_KEY) === 'true';
  const formatTemp = (num, withUnit = true) => { if (num === null || num === undefined || !Number.isFinite(Number(num))) return '—'; const n = state.fahrenheit ? Number(num) * 9 / 5 + 32 : Number(num); return String(Math.round(n)) + (withUnit ? (state.fahrenheit ? '°F' : '°C') : ''); };
  const formatNum = (num, unit = '') => (num === null || num === undefined || !Number.isFinite(Number(num))) ? '—' : String(Math.round(Number(num))) + unit;
  const weekday = (iso, options = {}) => { const d = new Date(iso + (iso.length === 10 ? 'T12:00:00Z' : 'Z')); return new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', ...options }).format(d); };
  const hour = (iso) => String(iso || '').slice(11, 16);
  const compass = (deg) => { if (!Number.isFinite(deg)) return '—'; return ['N','NE','E','SE','S','SO','O','NO'][Math.round(deg / 45) % 8]; };
  const notice = (text = '') => { const n = $('notice'); n.hidden = !text; n.textContent = text; };
  const setLoading = (value) => { $('refresh-btn').disabled = value; $('refresh-btn').querySelector('span').textContent = value ? 'Chargement…' : 'Actualiser'; };
  const fetchJSON = async (url, options = {}) => { const r = await fetch(url, options); if (!r.ok) throw new Error('HTTP ' + r.status); const data = await r.json(); if (data.error) throw new Error(data.reason || 'Service météo indisponible'); return data; };
  const create = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = String(text); return el; };
  const dayMessage = (current, rain) => {
    if (current.weather_code >= 95) return ['Le ciel gronde.', 'Orages possibles : consultez les alertes officielles avant de sortir.'];
    if (current.weather_code >= 71 && current.weather_code <= 77) return ['La ville sous la neige.', 'Les températures peuvent rendre les déplacements délicats.'];
    if (rain >= 65) return ['Le parapluie est de sortie.', 'La probabilité de précipitations est élevée aujourd’hui.'];
    if (current.temperature_2m >= 28) return ['Un air d’été.', 'Hydratez-vous régulièrement et privilégiez les endroits ombragés.'];
    if (current.temperature_2m <= 3) return ['Un peu de fraîcheur.', 'Pensez à vous couvrir avant de sortir.'];
    return ['Un temps pour chaque envie.', 'Découvrez l’évolution du ciel au fil des prochaines heures.'];
  };
  function render(data) {
    state.forecast = data;
    const c = data.current, d = data.daily, h = data.hourly, info = weatherInfo(c.weather_code, Boolean(c.is_day));
    document.body.classList.remove('weather-clear','weather-rain','weather-snow');
    if (info.type === 'clear') document.body.classList.add('weather-clear');
    else if (info.type === 'rain') document.body.classList.add('weather-rain');
    else if (info.type === 'snow') document.body.classList.add('weather-snow');
    $('city-name').textContent = state.city.name || 'Ma position';
    $('region-name').textContent = [state.city.admin1, state.city.country].filter(Boolean).join(' · ') || 'Position actuelle';
    $('date-label').textContent = weekday(c.time.slice(0,10), { weekday:'long', day:'numeric', month:'long' });
    $('temp-now').textContent = formatTemp(c.temperature_2m, false);
    $('temp-unit').textContent = state.fahrenheit ? '°F' : '°C';
    $('condition').textContent = info.text;
    $('feels').textContent = 'Ressenti ' + formatTemp(c.apparent_temperature);
    $('high').textContent = '↑ ' + formatTemp(d.temperature_2m_max[0]);
    $('low').textContent = '↓ ' + formatTemp(d.temperature_2m_min[0]);
    $('hero-symbol').innerHTML = svg(info.kind, !c.is_day);
    $('wind-value').textContent = formatNum(c.wind_speed_10m, ' km/h');
    $('wind-detail').textContent = 'Direction ' + compass(c.wind_direction_10m);
    $('humidity-value').textContent = formatNum(c.relative_humidity_2m, '%');
    $('rain-value').textContent = formatNum(d.precipitation_probability_max?.[0], '%');
    const uv = d.uv_index_max?.[0]; $('uv-value').textContent = formatNum(uv);
    $('uv-detail').textContent = uv == null ? 'Non disponible' : uv < 3 ? 'Faible' : uv < 6 ? 'Modéré' : uv < 8 ? 'Élevé' : 'Très élevé';
    const msg = dayMessage(c, d.precipitation_probability_max?.[0] || 0);
    $('insight-title').textContent = msg[0]; $('insight-text').textContent = msg[1]; $('hero-message').textContent = 'Une nouvelle perspective sur votre journée.';
    $('unit-btn').textContent = state.fahrenheit ? '°F' : '°C';
    const nowStr = String(c.time).slice(0,13);
    let start = h.time.findIndex(x => x.slice(0,13) >= nowStr); if (start < 0) start = 0;
    const hours = $('hourly-list'); hours.replaceChildren();
    for (let i = start; i < Math.min(start + 24, h.time.length); i++) {
      const item = create('div','hour-tile');
      item.append(create('time','',i === start ? 'Maintenant' : hour(h.time[i])));
      const icon = create('div','hour-icon'); icon.innerHTML = svg(weatherInfo(h.weather_code[i], h.is_day[i] === 1).kind, h.is_day[i] !== 1); item.append(icon);
      item.append(create('strong','',formatTemp(h.temperature_2m[i])));
      item.append(create('small','',formatNum(h.precipitation_probability[i], '%') + ' pluie'));
      hours.append(item);
    }
    hours.scrollLeft = 0;
    const list = $('daily-list'); list.replaceChildren();
    const min = Math.min(...d.temperature_2m_min), max = Math.max(...d.temperature_2m_max), range = Math.max(1, max - min);
    for (let i = 0; i < Math.min(d.time.length,7); i++) {
      const day = create('div','day-row');
      const name = i === 0 ? "Aujourd'hui" : weekday(d.time[i], {weekday:'short'});
      day.append(create('span','day-name',name));
      const icon = create('div','day-icon'); icon.innerHTML = svg(weatherInfo(d.weather_code[i]).kind); day.append(icon);
      const desc = create('div','day-desc'); desc.append(create('div','',weatherInfo(d.weather_code[i]).text),create('div','day-rain',formatNum(d.precipitation_probability_max?.[i], '%') + ' pluie')); day.append(desc);
      const track = create('div','temp-track'), bar = create('span'); const left = (d.temperature_2m_min[i] - min) / range * 100, width = Math.max(8,(d.temperature_2m_max[i] - d.temperature_2m_min[i]) / range * 100); bar.style.left = Math.min(99,left) + '%'; bar.style.width = Math.min(100-left,width) + '%'; track.append(bar); day.append(track);
      day.append(create('span','day-temp',formatTemp(d.temperature_2m_max[i])),create('span','day-min',formatTemp(d.temperature_2m_min[i])));
      list.append(day);
    }
    const sunrise = d.sunrise?.[0], sunset = d.sunset?.[0];
    $('sunrise').textContent = sunrise ? hour(sunrise) : '—'; $('sunset').textContent = sunset ? hour(sunset) : '—';
    if (sunrise && sunset) {
      const start = Date.parse(sunrise + 'Z'), end = Date.parse(sunset + 'Z'), now = Date.parse(c.time + 'Z');
      const duration = Math.max(0,end-start)/60000; $('daylight').textContent = 'Durée du jour : ' + Math.floor(duration/60) + ' h ' + String(Math.round(duration%60)).padStart(2,'0');
      const pct = Math.min(90,Math.max(10,(now-start)/(end-start)*80+10)); $('sun-orb').style.left = pct + '%';
    } else $('daylight').textContent = 'Durée du jour : —';
    $('updated').textContent = 'Actualisé à ' + hour(c.time) + ' · heure locale';
  }
  async function loadWeather(city) {
    const id = ++state.requestId; setLoading(true); notice();
    const qs = new URLSearchParams({
      latitude: String(city.latitude), longitude: String(city.longitude),
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m',
      hourly: 'temperature_2m,precipitation_probability,weather_code,is_day',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset',
      timezone: 'auto', forecast_days: '7', wind_speed_unit: 'kmh'
    });
    try {
      const data = await fetchJSON('https://api.open-meteo.com/v1/forecast?' + qs.toString());
      if (id !== state.requestId) return;
      if (!data.current || !data.daily || !data.hourly || !Array.isArray(data.daily.time)) throw new Error('Données incomplètes');
      state.city = city; secureStore.set(STORAGE_KEY, JSON.stringify(city)); render(data);
    } catch (e) {
      if (id !== state.requestId) return;
      $('updated').textContent = 'Données indisponibles';
      notice('Impossible de récupérer les prévisions pour le moment. Vérifiez votre connexion et réessayez.');
      if (!state.forecast) { $('hourly-list').textContent = 'Prévisions indisponibles'; $('daily-list').textContent = 'Prévisions indisponibles'; }
    } finally { if (id === state.requestId) setLoading(false); }
  }
  const dialog = $('city-dialog'), input = $('city-query'), results = $('city-results');
  const openDialog = () => { dialog.showModal(); input.value=''; results.replaceChildren(create('div','city-empty','Paris, Bordeaux, Montréal, Tokyo… le monde vous attend.')); input.focus(); };
  const closeDialog = () => { dialog.close(); if (state.searchController) state.searchController.abort(); if (state.searchTimer) clearTimeout(state.searchTimer); state.searchId++; };
  function showCities(cities) {
    results.replaceChildren();
    if (!cities.length) { results.append(create('div','city-empty','Aucune ville trouvée. Essayez une autre orthographe.')); return; }
    cities.forEach(city => {
      if (!Number.isFinite(city.latitude) || !Number.isFinite(city.longitude)) return;
      const button = create('button','city-result'); button.type='button';button.setAttribute('role','option');
      const label=create('span'), name=create('strong','',city.name), region=create('small','',[city.admin1,city.country].filter(Boolean).join(' · '));
      label.append(name,region); button.append(label,create('span','','↗'));
      button.addEventListener('click',()=>{closeDialog();loadWeather(city);});results.append(button);
    });
  }
  async function searchCities(query) {
    const id = ++state.searchId;
    if (state.searchController) state.searchController.abort();
    state.searchController = new AbortController();
    results.replaceChildren(create('div','city-empty','Recherche en cours…'));
    const params=new URLSearchParams({name:query,count:'8',language:'fr',format:'json'});
    try {
      const data=await fetchJSON('https://geocoding-api.open-meteo.com/v1/search?'+params,{signal:state.searchController.signal});
      if (id===state.searchId) showCities(data.results || []);
    } catch(err) { if (err.name !== 'AbortError' && id===state.searchId) results.replaceChildren(create('div','city-empty','Recherche momentanément indisponible.')); }
  }
  input.addEventListener('input',()=>{
    clearTimeout(state.searchTimer);const q=input.value.trim();state.searchId++;
    if (state.searchController) state.searchController.abort();
    if(q.length<2){results.replaceChildren(create('div','city-empty','Saisissez au moins 2 caractères.'));return;}
    state.searchTimer=setTimeout(()=>searchCities(q),320);
  });
  input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();const first=results.querySelector('.city-result');if(first)first.click();else if(input.value.trim().length>=2)searchCities(input.value.trim());}});
  $('search-open').addEventListener('click',openDialog);
  $('insight-search').addEventListener('click',openDialog);
  $('dialog-close').addEventListener('click',closeDialog);
  dialog.addEventListener('click',event=>{if(event.target===dialog)closeDialog();});
  dialog.addEventListener('close',()=>{if(state.searchController)state.searchController.abort();});
  $('refresh-btn').addEventListener('click',()=>loadWeather(state.city));
  $('unit-btn').addEventListener('click',()=>{state.fahrenheit=!state.fahrenheit;secureStore.set(UNIT_KEY,String(state.fahrenheit));if(state.forecast)render(state.forecast);});
  function locate() {
    if (!navigator.geolocation) { notice('La géolocalisation n’est pas disponible sur ce navigateur.');return; }
    if (dialog.open) closeDialog();
    $('updated').textContent='Localisation en cours…';notice();
    navigator.geolocation.getCurrentPosition(pos=>{
      const latitude=pos.coords.latitude,longitude=pos.coords.longitude;
      if (!Number.isFinite(latitude)||!Number.isFinite(longitude)) {notice('Impossible de déterminer votre position.');return;}
      loadWeather({name:'Ma position',country:'Position actuelle',latitude,longitude});
    },()=>{notice('Position indisponible ou autorisation refusée. Vous pouvez chercher une ville manuellement.');$('updated').textContent=state.forecast?'Localisation non disponible':'Sélectionnez une ville';},{enableHighAccuracy:false,timeout:10000,maximumAge:300000});
  }
  $('locate-btn').addEventListener('click',locate);
  $('dialog-locate').addEventListener('click',locate);
  document.addEventListener('keydown',e=>{if(e.key==='/'&&!dialog.open&&!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)){e.preventDefault();openDialog();}});
  $('year').textContent=String(new Date().getFullYear());
  $('unit-btn').textContent=state.fahrenheit?'°F':'°C';
  loadWeather(state.city);
})();
