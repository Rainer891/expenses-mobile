'use strict';

(() => {
  const status = document.getElementById('registerStatus');
  const list = document.getElementById('registerEntries');
  const more = document.getElementById('moreRegister');
  const refresh = document.getElementById('refreshRegister');
  const pageSize = 50;
  let entries = [];
  let displayed = 0;

  function showMore() {
    for (const entry of entries.slice(displayed, displayed + pageSize)) {
      const row = document.createElement('article');
      row.className = 'entry';
      const title = document.createElement('strong');
      const amount = Number(entry.amount).toLocaleString('en-GB', { maximumFractionDigits: 10 });
      title.textContent = [entry.category, amount + ' ' + (entry.currency ?? '')].filter(Boolean).join(' · ');
      const details = document.createElement('p');
      details.className = 'muted';
      details.textContent = [[entry.day, entry.month, entry.year].join(' '), entry.notes].filter(Boolean).join(' · ');
      row.append(title, details);

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
    more.hidden = displayed >= entries.length;
  }

  async function load() {
    if (refresh.disabled) return;
    refresh.disabled = true;
    status.textContent = 'Loading the Excel register…';
    try {
      const snapshot = await authUI.workbookRegister();
      entries = snapshot?.entries ?? [];
      displayed = 0;
      list.replaceChildren();
      if (!snapshot) {
        status.textContent = 'Waiting for the first Windows sync.';
      } else {
        const updated = new Date(snapshot.updated_at).toLocaleString();
        status.textContent = entries.length
          ? 'Last synced from Excel: ' + updated
          : 'No expenses in Excel. Last sync: ' + updated;
      }
      showMore();
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
  refresh.onclick = load;
  more.onclick = showMore;
})();
