(() => {
  'use strict';
  const STORAGE_KEY = 'subletCampusMapDrafts.v1';
  function coordinates(longitude, latitude) {
    for (const value of [longitude, latitude]) {
      if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return null;
    }
    const lng = Number(longitude), lat = Number(latitude);
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
    return [lng, lat];
  }
  function inAlmaty(point) {
    return Boolean(point && point[0] >= 76.6 && point[0] <= 77.3 && point[1] >= 43 && point[1] <= 43.5);
  }
  function bounds(points) {
    if (!points.length) return null;
    return { southWest: [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1]))],
      northEast: [Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))] };
  }
  function readDrafts(raw) {
    const values = JSON.parse(raw || '[]');
    if (!Array.isArray(values) || values.length > 200) throw new Error('Invalid map drafts');
    const result = new Map();
    for (const value of values) {
      if (!value || typeof value.id !== 'string' || !value.id || !inAlmaty(coordinates(value.longitude, value.latitude))) throw new Error('Invalid map draft');
      result.set(value.id, { id: value.id, longitude: Number(value.longitude), latitude: Number(value.latitude) });
    }
    return result;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { coordinates, inAlmaty, bounds, readDrafts };
    return;
  }
  let sdkPromise;
  function loadSdk() {
    if (window.mapgl) return Promise.resolve(window.mapgl);
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://mapgl.2gis.com/api/js/v1';
      script.async = true;
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        script.onload = script.onerror = null;
        if (error) { script.remove(); reject(error); }
        else resolve(window.mapgl);
      };
      const timer = setTimeout(() => finish(new Error('Map script timed out')), 20000);
      script.onload = () => finish(window.mapgl ? null : new Error('Map library unavailable'));
      script.onerror = () => finish(new Error('Map script unavailable'));
      document.head.append(script);
    }).catch(error => { sdkPromise = null; throw error; });
    return sdkPromise;
  }
  function create({ onChange, onDetails, onSelect }) {
    const $ = id => document.getElementById(id);
    const config = window.SUBLET_MAP_CONFIG || {};
    const status = $('mapStatus');
    let map = null, ready = false, starting = false, generation = 0, watchdog = null;
    let items = [], markers = [], selected = null, editing = null, candidate = null, candidateMarker = null;
    let drafts = new Map(), writable = true;
    try { drafts = readDrafts(localStorage.getItem(STORAGE_KEY)); }
    catch (_) { writable = false; $('mapStorageNote').textContent = 'Local map drafts could not be read. Existing data has been preserved; draft saving is unavailable.'; }
    function text(tag, value, className) {
      const result = document.createElement(tag); result.textContent = value;
      if (className) result.className = className;
      return result;
    }
    function locationOf(item) {
      const draft = drafts.get(item.id);
      if (draft) return { point: coordinates(draft.longitude, draft.latitude), draft: true };
      const point = coordinates(item.longitude, item.latitude);
      return inAlmaty(point) ? { point, draft: false } : null;
    }
    function clearMarkers() {
      for (const entry of markers) entry.marker.destroy();
      markers = [];
    }
    function clearCandidate() {
      if (candidateMarker) candidateMarker.destroy();
      candidateMarker = null;
    }
    function clearMap() {
      clearTimeout(watchdog); clearMarkers(); clearCandidate();
      if (map) map.destroy();
      map = null; ready = false;
    }
    function failure() {
      ready = false; clearTimeout(watchdog);
      status.textContent = 'The map could not load. Check your connection, browser WebGL support, or the 2GIS key settings. Housing remains available.';
      $('mapRetry').hidden = false;
    }
    function updateSummary() {
      const count = items.filter(item => locationOf(item)).length;
      $('mapCount').textContent = `${count} of ${items.length} matching listings have map locations.`;
      $('mapEmpty').hidden = count !== 0;
    }
    function select(item, focusCard = false) {
      selected = item;
      const place = locationOf(item);
      const panel = $('mapSelection'); panel.replaceChildren(); panel.hidden = false;
      panel.append(text('h3', item.title), text('p', `${Number(item.price).toLocaleString('en-US')} KZT / month`),
        text('p', place ? place.draft ? 'Your location draft. Not published or verified.' : 'Location supplied with this listing. Not independently verified.' : 'No location has been provided.', 'muted'));
      const actions = document.createElement('div'); actions.className = 'map-actions';
      const details = text('button', 'View details', 'button secondary'); details.type = 'button';
      details.addEventListener('click', () => onDetails(item)); actions.append(details);
      if (place && place.draft) {
        const remove = text('button', 'Remove my location draft', 'button secondary'); remove.type = 'button';
        remove.addEventListener('click', () => {
          const next = new Map(drafts); next.delete(item.id);
          if (persist(next)) { cancelEdit(); onChange(); select(item); }
        }); actions.append(remove);
      }
      panel.append(actions);
      if (map && ready && place) { map.setCenter(place.point); map.setZoom(16); }
      for (const entry of markers) entry.button.setAttribute('aria-pressed', String(entry.id === item.id));
      if (focusCard) onSelect(item);
    }
    function draw() {
      updateSummary();
      if (!ready || !map) return;
      clearMarkers();
      try {
        for (const item of items) {
          const place = locationOf(item); if (!place) continue;
          const button = text('button', `${place.draft ? 'Draft · ' : ''}${Number(item.price).toLocaleString('en-US')} ₸`, 'map-price-pin');
          button.type = 'button';
          button.setAttribute('aria-label', `${item.title}, ${Number(item.price).toLocaleString('en-US')} tenge per month${place.draft ? ', location draft' : ''}`);
          button.setAttribute('aria-pressed', String(selected && selected.id === item.id));
          button.addEventListener('click', event => { event.stopPropagation(); select(item, true); });
          const marker = new window.mapgl.HtmlMarker(map, { coordinates: place.point, html: button, anchor: [0, 0], interactive: true });
          markers.push({ marker, id: item.id, button });
        }
      } catch (_) { failure(); }
    }
    function fit() {
      if (!map || !ready) return;
      const points = items.map(locationOf).filter(Boolean).map(place => place.point);
      if (!points.length) { map.setCenter(config.center); map.setZoom(config.zoom); return; }
      if (points.length === 1) { map.setCenter(points[0]); map.setZoom(15); return; }
      map.fitBounds(bounds(points), { padding: { top: 60, bottom: 60, left: 80, right: 100 }, maxZoom: 16 });
    }
    async function start() {
      if (ready || starting) return;
      starting = true; const token = ++generation;
      clearMap(); $('mapRetry').hidden = true;
      status.textContent = 'Loading the Almaty map…';
      try {
        if (typeof config.key !== 'string' || !config.key.trim()) throw new Error('Missing map key');
        const sdk = await loadSdk();
        if (token !== generation) return;
        map = new sdk.Map('housingMap', { key: config.key, center: config.center, zoom: config.zoom, pitch: 0, rotation: 0 });
        watchdog = setTimeout(() => { if (!ready) failure(); }, 25000);
        map.on('styleload', () => {
          if (token !== generation) return;
          clearTimeout(watchdog); ready = true;
          status.textContent = 'Explore Almaty. Use a price pin to select housing.';
          $('mapRetry').hidden = true; draw(); fit();
          if (selected && locationOf(selected)) select(selected);
          if (candidate) setCandidate(candidate);
        });
        const mapError = () => { if (token === generation) failure(); };
        map.on('styleloaderror', mapError);
        map.on('error', mapError);
        map.on('click', event => {
          if (editing && event.lngLat) setCandidate(event.lngLat);
        });
        map.getCanvas().addEventListener('webglcontextlost', mapError);
      } catch (_) { failure(); }
      finally { starting = false; }
    }
    function reveal() {
      $('mapPanel').hidden = false;
      $('housingLayout').classList.add('with-map');
      $('toggleMap').setAttribute('aria-expanded', 'true');
      $('toggleMap').textContent = 'Hide map';
      if (map) map.invalidateSize(); else start();
    }
    function persist(next) {
      if (!writable) { $('mapEditorStatus').textContent = 'Browser storage is unavailable. Your previous drafts have been preserved.'; return false; }
      if (next.size > 200) { $('mapEditorStatus').textContent = 'The local draft limit has been reached.'; return false; }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...next.values()])); drafts = next; return true; }
      catch (_) { $('mapEditorStatus').textContent = 'The location could not be saved. Browser storage may be full or disabled.'; return false; }
    }
    function setCandidate(point) {
      const parsed = point && coordinates(point[0], point[1]);
      if (!inAlmaty(parsed)) { $('mapEditorStatus').textContent = 'Choose a point in the Almaty area.'; return false; }
      candidate = parsed;
      $('draftLongitude').value = parsed[0].toFixed(6); $('draftLatitude').value = parsed[1].toFixed(6);
      $('mapEditorStatus').textContent = 'Draft pin selected. Save it to keep this location in your browser.';
      clearCandidate();
      if (map && ready) candidateMarker = new window.mapgl.HtmlMarker(map, {
        coordinates: parsed, html: text('span', 'New draft', 'map-price-pin candidate-pin'), interactive: false
      });
      return true;
    }
    function cancelEdit() {
      editing = null; candidate = null; clearCandidate();
      $('mapEditor').hidden = true; $('mapEditorStatus').textContent = '';
      $('draftLatitude').value = ''; $('draftLongitude').value = '';
    }
    function choose(item) {
      reveal(); cancelEdit(); editing = item;
      $('mapEditor').hidden = false; $('mapEditorTitle').textContent = `Location draft: ${item.title}`;
      const place = locationOf(item); if (place) setCandidate(place.point);
      $('mapPanel').scrollIntoView({ block: 'start', behavior: 'auto' });
      $('draftLatitude').focus({ preventScroll: true });
    }
    $('mapDraftForm').addEventListener('submit', event => {
      event.preventDefault(); if (!editing) return;
      if (!setCandidate([$('draftLongitude').value, $('draftLatitude').value])) return;
      const item = editing, next = new Map(drafts);
      next.set(item.id, { id: item.id, longitude: candidate[0], latitude: candidate[1] });
      if (persist(next)) { cancelEdit(); onChange(); select(item); $('mapStatus').textContent = 'Location draft saved in this browser. It has not been published.'; }
    });
    $('cancelMapDraft').addEventListener('click', cancelEdit);
    $('fitMap').addEventListener('click', () => { reveal(); fit(); });
    $('mapRetry').addEventListener('click', start);
    $('toggleMap').addEventListener('click', () => {
      if ($('mapPanel').hidden) reveal();
      else {
        cancelEdit(); $('mapPanel').hidden = true; $('housingLayout').classList.remove('with-map');
        $('toggleMap').setAttribute('aria-expanded', 'false'); $('toggleMap').textContent = 'Show map';
      }
    });
    let resizeFrame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => { if (map && !$('mapPanel').hidden) map.invalidateSize(); });
    });
    observer.observe($('housingMap'));
    window.addEventListener('pagehide', () => { generation++; observer.disconnect(); cancelAnimationFrame(resizeFrame); clearMap(); });
    window.addEventListener('pageshow', event => {
      if (event.persisted) { starting = false; observer.observe($('housingMap')); if (!$('mapPanel').hidden) start(); }
    });
    return {
      update(next) {
        items = next;
        if (editing && !items.some(item => item.id === editing.id)) cancelEdit();
        if (selected && !items.some(item => item.id === selected.id)) { selected = null; $('mapSelection').hidden = true; }
        draw();
      },
      hasLocation: item => Boolean(locationOf(item)),
      isDraft: item => Boolean(drafts.get(item.id)),
      locate(item) { reveal(); select(item); $('mapPanel').scrollIntoView({ block: 'start', behavior: 'auto' }); },
      choose
    };
  }
  window.SubletHousingMap = { create };
})();
