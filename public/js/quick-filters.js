// One compact chooser shared by every filter row. Popover lives outside scrolling rows.
let opened = null;
let panel = null;
let bound = false;
const signatures = new WeakMap();
export function closeQuickFilters(restoreFocus = false) {
  if (opened) {
    const trigger = opened.closest('.quick-filter')?.querySelector('button');
    trigger?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger?.focus();
  }
  panel?.remove(); panel = null; opened = null;
}
function positionPanel(trigger) {
  if (!panel) return;
  const rect = trigger.getBoundingClientRect(), narrow = innerWidth < 640;
  panel.style.width = `${Math.min(narrow ? innerWidth-20 : 420, innerWidth-20)}px`;
  const height = Math.min(panel.scrollHeight, innerHeight*0.64);
  panel.style.left = `${Math.max(10, Math.min(rect.left, innerWidth-panel.offsetWidth-10))}px`;
  panel.style.top = `${Math.max(10, Math.min(rect.bottom+6, innerHeight-height-10))}px`;
}
function open(select, trigger) {
  if (opened === select) { closeQuickFilters(true); return; }
  closeQuickFilters(); opened = select;
  trigger.setAttribute('aria-expanded', 'true');
  panel = document.createElement('div'); panel.className = 'qf-popover';
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', select.dataset.quickFilter || 'Lọc');
  const head = document.createElement('div'); head.className = 'qf-head';
  const title = document.createElement('b'); title.textContent = select.dataset.quickFilter || 'Lọc';
  const close = document.createElement('button'); close.type='button';close.textContent='×';close.setAttribute('aria-label','Đóng bộ lọc'); close.onclick=()=>closeQuickFilters(true);
  head.append(title,close); panel.append(head);
  const options = document.createElement('div'); options.className='qf-options'; options.setAttribute('role','listbox');
  const items=[];
  for (const option of select.options) {
    const button = document.createElement('button');button.type='button';button.className='qf-option';button.textContent=option.textContent || 'Tất cả';button.disabled=option.disabled;
    button.setAttribute('role','option');button.setAttribute('aria-selected',String(option.selected));button.classList.toggle('active',option.selected);
    button.onclick=()=>{ const next=option.value;closeQuickFilters();select.value=next;select.dispatchEvent(new Event('change',{bubbles:true}));if(select.isConnected){sync(select);trigger.focus();} };
    items.push(button);options.append(button);
  }
  if (items.length>12) {
    const search=document.createElement('input');search.type='search';search.placeholder='Tìm nhanh…';search.setAttribute('aria-label','Tìm lựa chọn');
    search.oninput=()=>{const value=search.value.toLocaleLowerCase('vi');items.forEach(button=>button.hidden=!button.textContent.toLocaleLowerCase('vi').includes(value));}; panel.append(search);
  }
  panel.append(options);document.body.append(panel);positionPanel(trigger);
  (panel.querySelector('input') || panel.querySelector('.qf-option.active') || panel.querySelector('.qf-option'))?.focus();
  panel.addEventListener('keydown',event=>{
    if(!['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Home','End','Tab'].includes(event.key))return;
    const buttons=[...panel.querySelectorAll('button,input')].filter(b=>!b.hidden&&!b.disabled);
    const index=buttons.indexOf(document.activeElement);let next=index;
    if(event.key==='Home')next=0;else if(event.key==='End')next=buttons.length-1;else next=(index+((event.key==='ArrowLeft'||event.key==='ArrowUp'||event.shiftKey)?-1:1)+buttons.length)%buttons.length;
    event.preventDefault();buttons[next]?.focus();
  });
}
function sync(select) {
  if(!select.isConnected)return;
  const signature=JSON.stringify([select.value,select.disabled,[...select.options].map(o=>[o.value,o.textContent,o.disabled])]);
  if(signatures.get(select)===signature && select.closest('.quick-filter'))return;
  signatures.set(select,signature);
  let wrapper=select.closest('.quick-filter');
  if(!wrapper){
    wrapper=document.createElement('span');wrapper.className='quick-filter';select.before(wrapper);wrapper.append(select);select.classList.add('quick-filter-native');select.tabIndex=-1;
    const trigger=document.createElement('button');trigger.type='button';trigger.className='quick-filter-trigger';trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');
    trigger.onclick=()=>open(select,trigger);wrapper.append(trigger);
  }
  const trigger=wrapper.querySelector('button'), label=select.dataset.quickFilter || 'Lọc', selected=select.selectedOptions[0]?.textContent?.trim();
  trigger.textContent=(select.value ? selected : label) || label;trigger.title=`${label}: ${selected || 'Tất cả'}`;trigger.setAttribute('aria-label',trigger.title);trigger.disabled=select.disabled;
  wrapper.classList.toggle('qf-active',Boolean(select.value));
}
export function enhanceQuickFilters(root=document) {
  root.querySelectorAll('select[data-quick-filter]').forEach(sync);
  if(opened&&!opened.isConnected)closeQuickFilters();
  if(bound)return;bound=true;
  document.addEventListener('click',e=>{if(opened&&!panel?.contains(e.target)&&!e.target.closest('.quick-filter'))closeQuickFilters();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeQuickFilters(true);});
  window.addEventListener('resize',()=>closeQuickFilters());
  window.addEventListener('hashchange',()=>closeQuickFilters());
  document.addEventListener('change',e=>{if(e.target.matches('select[data-quick-filter]'))queueMicrotask(()=>sync(e.target));});
}
