import { enhanceQuickFilters } from './quick-filters.js?v=93';
// Only filters are enhanced; form values and attendance status editors stay native.
const filterSelectors = '.compact-filter-row select,.gb-filter select,.gb-managebar select,.sm-filter select,.desktop-filter select,.word-filters select,.ba-parent-select,select[data-quick-filter]';
export function installCompactUI(root) {
  let scheduled=false;
  const sync=()=>{
    scheduled=false;
    root.querySelectorAll(filterSelectors).forEach(select=>{
      if(!select.dataset.quickFilter)select.dataset.quickFilter=select.getAttribute('aria-label') || select.options[0]?.textContent?.replace(/Tất cả\s*/i,'').replace(/Chọn\s*/i,'').trim() || 'Lọc';
    });
    enhanceQuickFilters(root);
  };
  const observer=new MutationObserver(records=>{
    if(!records.some(record=>record.target.tagName==='SELECT'||record.target.tagName==='OPTION'||[...record.addedNodes].some(node=>node.nodeType===1&&(node.matches?.('select')||node.querySelector?.('select')))))return;
    if(!scheduled){scheduled=true;queueMicrotask(sync);}
  });
  observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled']});
  sync();return()=>observer.disconnect();
}
