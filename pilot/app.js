'use strict';
const $=id=>document.getElementById(id);const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
function localDate(){let d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
$('date').value=localDate();
const dbp=new Promise((resolve,reject)=>{let r=indexedDB.open('expenses-mobile-v3',1);r.onupgradeneeded=()=>r.result.createObjectStore('expenses',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
async function store(record){const db=await dbp;return new Promise((res,rej)=>{let tx=db.transaction('expenses','readwrite');tx.objectStore('expenses').put(record);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function all(){const db=await dbp;return new Promise((res,rej)=>{let r=db.transaction('expenses','readonly').objectStore('expenses').getAll();r.onsuccess=()=>res(r.result.filter(record=>authUI.currentUser() && record.operatorId===authUI.currentUser().id));r.onerror=()=>rej(r.error)})}
let confirmed=[],candidate=null;
function showZoom(blob){const url=URL.createObjectURL(blob);$('zoomImage').src=url;$('zoom').classList.remove('hidden');$('zoom').dataset.url=url}
$('closeZoom').onclick=()=>{if($('zoom').dataset.url)URL.revokeObjectURL($('zoom').dataset.url);delete $('zoom').dataset.url;$('zoom').classList.add('hidden');$('zoomImage').removeAttribute('src')};
function updateSave(){ $('save').disabled=confirmed.length===0 || Boolean(candidate);$('photoHint').textContent=confirmed.length?`${confirmed.length} confirmed photo(s). Check every page before saving.`:'At least one confirmed photo is required.' }
function renderPhotos(){const box=$('photos');box.replaceChildren();confirmed.forEach((f,i)=>{const wrap=document.createElement('div');wrap.className='photo';const title=document.createElement('strong');title.textContent=`Page ${i+1} ✓`;const img=document.createElement('img');const url=URL.createObjectURL(f);img.src=url;img.alt=`Receipt page ${i+1}`;img.onload=()=>URL.revokeObjectURL(url);img.onclick=()=>showZoom(f);const retake=document.createElement('button');retake.type='button';retake.className='secondary';retake.textContent='Retake';retake.onclick=()=>{$('camera').dataset.replace=String(i);$('camera').click()};const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='Remove';remove.onclick=()=>{confirmed.splice(i,1);renderPhotos()};wrap.append(title,img,retake,remove);box.append(wrap)});updateSave()}
$('takePhoto').onclick=()=>{$('camera').dataset.replace='';$('camera').click()};
$('camera').onchange = async () => {
  const camera = $('camera');
  const file = camera.files?.[0];
  camera.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) { alert('Please select a photo.'); return; }
  if (file.size > 15 * 1024 * 1024) { alert('Photo is too large (maximum 15 MB).'); return; }

  const review = { replace: camera.dataset.replace };
  candidate = review;
  updateSave();
  $('photoReview')?.remove();
  const panel = document.createElement('div');
  panel.id = 'photoReview';
  panel.className = 'photo receipt-review';
  const title = document.createElement('strong');
  title.textContent = 'Crop receipt';
  const editorHost = document.createElement('div');
  const help = document.createElement('p');
  help.setAttribute('role', 'status');
  help.textContent = 'Finding receipt edges…';
  const preview = document.createElement('button');
  preview.type = 'button';
  preview.disabled = true;
  preview.textContent = 'Preview Crop';
  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.hidden = true;
  confirm.textContent = 'Confirm Photo';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'secondary';
  cancel.textContent = 'Discard Photo';
  cancel.onclick = () => {
    panel.remove();
    candidate = null;
    updateSave();
  };
  panel.append(title, editorHost, help, preview, confirm, cancel);
  $('photos').after(panel);

  try {
    const editor = await createReceiptEditor(file, editorHost);
    help.textContent = editor.detected
      ? 'Check the outline and move any corner that needs adjustment.'
      : 'Move the four corners to the edges of the receipt.';
    preview.disabled = false;
    preview.onclick = async () => {
      if (editorHost.hidden) {
        editorHost.hidden = false;
        confirm.hidden = true;
        preview.textContent = 'Preview Crop';
        help.textContent = 'Adjust the four receipt corners.';
        return;
      }
      preview.disabled = true;
      try {
        const cropped = await editor.crop();
        if (candidate !== review) return;
        editorHost.hidden = true;
        help.textContent = 'Check that the whole receipt is readable before confirming.';
        showZoom(cropped);
        preview.textContent = 'Adjust Corners';
        confirm.hidden = false;
        confirm.onclick = () => {
          if (review.replace !== '') confirmed[Number(review.replace)] = cropped;
          else confirmed.push(cropped);
          cancel.onclick();
          renderPhotos();
        };
      } catch (error) {
        help.textContent = error.message;
      } finally {
        preview.disabled = false;
      }
    };
  } catch {
    help.textContent = 'Could not open this photo. Discard it and take a new one.';
  }
};
$('expenseForm').onsubmit=async e=>{e.preventDefault();if(!confirmed.length||candidate)return;const user=authUI.currentUser(),operator=user?.email,date=$('date').value,amount=Number($('amount').value);if(!operator||!date||!$('category').value||!(amount>0))return;$('save').disabled=true;try{const id=(crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`);const record={id,date,year:Number(date.slice(0,4)),month:months[Number(date.slice(5,7))-1],day:Number(date.slice(8,10)),value:$('currency').value,category:$('category').value,notes:$('notes').value.trim(),amount,operator,operatorId:user.id,photos:confirmed.slice(),createdAt:new Date().toISOString(),syncStatus:'pending',autoSync:true,dropboxStatus:'not-connected',onedriveStatus:'not-connected'};await store(record);confirmed=[];renderPhotos();$('amount').value='';$('notes').value='';$('message').textContent='Expense and photos saved on this device.';await renderHistory();if(pendingSync) await pendingSync;void syncPendingExpenses()}catch(err){$('message').textContent=`Could not save: ${err.message}`;updateSave()}};
function tab(name){$('newPanel').classList.toggle('hidden',name!=='new');$('historyPanel').classList.toggle('hidden',name!=='history');if(name==='history')renderHistory()}$('newTab').onclick=()=>tab('new');$('historyTab').onclick=()=>tab('history');
async function renderHistory(){const list=$('history');const rows=(await all()).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));list.replaceChildren();if(!rows.length){list.textContent='No expenses saved yet.';return}for(const r of rows){const el=document.createElement('div');el.className='entry';const name=document.createElement('strong');name.textContent=`${r.date} · ${r.category} · ${Number(r.amount).toLocaleString('en-US')} ${r.value}`;const info=document.createElement('p');info.className='muted';info.textContent=`${r.operator} · ${r.photos.length} photo(s) · ${r.dropboxStatus === "uploaded" ? "Receipts uploaded to Dropbox" : "Receipts stored locally"}`;el.append(name,info);const sync=document.createElement("p");sync.className="muted";sync.textContent=r.supabaseStatus==="synced"?"Expense synced to Supabase":"Expense awaiting Supabase sync";el.append(sync);if(!syncInProgress.has(r.id) && authUI.canSyncExpenses() && r.supabaseStatus!=="synced")el.append(expenseSyncButton(r));for(let i=0;i<r.photos.length;i++){const btn=document.createElement('button');btn.className='secondary';btn.textContent=`View photo ${i+1}`;btn.onclick=()=>viewSavedPhoto(r.photos[i],btn);el.append(btn)}if(!syncInProgress.has(r.id) && authUI.canUploadReceipts() && r.photos.length && r.dropboxStatus !== "uploaded") el.append(receiptUploadButton(r));if(syncErrors.has(r.id)){const error=document.createElement('p');error.setAttribute('role','status');error.textContent=syncErrors.get(r.id);el.append(error)}if(r.photos.length)el.append(receiptDownloadButton(r));list.append(el)}}
async function viewSavedPhoto(blob, button) {
  button.disabled = true;
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  button.after(status);
  try {
    const src = await asDataURL(blob);
    const image = $('zoomImage');
    if ($('zoom').dataset.url) URL.revokeObjectURL($('zoom').dataset.url);
    delete $('zoom').dataset.url;
    image.src = src;
    await image.decode();
    $('zoom').classList.remove('hidden');
    status.remove();
  } catch {
    status.textContent = 'Could not display this photo. Try downloading the receipt PDF.';
    button.onclick = () => {
      status.remove();
      void viewSavedPhoto(blob, button);
    };
  } finally {
    button.disabled = false;
  }
}
function download(blob,name){const a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),15000)}
const csv=v=>'"'+String(v??'').replaceAll('"','""')+'"';$('exportCSV').onclick=async()=>{const rows=await all(),cols=['year','month','day','value','category','notes','amount'];download(new Blob(['\ufeff'+[cols.join(','),...rows.map(r=>cols.map(k=>csv(r[k])).join(','))].join('\r\n')],{type:'text/csv;charset=utf-8'}),'expenses-test-export.csv')};
const asDataURL=blob=>new Promise((res,rej)=>{let r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsDataURL(blob)});
$('exportBackup').onclick=async()=>{const rows=await all(),out=[];for(const r of rows)out.push({...r,photos:await Promise.all(r.photos.map(asDataURL))});download(new Blob([JSON.stringify(out)],{type:'application/json'}),'expenses-test-backup.json')};
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
function receiptDownloadButton(record) {
  const container = document.createElement('div');
  const button = document.createElement('button');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  button.className = 'secondary';
  button.textContent = 'Download receipt PDF';
  button.onclick = async () => {
    button.disabled = true;
    status.textContent = 'Preparing receipt PDF…';
    try {
      const pdf = await createReceiptPDF(record.photos);
      let filename = record.receiptFilename;
      if (!filename && authUI.canSyncExpenses()) {
        filename = await authUI.receiptFilename(record).catch(() => null);
        if (filename) await updateExpenseStatus(record.id, 'receiptFilename', filename);
      }
      download(pdf, filename || `Receipt-pending-${record.id}.pdf`);
      status.textContent = '';
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
  container.append(button, status);
  return container;
}

function receiptUploadButton(record) {
  const container = document.createElement('div');
  const button = document.createElement('button');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  button.className = 'secondary';
  button.textContent = 'Upload receipt PDF to Dropbox';
  button.onclick = async () => {
    button.disabled = true;
    try {
      status.textContent = 'Syncing expense and receipt…';
      await syncExpenseAndReceipt(record);
      await renderHistory();
    } catch (error) {
      status.textContent = error.message;
      button.disabled = false;
    }
  };
  container.append(button, status);
  return container;
}

function updateExpenseStatus(id, field, value) {
  return dbp.then(db => new Promise((resolve, reject) => {
    const tx = db.transaction('expenses', 'readwrite');
    const expenses = tx.objectStore('expenses');
    const lookup = expenses.get(id);
    lookup.onsuccess = () => {
      if (!lookup.result) {
        tx.abort();
        return;
      }
      expenses.put({ ...lookup.result, [field]: value });
    };
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('Local expense unavailable.'));
  }));
}

async function syncSavedExpense(record) {
  await authUI.syncExpense(record);
  await updateExpenseStatus(record.id, 'supabaseStatus', 'synced');
  const filename = await authUI.receiptFilename(record).catch(() => null);
  if (filename) await updateExpenseStatus(record.id, 'receiptFilename', filename);
}

function expenseSyncButton(record) {
  const container = document.createElement('div');
  const button = document.createElement('button');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  button.className = 'secondary';
  button.textContent = 'Sync expense to Supabase';
  button.onclick = async () => {
    button.disabled = true;
    status.textContent = 'Syncing expense…';
    try {
      await syncExpenseAndReceipt(record);
      await renderHistory();
    } catch (error) {
      status.textContent = error.message;
      button.disabled = false;
    }
  };
  container.append(button, status);
  return container;
}

const syncInProgress = new Set();
const syncErrors = new Map();
let pendingSync;

async function syncExpenseAndReceipt(record) {
  if (syncInProgress.has(record.id)) return;
  syncInProgress.add(record.id);
  syncErrors.delete(record.id);
  try {
    const current = (await all()).find(row => row.id === record.id);
    if (!current) throw new Error('Local expense unavailable.');
    if (current.supabaseStatus !== 'synced') await syncSavedExpense(current);
    if (authUI.canUploadReceipts() && current.photos.length && current.dropboxStatus !== 'uploaded') {
      const pdf = await createReceiptPDF(current.photos);
      const filename = await authUI.uploadReceipt(current, pdf);
      if (filename) await updateExpenseStatus(current.id, 'receiptFilename', filename);
      await updateExpenseStatus(current.id, 'dropboxStatus', 'uploaded');
    }
  } finally {
    syncInProgress.delete(record.id);
  }
}

function syncPendingExpenses() {
  if (pendingSync || !authUI.canSyncExpenses()) return;
  pendingSync = (async () => {
    const rows = await all();
    for (const record of rows) {
      if (!authUI.canSyncExpenses()) break;
      if (!record.autoSync || (record.supabaseStatus === 'synced' &&
          (!authUI.canUploadReceipts() || record.dropboxStatus === 'uploaded'))) continue;
      try {
        await syncExpenseAndReceipt(record);
      } catch (error) {
        syncErrors.set(record.id, error.message);
        $('message').textContent = 'Some items still need sync. Check Expense History.';
      }
    }
    await renderHistory();
  })().catch(() => {
    $('message').textContent = 'Could not check pending items. Open Expense History to retry.';
  }).finally(() => { pendingSync = null; });
  return pendingSync;
}

addEventListener('expense-workspace-opened', syncPendingExpenses);
addEventListener('online', syncPendingExpenses);
addEventListener('offline', () => { if (authUI.currentUser()) void renderHistory(); });
