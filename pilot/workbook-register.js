'use strict';

(() => {
  const status = document.getElementById('registerStatus');
  const list = document.getElementById('registerEntries');
  const more = document.getElementById('moreRegister');
  const refresh = document.getElementById('refreshRegister');
  const field = name => document.getElementById('register' + name);
  const filters = field('Filters');
  const search = field('Search');
  const from = field('From');
  const to = field('To');
  const category = field('Category');
  const currency = field('Currency');
  const count = field('Matches');
  const months = 'january february march april may june july august september october november december'.split(' ');
  const normalize = value => String(value ?? '').trim().toLowerCase();
  const pageSize = 50;
  let entries = [];
  let matches = [];
  let displayed = 0;

  function showMore() {
    for (const entry of matches.slice(displayed, displayed + pageSize)) {
      const row = document.createElement('article');
      row.className = 'entry';
      const title = document.createElement('strong');
      const amount = Number(entry.amount).toLocaleString('en-GB', { maximumFractionDigits: 10 });
      title.textContent = [entry.category, amount + ' ' + (entry.currency ?? '')].filter(Boolean).join(' · ');
      const details = document.createElement('p');
      details.className = 'muted';
      details.textContent = [[entry.day, entry.month, entry.year].join(' '), entry.notes].filter(Boolean).join(' · ');
      row.append(title, details);
      const check = document.createElement('p');
      check.className = 'muted';
      const result = String(entry.receiptCheck ?? '');
      const mismatch = result.startsWith('Importo diverso');
      const matched = result.startsWith('Corrisponde');
      check.textContent = mismatch ? 'Amount differs from PDF' : matched ? 'Amount matches PDF' : 'PDF amount requires review';
      if (!result) check.textContent = 'PDF amount has not been checked yet';
      if (entry.receiptAmount != null && Number.isFinite(Number(entry.receiptAmount))) {
        check.textContent += ' · PDF total: ' + Number(entry.receiptAmount).toLocaleString('en-GB', { maximumFractionDigits: 10 });
      }
      if (result.includes('valuta da verificare')) check.textContent += ' · PDF currency requires review';
      if (mismatch) {
        title.style.backgroundColor = '#ffcccc';
        title.style.color = '#9c0006';
        check.style.color = '#9c0006';
      }
      row.append(check);

      if (entry.receipt && /^https:\/\/(?:www\.)?dropbox\.com\//i.test(entry.receipt)) {
        const link = document.createElement('a');
        link.href = entry.receipt;
        link.textContent = 'Open PDF';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        row.append(link);
      } else {
        const missing = document.createElement('small');
        missing.textContent = 'No PDF linked in Excel';
        row.append(missing);
      }
      list.append(row);
    }
    displayed += pageSize;
    more.hidden = displayed >= matches.length;
  }

  function populate(select, key, allLabel) {
    const selected = select.value;
    const labels = new Map();
    for (const entry of entries) {
      const label = String(entry[key] ?? '').trim();
      if (label) labels.set(normalize(label), label);
    }
    select.replaceChildren(new Option(allLabel, ''));
    for (const label of [...labels.values()].sort((a, b) => a.localeCompare(b))) {
      select.add(new Option(label, normalize(label)));
    }
    if (labels.has(selected)) select.value = selected;
  }

  function dateKey(entry) {
    const month = normalize(entry.month);
    const number = Number(month) || months.findIndex(name => name.startsWith(month) && month.length >= 3) + 1;
    const day = Number(entry.day);
    const year = Number(entry.year);
    if (!(number >= 1 && number <= 12 && day >= 1 && day <= 31 && year >= 1900)) return '';
    return [year, String(number).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
  }

  function applyFilters() {
    const query = normalize(search.value);
    matches = entries.filter(entry => {
      const date = dateKey(entry);
      if ((from.value || to.value) && (!date || (from.value && date < from.value) || (to.value && date > to.value))) return false;
      if (category.value && normalize(entry.category) !== category.value) return false;
      if (currency.value && normalize(entry.currency) !== currency.value) return false;
      const description = normalize([entry.category, entry.notes].join(' '));
      const amount = Number(entry.amount);
      return !query || description.includes(query) || String(entry.amount) === query ||
        ['en-GB', 'it-IT'].some(locale => amount.toLocaleString(locale, { maximumFractionDigits: 10 }) === query);
    });
    displayed = 0;
    list.replaceChildren();
    count.textContent = entries.length ? matches.length + ' of ' + entries.length + ' expenses' : '';
    if (entries.length && !matches.length) list.textContent = 'No expenses match the filters.';
    showMore();
  }

  async function load() {
    if (refresh.disabled) return;
    refresh.disabled = true;
    status.textContent = 'Loading the Excel register…';
    try {
      const snapshot = await authUI.workbookRegister();
      entries = snapshot?.entries ?? [];
      filters.hidden = entries.length === 0;
      populate(category, 'category', 'All categories');
      populate(currency, 'currency', 'All currencies');
      if (!snapshot) {
        status.textContent = 'Waiting for the first Windows sync.';
      } else {
        const updated = new Date(snapshot.updated_at).toLocaleString();
        status.textContent = entries.length
          ? 'Last synced from Excel: ' + updated
          : 'No expenses in Excel. Last sync: ' + updated;
      }
      applyFilters();
    } catch {
      status.textContent = 'Could not refresh the Excel register. Check your connection or sign in again.';
    } finally {
      refresh.disabled = false;
    }
  }

  document.getElementById('registerTab').onclick = () => {
    tab('register');
    void load();
  };
  filters.oninput = applyFilters;
  filters.onreset = () => setTimeout(applyFilters);
  filters.onsubmit = event => event.preventDefault();
  refresh.onclick = load;
  more.onclick = showMore;
})();
