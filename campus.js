(() => {
  'use strict';
  const domains = ['almau.edu.kz', 'kimep.kz', 'kaznu.kz', 'kaznu.edu.kz', 'satbayev.university', 'narxoz.kz', 'iitu.edu.kz'];
  function checkEmail(input) {
    const email = String(input || '').trim().toLowerCase();
    const parts = email.split('@');
    const local = parts[0];
    if (email.length > 254 || parts.length !== 2 || !local || local.length > 64 ||
        !/^[a-z0-9!#$%&'*+\-/=?^_`{|}~.]+$/.test(local) ||
        local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
      return { ok: false, email, message: 'Enter a complete university email address.' };
    }
    if (!domains.includes(parts[1])) {
      return { ok: false, email, message: 'Use an email from a supported university. Personal email addresses are not accepted.' };
    }
    return { ok: true, email };
  }
  function category(value) {
    const text = String(value || '').toLowerCase();
    if (text.includes('dorm')) return 'Dormitory';
    if (text.includes('shared')) return 'Shared';
    if (text.includes('studio')) return 'Studio';
    if (text.includes('apartment') || text.includes('flat')) return 'Flat';
    return 'Other';
  }
  function matches(item, university, type, search) {
    return (university === 'All' || item.university === university) &&
      (type === 'All' || item.category === type) &&
      `${item.title} ${item.university} ${item.details}`.toLowerCase().includes(search.trim().toLowerCase());
  }
  function databaseRecord(row) {
    if (!row || row.id == null || row.status !== 'approved' ||
        row.price == null || String(row.price).trim() === '' ||
        !Number.isFinite(Number(row.price)) || Number(row.price) < 0) return null;
    return { id: `api:${row.id}`, title: String(row.title || 'Housing listing'),
      university: String(row.university || 'Other'), category: category(row.housing_type),
      price: Number(row.price), details: `${row.address || 'Address not provided'}. Type: ${row.housing_type || 'Not specified'}.`,
      source: 'database' };
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { checkEmail, category, matches, databaseRecord };
    return;
  }
  const $ = id => document.getElementById(id);
  const money = value => `${Number(value).toLocaleString('en-US')} KZT / month`;
  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  let queue = Promise.resolve();
  function message(title, body, action = 'Got it', cancellable = false) {
    const task = () => new Promise(resolve => {
      const previous = document.activeElement;
      const dialog = node('dialog', undefined, 'campus-dialog');
      dialog.setAttribute('aria-labelledby', 'dialog-title');
      dialog.setAttribute('aria-describedby', 'dialog-body');
      const heading = node('h2', title); heading.id = 'dialog-title';
      const content = node('p', body); content.id = 'dialog-body';
      const buttons = node('div', undefined, 'dialog-actions');
      const confirm = node('button', action, 'button');
      confirm.type = 'button';
      confirm.autofocus = true;
      confirm.addEventListener('click', () => dialog.close('yes'));
      if (cancellable) {
        const cancel = node('button', 'Cancel', 'button secondary');
        cancel.type = 'button';
        cancel.addEventListener('click', () => dialog.close('no'));
        buttons.append(cancel);
      }
      buttons.append(confirm); dialog.append(heading, content, buttons);
      dialog.addEventListener('close', () => {
        const accepted = dialog.returnValue === 'yes';
        dialog.remove();
        if (previous && previous.isConnected) previous.focus();
        resolve(accepted);
      }, { once: true });
      document.body.append(dialog); dialog.showModal();
    });
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  }
  function session() {
    try {
      const value = localStorage.getItem('userEmail');
      if (value && checkEmail(value).ok) return checkEmail(value).email;
      if (value) localStorage.removeItem('userEmail');
    } catch (_) { /* Browsing remains available when storage is disabled. */ }
    return null;
  }
  const email = session();
  document.querySelectorAll('[data-account]').forEach(link => {
    link.textContent = email ? 'Leave gateway' : 'Student Gateway';
    if (email) link.addEventListener('click', async event => {
      event.preventDefault();
      if (!(await message('Leave the gateway?', 'Your saved housing and profile will stay in this browser.', 'Leave gateway', true))) return;
      try { localStorage.removeItem('userEmail'); location.href = 'index.html'; }
      catch (_) { await message('Could not leave', 'Browser storage is unavailable. Please check your browser settings.'); }
    });
  });
  if ($('loginForm')) {
    $('supportedDomains').textContent = domains.map(domain => `@${domain}`).join(', ');
    $('loginForm').addEventListener('submit', async event => {
      event.preventDefault();
      const button = $('loginButton');
      if (button.disabled) return;
      button.disabled = true;
      try {
        const result = checkEmail($('emailInput').value);
        $('emailInput').setAttribute('aria-invalid', String(!result.ok));
        $('emailError').textContent = result.ok ? '' : result.message;
        if (!result.ok) {
          await message('University email required', result.message);
          $('emailInput').focus(); return;
        }
        if (!(await message('Continue to housing', `The domain for ${result.email} is supported. Email ownership has not been verified.`, 'Browse housing', true))) return;
        try { localStorage.setItem('userEmail', result.email); }
        catch (_) { await message('Could not save your session', 'Allow browser storage and try again.'); return; }
        location.href = 'discovery.html';
      } finally { button.disabled = false; }
    });
    $('emailInput').addEventListener('input', () => {
      $('emailInput').removeAttribute('aria-invalid'); $('emailError').textContent = '';
    });
  }
  if (!$('listingsGrid')) return;
  const sampleRows = [
    ['almau', 'Modern Studio near AlmaU', 'AlmaU', 'Studio', 180000, '10 mins walk to AlmaU. Alatau Metro: 5 mins. Mega Mall: 7 mins.', '1502672260266-1c1ef2d93688'],
    ['kimep', 'Cozy Shared Apartment near KIMEP', 'KIMEP', 'Shared', 140000, '8 mins walk to KIMEP. Almaly Metro: 3 mins. Dostyk Plaza: 12 mins.', '1560448204-e02f11c3d0e2'],
    ['satbayev', 'Luxury 1-Bedroom Flat near Satbayev', 'Satbayev', 'Flat', 210000, '12 mins walk to Satbayev and IITU. Baikonur Metro: 6 mins. Globus Mall: 5 mins.', '1522708323590-d24dbb6b0267'],
    ['kaznu', 'Student Dorm Bed near KazNU', 'KazNU', 'Dormitory', 90000, 'KazNU campus: 3 mins walk. Bus stop: 2 mins. Botanic Garden: 5 mins.', '1555854877-bab0e564b8d5'],
    ['narhoz', 'Modern 1-Bedroom near Narhoz', 'Narhoz', 'Flat', 160000, 'Narhoz University: 5 mins walk. Moscow Metro: 10 mins. Grand Park: 8 mins.', '1540518614846-7ede433c4ef0'],
    ['iitu', 'Tech Studio near IITU', 'IITU', 'Studio', 195000, 'IITU and Mega Center: 4 mins walk. Sayran Metro: 12 mins. Mega Alma-Ata: 4 mins.', '1512917774080-9991f1c4c750']
  ];
  const samples = sampleRows.map(([id, title, university, type, price, details, photo]) =>
    ({ id: `sample:${id}`, title, university, category: type, price, details, photo, source: 'sample' }));
  let items = [...samples], saved = [], storageError = false, loading = false;
  try {
    const parsed = JSON.parse(localStorage.getItem('savedListings') || '[]');
    if (!Array.isArray(parsed) || parsed.some(item => !item || typeof item !== 'object' ||
      typeof item.university !== 'string' || !['number', 'string'].includes(typeof item.price))) throw new Error('Invalid saved data');
    saved = parsed.map((item, index) => {
      const price = typeof item.price === 'number' ? item.price : Number(item.price.replace(/[^0-9.]/g, ''));
      if (!Number.isFinite(price) || price < 0) throw new Error('Invalid saved price');
      const known = samples.find(row => row.university === item.university && row.price === price);
      return known || { id: String(item.id || `legacy:${index}`), title: String(item.title || 'Previously saved housing'),
        university: item.university, category: String(item.category || 'Other'), price,
        details: String(item.details || ''), source: String(item.source || 'legacy') };
    });
    saved = saved.filter((item, index, all) => all.findIndex(row => row.id === item.id) === index);
  } catch (_) {
    storageError = true;
    $('savedNotice').textContent = 'Saved housing could not be read. Existing data has been left untouched. Saving is unavailable until browser storage is repaired.';
  }
  function writeSaved(next) {
    if (storageError) { message('Saved housing unavailable', $('savedNotice').textContent); return false; }
    try { localStorage.setItem('savedListings', JSON.stringify(next)); saved = next; return true; }
    catch (_) { message('Could not save changes', 'Browser storage may be full or disabled. Your existing saved housing has not been removed.'); return false; }
  }
  function savedItem(item) { return saved.some(row => row.id === item.id); }
  function toggle(item) {
    const removing = savedItem(item);
    if (!writeSaved(removing ? saved.filter(row => row.id !== item.id) : [...saved, item])) return;
    const active = document.activeElement;
    const focusId = active && active.dataset.saveId;
    const fromSaved = active && $('savedHousingList').contains(active);
    render();
    $('actionStatus').textContent = `${item.title} ${removing ? 'removed from' : 'added to'} saved housing.`;
    const scope = fromSaved ? $('savedHousingList') : $('listingsGrid');
    const replacement = [...scope.querySelectorAll('[data-save-id]')].find(button => button.dataset.saveId === focusId);
    if (replacement) replacement.focus(); else $('savedHeading').focus();
  }
  function saveButton(item, inSaved = false) {
    const button = node('button', inSaved ? 'Remove' : savedItem(item) ? 'Saved' : 'Save', 'button secondary');
    button.type = 'button'; button.dataset.saveId = item.id;
    button.setAttribute('aria-label', `${inSaved || savedItem(item) ? 'Remove' : 'Save'} ${item.title}`);
    if (!inSaved) button.setAttribute('aria-pressed', String(savedItem(item)));
    button.addEventListener('click', () => toggle(item)); return button;
  }
  function render() {
    const filtered = items.filter(item => matches(item, $('uniFilter').value, $('categoryFilter').value, $('searchInput').value));
    const sort = $('sortFilter').value;
    if (sort !== 'default') filtered.sort((a, b) => sort === 'low' ? a.price - b.price : b.price - a.price);
    $('resultCount').textContent = `${filtered.length} ${filtered.length === 1 ? 'listing' : 'listings'}`;
    $('noResults').hidden = filtered.length !== 0;
    $('listingsGrid').replaceChildren();
    for (const item of filtered) {
      const card = node('article', undefined, 'listing-card');
      let media = node('div', 'Database listing', 'listing-media placeholder');
      if (item.photo) {
        media = node('img', undefined, 'listing-media');
        media.src = `https://images.unsplash.com/photo-${item.photo}?auto=format&fit=crop&w=600&q=80`;
        media.alt = ''; media.loading = 'lazy';
      }
      const body = node('div', undefined, 'listing-body');
      const badge = node('span', item.source === 'sample' ? 'Sample property' : 'Database record', 'badge');
      const details = node('button', 'View details', 'button'); details.type = 'button';
      details.setAttribute('aria-label', `View details for ${item.title}`);
      details.addEventListener('click', () => message(item.title,
        `${money(item.price)}\n\n${item.details}\n\n${item.source === 'sample' ? 'Sample property. Photos, distances and prices are illustrative.' : 'Approved database record. Approval does not verify that a property is genuine.'}\n\nOwner contact details are not available in this prototype.`));
      const actions = node('div', undefined, 'card-actions'); actions.append(saveButton(item), details);
      body.append(badge, node('h3', item.title), node('p', money(item.price), 'price'), node('p', item.details, 'muted'), actions);
      card.append(media, body); $('listingsGrid').append(card);
    }
    $('savedHousingList').replaceChildren();
    if (!saved.length) $('savedHousingList').append(node('p', storageError ? 'Saved housing unavailable.' : 'No saved housing yet. Save a room to keep it here.', 'muted'));
    for (const item of saved) {
      const row = node('article', undefined, 'saved-row');
      const known = items.find(candidate => candidate.id === item.id ||
        (item.id.startsWith('legacy:') && candidate.university === item.university && candidate.price === item.price));
      const info = node('div');
      info.append(node('h3', known ? known.title : item.title), node('p', money(item.price)), node('p', item.university, 'muted'));
      row.append(info, saveButton(item, true)); $('savedHousingList').append(row);
    }
  }
  for (const id of ['uniFilter', 'categoryFilter', 'sortFilter']) $(id).addEventListener('change', render);
  $('searchInput').addEventListener('input', render);
  $('resetFilters').addEventListener('click', () => {
    $('uniFilter').value = 'All'; $('categoryFilter').value = 'All';
    $('sortFilter').value = 'default'; $('searchInput').value = ''; render();
  });
  async function loadListings() {
    if (loading) return;
    loading = true; $('retryApi').disabled = true; $('apiStatus').textContent = 'Loading database housing. Sample rooms are available below.';
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch('https://sublet-campus.onrender.com/api/listings', { signal: controller.signal });
      if (!response.ok) throw new Error('HTTP failure');
      const result = await response.json();
      if (result.status !== 'success' || !Array.isArray(result.data)) throw new Error('Invalid response');
      const records = result.data.map(databaseRecord).filter(Boolean);
      const unique = [...new Map(records.map(item => [item.id, item])).values()];
      items = [...unique, ...samples];
      saved = saved.map(item => item.id.startsWith('legacy:') ?
        (unique.find(row => row.university === item.university && row.price === item.price) || item) : item);
      saved = saved.filter((item, index, all) => all.findIndex(row => row.id === item.id) === index);
      for (const item of unique) if (!Array.from($('uniFilter').options).some(option => option.value === item.university)) {
        const option = node('option', item.university); option.value = item.university; $('uniFilter').append(option);
      }
      $('apiStatus').textContent = unique.length ? `${unique.length} database ${unique.length === 1 ? 'record' : 'records'} loaded. Sample properties are labelled separately.` : 'No usable approved database records returned. Sample properties are shown below.';
      render();
    } catch (_) {
      $('apiStatus').textContent = 'Database housing could not be loaded. You can still browse the rooms already shown. Try again shortly.';
    } finally { clearTimeout(timer); loading = false; $('retryApi').disabled = false; }
  }
  $('retryApi').addEventListener('click', loadListings);
  render(); loadListings();
})();
