(() => {
  'use strict';
  const universities = Object.freeze({
    'almau.edu.kz': 'AlmaU', 'kimep.kz': 'KIMEP', 'kaznu.kz': 'KazNU',
    'kaznu.edu.kz': 'KazNU', 'satbayev.university': 'Satbayev',
    'narxoz.kz': 'Narxoz', 'iitu.edu.kz': 'IITU'
  });
  function checkEmail(input) {
    const email = String(input || '').trim().toLowerCase();
    const parts = email.split('@'), local = parts[0];
    if (email.length > 254 || parts.length !== 2 || !local || local.length > 64 ||
      !/^[a-z0-9!#$%&'*+\-/=?^_`{|}~.]+$/.test(local) ||
      local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
      return { ok: false, email, message: 'Enter a complete university email address.' };
    }
    if (!Object.hasOwn(universities, parts[1])) {
      return { ok: false, email, message: 'Use an email from a supported university. Personal email addresses are not accepted.' };
    }
    return { ok: true, email };
  }
  function returnPage(value) {
    return ['discovery.html', 'match.html', 'account.html'].includes(value) ? value : 'discovery.html';
  }
  function validCode(value) { return /^[0-9]{6}$/.test(String(value || '').trim()); }
  function publicError(error, fallback = 'Something went wrong. Please try again.') {
    if (error?.code === 'otp_expired') return 'That code has expired or is incorrect. Request a new code and try again.';
    if (error?.status === 429 || /rate_limit/.test(error?.code || '')) return 'Too many requests. Wait a little before trying again.';
    if (error?.code === '42501') return 'Your account needs a verified university email and active student access.';
    if (error?.code === 'email_address_not_authorized' || error?.code === 'unexpected_failure') return 'The verification email could not be sent. Please try again later.';
    return fallback;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { universities, checkEmail, returnPage, validCode, publicError };
    return;
  }
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function message(title, text, action = 'Got it') {
    return new Promise(resolve => {
      const previous = document.activeElement;
      const dialog = element('dialog', undefined, 'campus-dialog');
      const heading = element('h2', title), body = element('p', text);
      heading.id = 'auth-dialog-title'; body.id = 'auth-dialog-body';
      dialog.setAttribute('aria-labelledby', heading.id);
      dialog.setAttribute('aria-describedby', body.id);
      const button = element('button', action, 'button'); button.type = 'button';
      button.addEventListener('click', () => dialog.close());
      dialog.append(heading, body, button);
      dialog.addEventListener('close', () => {
        dialog.remove();
        if (previous?.isConnected) previous.focus();
        resolve();
      }, { once: true });
      document.body.append(dialog); dialog.showModal(); button.focus();
    });
  }
  let client = null;
  try {
    client = window.supabase.createClient(window.SUBLET_AUTH_CONFIG.url, window.SUBLET_AUTH_CONFIG.publishableKey, {
      auth: { storageKey: 'subletcampus.auth.v1', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      global: { fetch: async (input, init = {}) => {
        const controller = new AbortController();
        const abort = () => controller.abort();
        init.signal?.addEventListener('abort', abort, { once: true });
        if (init.signal?.aborted) abort();
        const timer = setTimeout(abort, 20000);
        try { return await fetch(input, { ...init, signal: controller.signal }); }
        finally { clearTimeout(timer); init.signal?.removeEventListener('abort', abort); }
      } }
    });
  } catch (_) { /* The page shows a connection error below. */ }
  const protectedPage = document.body.hasAttribute('data-student-page');
  let current = null;
  async function loadAccount() {
    if (!client) throw new Error('Auth client unavailable');
    const { data: { session }, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session) return null;
    const { data: { user }, error } = await client.auth.getUser();
    if (error) throw error;
    if (!user || user.is_anonymous || !user.email_confirmed_at || !checkEmail(user.email).ok) {
      throw Object.assign(new Error('University email required'), { code: '42501' });
    }
    const { error: initError } = await client.rpc('initialize_student_account');
    if (initError) throw initError;
    const { data, error: accountError } = await client.rpc('my_student_account');
    if (accountError) throw accountError;
    if (!data?.[0]?.has_access || data[0].user_id !== user.id) {
      throw Object.assign(new Error('Account unavailable'), { code: '42501' });
    }
    current = { ...data[0], email: user.email, user };
    return current;
  }
  async function signOut() {
    if (!client) { location.replace('index.html'); return; }
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) { await message('Could not sign out', 'Please check your connection and try again.'); return; }
    current = null;
    location.replace('index.html');
  }
  function showBlocked(error) {
    const status = document.getElementById('authLoading');
    if (!status) return;
    status.replaceChildren(element('h1', 'We couldn’t open your account'));
    status.append(element('p', publicError(error, 'Check your connection and try again. If the problem continues, contact the project team.')));
    const retry = element('button', 'Try again', 'button'); retry.type = 'button';
    retry.addEventListener('click', () => location.reload());
    const logout = element('button', 'Sign out', 'button secondary'); logout.type = 'button';
    logout.addEventListener('click', signOut);
    status.append(retry, document.createTextNode(' '), logout);
  }
  async function requireStudent() {
    try {
      const account = await ready;
      if (!account) {
        const page = returnPage(location.pathname.split('/').pop());
        location.replace(`index.html?next=${encodeURIComponent(page)}`); return null;
      }
      document.getElementById('authLoading')?.remove();
      document.querySelectorAll('[data-student-content]').forEach(node => { node.hidden = false; });
      return account;
    } catch (error) { showBlocked(error); return null; }
  }
  const ready = loadAccount();
  ready.catch(() => {});
  document.querySelectorAll('[data-account]').forEach(link => {
    link.textContent = 'Sign out';
    link.addEventListener('click', event => { event.preventDefault(); signOut(); });
  });
  client?.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT' && protectedPage) {
      document.querySelectorAll('[data-student-content]').forEach(node => { node.hidden = true; });
      location.replace('index.html');
    }
  });
  window.SubletAuth = { client, ready, requireStudent, signOut, message, checkEmail, returnPage, validCode, publicError, universities };
})();
