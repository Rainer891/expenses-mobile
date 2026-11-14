'use strict';

const authUI = (() => {
  const config = window.expensesConfig;
  const get = id => document.getElementById(id);
  const categoryCache = 'expenses-mobile-categories';
  const offlineIdentity = 'expenses-mobile-offline-identity';
  let identity = null;
  let receiptSession = null;
  let dataSession = null;
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
    const operatorMode = !receiptSession;
    get('workspace').classList.toggle('operator-mode', operatorMode);
    get('expenseDetails').open = !operatorMode;
    get('operator').value = user.email;
    showCategories(categories);
    get('authPanel').classList.add('hidden');
    get('workspace').classList.remove('hidden');
    get('network').textContent = offline
      ? 'Offline · using saved categories on this device'
      : 'Signed in · expenses and photos are saved on this device';
    dispatchEvent(new Event('expense-workspace-opened'));
  }

  function showCategories(categories) {
    const select = get('category');
    const selected = select.value;
    select.replaceChildren(...categories.map(category => new Option(category.name, category.id)));
    if (get('workspace').classList.contains('operator-mode')) {
      const placeholder = new Option('Choose a category', '', true, true);
      placeholder.disabled = true;
      select.prepend(placeholder);
    }
    if (categories.some(category => String(category.id) === selected)) select.value = selected;
  }

  function categoryForRecord(record, categories) {
    return record.categoryId == null
      ? categories.find(row => row.name.toLowerCase() === record.category.toLowerCase())
      : { id: record.categoryId };
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
      dataSession = { headers, rows };
      try {
        const admins = await request('/rest/v1/expense_admins?select=user_id&limit=1', { headers });
        if (admins.some(admin => admin.user_id === user.id)) {
          receiptSession = { headers, rows };
          get('manageCategories').hidden = false;
        }
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

  const categoryPanel = get('categoryAdmin');
  get('manageCategories').onclick = () => {
    categoryPanel.hidden = !categoryPanel.hidden;
    if (!categoryPanel.hidden) void manageCategories();
  };

  async function manageCategories(change) {
    if (!receiptSession || !navigator.onLine) return;
    const status = get('categoryStatus');
    const controls = [...categoryPanel.querySelectorAll('input, button')];
    controls.forEach(control => { control.disabled = true; });
    try {
      const rows = await request('/rest/v1/rpc/pilot_manage_categories', {
        method: 'POST',
        headers: { ...receiptSession.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(change || {})
      });
      const active = rows.filter(row => row.active);
      dataSession.rows = active;
      receiptSession.rows = rows;
      if (localStorage.getItem(offlineIdentity)) localStorage.setItem(categoryCache, JSON.stringify(active));
      showCategories(active);

      const list = get('categoryAdminList');
      list.replaceChildren();
      for (const row of rows) {
        const form = document.createElement('form');
        const name = document.createElement('input');
        name.value = row.name;
        name.setAttribute('aria-label', 'Name for ' + row.name);
        name.required = true;
        name.maxLength = 80;
        const active = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = row.active;
        active.append(checkbox, ' Active');
        const save = document.createElement('button');
        save.textContent = 'Save category';
        form.append(name, active, save);
        form.onsubmit = event => {
          event.preventDefault();
          void manageCategories({ category_id: row.id, category_name: name.value.trim(), category_active: checkbox.checked });
        };
        list.append(form);
      }
      if (change?.category_id === null) get('newCategoryName').value = '';
      status.textContent = change ? 'Categories updated.' : '';
    } catch (error) {
      status.textContent = error.message === '409' ? 'This category name already exists.' : 'Could not load or save categories. Check your connection and try again.';
    } finally {
      controls.forEach(control => { control.disabled = false; });
    }
  }

  get('addCategoryForm').onsubmit = event => {
    event.preventDefault();
    void manageCategories({ category_id: null, category_name: get('newCategoryName').value.trim(), category_active: true });
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
    canSyncExpenses: () => Boolean(dataSession) && navigator.onLine,
    async syncExpense(record) {
      if (!dataSession || record.operatorId !== identity?.id) {
        throw new Error('Sign in online to sync this expense.');
      }
      const category = categoryForRecord(record, dataSession.rows);
      if (!category) throw new Error('This expense category is no longer available.');
      const { headers } = dataSession;
      const response = await fetch(new URL('/rest/v1/expenses?on_conflict=id', config.url), {
        method: 'POST',
        headers: {
          apikey: config.publishableKey,
          ...headers,
          'Content-Type': 'application/json',
          Prefer: 'resolution=ignore-duplicates,return=minimal'
        },
        body: JSON.stringify({
          id: record.id,
          expense_date: record.date,
          operator_name: identity.email,
          category_id: category.id,
          currency: record.value,
          amount: record.amount,
          notes: record.notes || null
        }),
        signal: AbortSignal.timeout(15000)
      });
      if (response.status === 401) throw new Error('Sign in again to sync this expense.');
      if (!response.ok) throw new Error('Could not sync the expense. Try again from Expense History.');
      const rows = await request('/rest/v1/expenses?select=id&id=eq.' + encodeURIComponent(record.id), { headers });
      if (!rows.some(row => row.id === record.id)) throw new Error('Could not confirm the expense in Supabase.');
    },
    async receiptFilename(record) {
      if (!dataSession || record.operatorId !== identity?.id) return null;
      const [row] = await request('/rest/v1/expenses?select=receipt_number,expense_date,expense_categories(name)&id=eq.' + encodeURIComponent(record.id),
        { headers: dataSession.headers });
      if (!Number.isSafeInteger(row?.receipt_number) || !row.expense_categories?.name) return null;
      const category = row.expense_categories.name.normalize('NFKD').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'Receipt';
      return `EXP-${row.expense_date.replaceAll('-', '')}-${String(row.receipt_number).padStart(4, '0')}_${category}.pdf`;
    },
    canUploadReceipts: () => Boolean(receiptSession) && navigator.onLine,
    async uploadReceipt(record, pdf) {
      const category = receiptSession && categoryForRecord(record, receiptSession.rows);
      if (!category) throw new Error('Sign in as an administrator and select an active category.');
      const response = await fetch(new URL('/functions/v1/pilot-receipt', config.url), {
        method: 'POST',
        headers: {
          apikey: config.publishableKey,
          ...receiptSession.headers,
          'Content-Type': 'application/pdf',
          'x-expense-id': record.id,
          'x-expense-date': record.date,
          'x-category-id': String(category.id)
        },
        body: pdf,
        signal: AbortSignal.timeout(30000)
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 409 && result.filename) return result.filename;
      if (!response.ok) throw new Error(result.error || 'Dropbox upload failed.');
      return result.filename;
    }
  };
})();
