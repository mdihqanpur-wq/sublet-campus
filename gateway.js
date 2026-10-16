(async () => {
  'use strict';
  const auth = window.SubletAuth, $ = id => document.getElementById(id);
  const next = auth.returnPage(new URLSearchParams(location.search).get('next'));
  let mode = 'login', pendingEmail = '', pendingNames = null, busy = false, resendAt = 0;
  function setMode(value) {
    mode = value;
    $('nameFields').hidden = mode !== 'signup';
    $('firstName').required = mode === 'signup'; $('lastName').required = mode === 'signup';
    $('loginTab').setAttribute('aria-pressed', String(mode === 'login'));
    $('signupTab').setAttribute('aria-pressed', String(mode === 'signup'));
    $('gatewayTitle').textContent = mode === 'signup' ? 'Create your account' : 'Welcome back';
    $('loginButton').textContent = 'Send verification code';
    $('emailError').textContent = '';
  }
  function setBusy(value) {
    busy = value;
    for (const id of ['loginButton', 'verifyButton', 'changeEmail', 'loginTab', 'signupTab']) $(id).disabled = value;
    updateResend();
  }
  function updateResend() {
    const seconds = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
    $('resendCode').disabled = busy || seconds > 0 || !pendingEmail;
    $('resendCode').textContent = seconds ? `Resend code in ${seconds}s` : 'Resend code';
  }
  async function problem(title, error, fallback) {
    const text = typeof error === 'string' ? error : auth.publicError(error, fallback);
    $('emailError').textContent = text;
    await auth.message(title, text);
  }
  $('supportedDomains').textContent = Object.keys(auth.universities).map(domain => `@${domain}`).join(', ');
  $('loginTab').addEventListener('click', () => setMode('login'));
  $('signupTab').addEventListener('click', () => setMode('signup'));
  $('emailInput').addEventListener('input', () => {
    $('emailInput').removeAttribute('aria-invalid'); $('emailError').textContent = '';
  });
  $('loginForm').addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    const result = auth.checkEmail($('emailInput').value);
    $('emailInput').setAttribute('aria-invalid', String(!result.ok));
    if (!result.ok) { await problem('University email required', result.message); $('emailInput').focus(); return; }
    if (!$('loginForm').reportValidity()) return;
    const first = $('firstName').value.trim(), last = $('lastName').value.trim();
    if (mode === 'signup' && (!first || !last)) { await problem('Add your name', 'Enter your first and last name to create an account.'); return; }
    if (!auth.client) { await problem('Could not connect', 'Refresh the page and check your internet connection.'); return; }
    setBusy(true);
    try {
      const { error } = await auth.client.auth.signInWithOtp({ email: result.email, options: { shouldCreateUser: mode === 'signup' } });
      if (error) throw error;
      pendingEmail = result.email;
      pendingNames = mode === 'signup' ? { first_name: first, last_name: last, display_name: first } : null;
      $('loginForm').hidden = true; $('authTabs').hidden = true;
      $('codeForm').hidden = false; $('codeDestination').textContent = pendingEmail;
      $('deliveryNote').textContent = 'Check your inbox and spam folder. If you don’t have an account yet, choose Create account.';
      resendAt = Date.now() + 60000; $('otpInput').focus();
    } catch (error) {
      await problem('Could not send a code', error, 'We couldn’t send a code. Check your email address, or choose Create account if you’re new here.');
    } finally { setBusy(false); }
  });
  $('codeForm').addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !pendingEmail) return;
    const token = $('otpInput').value.trim();
    if (!auth.validCode(token)) { await problem('Check your code', 'Enter the six-digit code from your latest email.'); return; }
    setBusy(true);
    try {
      const { data, error } = await auth.client.auth.verifyOtp({ email: pendingEmail, token, type: 'email' });
      if (error) throw error;
      if (!data.user?.id || !data.session) throw new Error('Missing session');
      const { error: initError } = await auth.client.rpc('initialize_student_account');
      if (initError) throw initError;
      const { data: rows, error: accessError } = await auth.client.rpc('my_student_account');
      if (accessError) throw accessError;
      if (!rows?.[0]?.has_access) throw Object.assign(new Error('Access denied'), { code: '42501' });
      let profileSaved = true;
      if (pendingNames) {
        const result = await auth.client.from('student_profiles').update(pendingNames).eq('user_id', data.user.id).select('user_id').single();
        profileSaved = !result.error && !!result.data;
      }
      $('otpInput').value = '';
      await auth.message('Welcome to SubletCampus', pendingNames
        ? profileSaved ? 'Your university email is verified. You can finish your account details now or come back later.'
          : 'Your email is verified. Your name could not be saved, but you can add it on the account page.'
        : 'You’re signed in. Your housing search is ready.', 'Continue');
      location.assign(pendingNames ? 'account.html?welcome=1' : next);
    } catch (error) {
      await problem('Could not verify your account', error, 'That code could not be verified. Use the latest email or request a new code.');
    } finally { setBusy(false); }
  });
  $('resendCode').addEventListener('click', async () => {
    if (busy || Date.now() < resendAt || !pendingEmail) return;
    setBusy(true);
    try {
      const { error } = await auth.client.auth.signInWithOtp({ email: pendingEmail, options: { shouldCreateUser: mode === 'signup' } });
      if (error) throw error;
      resendAt = Date.now() + 60000; $('otpInput').value = '';
      $('deliveryNote').textContent = 'A new code was requested. Use the most recent email.';
    } catch (error) { await problem('Could not resend the code', error, 'Please wait a little and try again.'); }
    finally { setBusy(false); }
  });
  $('changeEmail').addEventListener('click', () => {
    pendingEmail = ''; pendingNames = null;
    $('codeForm').hidden = true; $('loginForm').hidden = false; $('authTabs').hidden = false;
    $('otpInput').value = ''; $('emailError').textContent = ''; $('emailInput').focus();
  });
  setInterval(updateResend, 1000);
  $('signOutHere').addEventListener('click', auth.signOut);
  setBusy(true);
  try {
    const account = await auth.ready;
    if (account) {
      $('gatewayForms').hidden = true; $('existingAccount').hidden = false;
      $('signedInEmail').textContent = account.email; $('continueHousing').href = next;
    }
  } catch (_) {
    $('connectionNote').hidden = false;
  } finally { setBusy(false); }
})();
