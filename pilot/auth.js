'use strict';

const authUI = (() => {
  const config = window.expensesConfig;
  const get = id => document.getElementById(id);
  const categoryCache = 'expenses-mobile-categories';
  const offlineIdentity = 'expenses-mobile-offline-identity';
  let identity = null;
  let receiptSession = null;
  let busy = false;

  function cachedCategories() {
    try {
      return JSON.parse(localStorage.getItem(categoryCache)) || [];
    } catch {
      return [];
    }
  }

  function openWorkspace(user, categories, offline) {
    identity = user;
    get('operator').value = user.email;
    get('category').replaceChildren(...categories.map(category =>
      new Option(category.name, category.name)
    ));
    get('authPanel').classList.add('hidden');
    get('workspace').classList.remove('hidden');
    get('network').textContent = offline
      ? 'Offline · using saved categories on this device'
      : 'Signed in · expenses and photos are saved on this device';
  }

  async function request(path, options = {}) {
    const response = await fetch(new URL(path, config.url), {
      ...options,
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
      headers: { apikey: config.publishableKey, ...options.headers }
    });
    if (!response.ok) throw new Error(String(response.status));
    return response.json();
  }

  function handleInvitation() {
    const query = new URLSearchParams(location.search);
    const fragment = new URLSearchParams(location.hash.slice(1));
    const activationPath = query.has('activate');
    if (!activationPath && fragment.get('type') !== 'invite') return;

    // Remove tokens and errors before anyone can copy the URL.
    history.replaceState(null, '', location.pathname);
    get('authPanel').classList.add('hidden');
    get('activatePanel').classList.remove('hidden');
    let token = fragment.get('type') === 'invite' && fragment.get('access_token');
    if (!token || !config?.publishableKey?.startsWith('sb_publishable_')) {
      get('activateForm').classList.add('hidden');
      get('activationMessage').textContent =
        'This invitation is invalid or has expired. Ask your administrator for a new invitation.';
      return;
    }

    get('activateForm').onsubmit = async event => {
      event.preventDefault();
      if (!token || busy) return;
      const passwordField = get('newPassword');
      const confirmField = get('confirmPassword');
      const message = get('activationMessage');
      const password = passwordField.value;
      if (password !== confirmField.value) {
        message.textContent = 'The passwords do not match.';
        return;
      }
      if (password.length < 8) {
        message.textContent = 'Use at least eight characters.';
        return;
      }
      busy = true;
      get('activate').disabled = true;
      message.textContent = 'Setting your password…';
      try {
        await request('/auth/v1/user', {
          method: 'PUT',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ password })
        });
        token = null;
        get('activateForm').classList.add('hidden');
        message.textContent = 'Password set. You can now sign in.';
      } catch (error) {
        if (error.message === '401' || error.message === '403') {
          token = null;
          get('activateForm').classList.add('hidden');
          message.textContent = 'This invitation has expired. Ask your administrator for a new invitation.';
        } else {
          message.textContent = 'Could not set the password. Check your connection and try again.';
        }
      } finally {
        passwordField.value = '';
        confirmField.value = '';
        busy = false;
        get('activate').disabled = false;
      }
    };
  }

  handleInvitation();

  get('loginForm').onsubmit = async event => {
    event.preventDefault();
    if (busy) return;
    if (!config?.url || !config.publishableKey?.startsWith('sb_publishable_')) {
      get('authMessage').textContent = 'Supabase configuration is missing.';
      return;
    }
    if (!navigator.onLine) {
      get('authMessage').textContent = 'Connect to the internet to sign in.';
      return;
    }

    busy = true;
    get('signIn').disabled = true;
    get('authMessage').textContent = 'Signing in…';
    const email = get('email').value.trim();
    const password = get('password').value;
    get('password').value = '';
    try {
      const session = await request('/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const rows = await request('/rest/v1/expense_categories?select=id,name&active=eq.true&order=id.asc', {
        headers: { Authorization: 'Bearer ' + session.access_token }
      });
      const user = { id: session.user.id, email: session.user.email };
      if (get('trustDevice').checked) {
        localStorage.setItem(categoryCache, JSON.stringify(rows));
        localStorage.setItem(offlineIdentity, JSON.stringify(user));
      } else {
        localStorage.removeItem(categoryCache);
        localStorage.removeItem(offlineIdentity);
      }
      const headers = { Authorization: 'Bearer ' + session.access_token };
      try {
        const admins = await request('/rest/v1/expense_admins?select=user_id&limit=1', { headers });
        if (admins.length) receiptSession = { headers, rows };
      } catch {
        // Local expense entry remains available if the role check fails.
      }
      openWorkspace(user, rows, false);
      get('authMessage').textContent = '';
    } catch (error) {
      get('authMessage').textContent = error.message === '400'
        ? 'Sign-in failed. Check your email and password.'
        : 'Could not sign in and load categories. Try again when connected.';
    } finally {
      busy = false;
      get('signIn').disabled = false;
    }
  };

  function offerOffline() {
    get('continueOffline').classList.toggle('hidden',
      navigator.onLine || !localStorage.getItem(offlineIdentity));
  }

  get('continueOffline').onclick = () => {
    if (navigator.onLine) return;
    const user = JSON.parse(localStorage.getItem(offlineIdentity) || 'null');
    if (user?.id && user.email) openWorkspace(user, cachedCategories(), true);
  };

  get('signOut').onclick = () => {
    localStorage.removeItem(categoryCache);
    localStorage.removeItem(offlineIdentity);
    location.reload();
  };

  addEventListener('online', offerOffline);
  addEventListener('offline', offerOffline);
  offerOffline();
  return {
    currentUser: () => identity,
    canUploadReceipts: () => Boolean(receiptSession),
    async uploadReceipt(record, page, jpeg) {
      const category = receiptSession?.rows.find(row =>
        row.name.toLowerCase() === record.category.toLowerCase()
      );
      if (!category) throw new Error('Sign in as an administrator and select an active category.');
      const response = await fetch(new URL('/functions/v1/pilot-receipt', config.url), {
        method: 'POST',
        headers: {
          apikey: config.publishableKey,
          ...receiptSession.headers,
          'Content-Type': 'image/jpeg',
          'x-expense-id': record.id,
          'x-expense-date': record.date,
          'x-category-id': String(category.id),
          'x-receipt-page': String(page)
        },
        body: jpeg,
        signal: AbortSignal.timeout(30000)
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 409 && result.filename) return;
      if (!response.ok) throw new Error(result.error || 'Dropbox upload failed.');
    }
  };
})();
