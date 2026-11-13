'use strict';
const $=id=>document.getElementById(id);const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
function localDate(){let d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
$('date').value=localDate();
const dbp=new Promise((resolve,reject)=>{let r=indexedDB.open('expenses-mobile-v3',1);r.onupgradeneeded=()=>r.result.createObjectStore('expenses',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
async function store(record){const db=await dbp;return new Promise((res,rej)=>{let tx=db.transaction('expenses','readwrite');tx.objectStore('expenses').put(record);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function all(){const db=await dbp;return new Promise((res,rej)=>{let r=db.transaction('expenses','readonly').objectStore('expenses').getAll();r.onsuccess=()=>res(r.result.filter(record=>authUI.currentUser() && record.operatorId===authUI.currentUser().id));r.onerror=()=>rej(r.error)})}
let confirmed=[],candidate=null;let pendingUrl=null;
function cleanupCandidate(){if(pendingUrl)URL.revokeObjectURL(pendingUrl);pendingUrl=null;candidate=null}
function showZoom(blob){const url=URL.createObjectURL(blob);$('zoomImage').src=url;$('zoom').classList.remove('hidden');$('zoom').dataset.url=url}
$('closeZoom').onclick=()=>{URL.revokeObjectURL($('zoom').dataset.url);$('zoom').classList.add('hidden');$('zoomImage').removeAttribute('src')};
function updateSave(){ $('save').disabled=confirmed.length===0;$('photoHint').textContent=confirmed.length?`${confirmed.length} confirmed photo(s). Check every page before saving.`:'At least one confirmed photo is required.' }
function renderPhotos(){const box=$('photos');box.replaceChildren();confirmed.forEach((f,i)=>{const wrap=document.createElement('div');wrap.className='photo';const title=document.createElement('strong');title.textContent=`Page ${i+1} ✓`;const img=document.createElement('img');const url=URL.createObjectURL(f);img.src=url;img.alt=`Receipt page ${i+1}`;img.onload=()=>URL.revokeObjectURL(url);img.onclick=()=>showZoom(f);const retake=document.createElement('button');retake.type='button';retake.className='secondary';retake.textContent='Retake';retake.onclick=()=>{$('camera').dataset.replace=String(i);$('camera').click()};const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='Remove';remove.onclick=()=>{confirmed.splice(i,1);renderPhotos()};wrap.append(title,img,retake,remove);box.append(wrap)});updateSave()}
$('takePhoto').onclick=()=>{$('camera').dataset.replace='';$('camera').click()};
$('camera').onchange=()=>{const file=$('camera').files?.[0];if(!file)return;if(!file.type.startsWith('image/')){alert('Please select a photo.');return}if(file.size>15*1024*1024){alert('Photo is too large (maximum 15 MB).');return}const replace=$('camera').dataset.replace;candidate={file,replace};const old=$('photoReview');if(old)old.remove();const panel=document.createElement('div');panel.id='photoReview';panel.className='photo';panel.style.marginTop='12px';const title=document.createElement('strong');title.textContent='Check photo readability';const img=document.createElement('img');img.src=URL.createObjectURL(file);pendingUrl=img.src;img.alt='Photo to review';img.onclick=()=>showZoom(file);const help=document.createElement('p');help.className='muted';help.textContent='Tap the image to zoom. Make sure the date, amount and text are readable.';const confirm=document.createElement('button');confirm.type='button';confirm.textContent='Confirm Photo';confirm.onclick=()=>{if(candidate?.replace!=='')confirmed[Number(candidate.replace)]=candidate.file;else confirmed.push(candidate.file);panel.remove();cleanupCandidate();renderPhotos()};const retry=document.createElement('button');retry.type='button';retry.className='secondary';retry.textContent='Retake Photo';retry.onclick=()=>{$('camera').value='';$('camera').click()};panel.append(title,img,help,confirm,retry);$('photos').after(panel);$('camera').value=''};
$('expenseForm').onsubmit=async e=>{e.preventDefault();if(!confirmed.length)return;const user=authUI.currentUser(),operator=user?.email,date=$('date').value,amount=Number($('amount').value);if(!operator||!date||!$('category').value||!(amount>0))return;$('save').disabled=true;try{const id=(crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`);const record={id,date,year:Number(date.slice(0,4)),month:months[Number(date.slice(5,7))-1],day:Number(date.slice(8,10)),value:$('currency').value,category:$('category').value,notes:$('notes').value.trim(),amount,operator,operatorId:user.id,photos:confirmed.slice(),createdAt:new Date().toISOString(),syncStatus:'pending',dropboxStatus:'not-connected',onedriveStatus:'not-connected'};await store(record);confirmed=[];renderPhotos();$('amount').value='';$('notes').value='';$('message').textContent='Expense and photos saved on this device.';await renderHistory()}catch(err){$('message').textContent=`Could not save: ${err.message}`;updateSave()}};
function tab(name){$('newPanel').classList.toggle('hidden',name!=='new');$('historyPanel').classList.toggle('hidden',name!=='history');if(name==='history')renderHistory()}$('newTab').onclick=()=>tab('new');$('historyTab').onclick=()=>tab('history');
async function renderHistory(){const list=$('history');list.replaceChildren();const rows=(await all()).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));if(!rows.length){list.textContent='No expenses saved yet.';return}for(const r of rows){const el=document.createElement('div');el.className='entry';const name=document.createElement('strong');name.textContent=`${r.date} · ${r.category} · ${Number(r.amount).toLocaleString('en-US')} ${r.value}`;const info=document.createElement('p');info.className='muted';info.textContent=`${r.operator} · ${r.photos.length} photo(s) · ${r.dropboxStatus === "uploaded" ? "Receipts uploaded to Dropbox" : "Receipts stored locally"}`;el.append(name,info);for(let i=0;i<r.photos.length;i++){const btn=document.createElement('button');btn.className='secondary';btn.textContent=`View photo ${i+1}`;btn.onclick=()=>showZoom(r.photos[i]);el.append(btn)}if(authUI.canUploadReceipts() && r.dropboxStatus !== "uploaded") el.append(receiptUploadButton(r));list.append(el)}}
function download(blob,name){const a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),15000)}
const csv=v=>'"'+String(v??'').replaceAll('"','""')+'"';$('exportCSV').onclick=async()=>{const rows=await all(),cols=['year','month','day','value','category','notes','amount'];download(new Blob(['\ufeff'+[cols.join(','),...rows.map(r=>cols.map(k=>csv(r[k])).join(','))].join('\r\n')],{type:'text/csv;charset=utf-8'}),'expenses-test-export.csv')};
const asDataURL=blob=>new Promise((res,rej)=>{let r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsDataURL(blob)});
$('exportBackup').onclick=async()=>{const rows=await all(),out=[];for(const r of rows)out.push({...r,photos:await Promise.all(r.photos.map(asDataURL))});download(new Blob([JSON.stringify(out)],{type:'application/json'}),'expenses-test-backup.json')};
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
async function receiptJpeg(photo) {
  if (photo.type === 'image/jpeg' && photo.size <= 5 * 1024 * 1024) return photo;
  const url = URL.createObjectURL(photo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 2400 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!jpeg || jpeg.size > 5 * 1024 * 1024) throw new Error('Receipt photo is too large.');
    return jpeg;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function receiptUploadButton(record) {
  const container = document.createElement('div');
  const button = document.createElement('button');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  button.className = 'secondary';
  button.textContent = 'Upload receipts to Dropbox';
  button.onclick = async () => {
    button.disabled = true;
    try {
      for (let i = 0; i < record.photos.length; i++) {
        status.textContent = `Uploading page ${i + 1} of ${record.photos.length}…`;
        await authUI.uploadReceipt(record, i + 1, await receiptJpeg(record.photos[i]));
      }
      await store({ ...record, dropboxStatus: 'uploaded' });
      await renderHistory();
    } catch (error) {
      status.textContent = error.message;
      button.disabled = false;
    }
  };
  container.append(button, status);
  return container;
}
