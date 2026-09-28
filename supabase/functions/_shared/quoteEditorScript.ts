/**
 * WYSIWYG inline editor for the HTML quote document.
 * Embedded as a <script> tag at the bottom of the premium template.
 *
 * Requires window.QUOTE_ID, window.QUOTE_WRITE_TOKEN, and
 * window.QUOTE_SUPABASE_URL to be set before this script runs.
 */
export function buildEditorScript(): string {
  return `
(function() {
  var SB_URL = window.QUOTE_SUPABASE_URL || '';
  var QID    = window.QUOTE_ID || '';
  var WTOKEN = window.QUOTE_WRITE_TOKEN || '';
  if (!SB_URL || !QID || !WTOKEN) return;

  /* ── toolbar ── */
  var bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;gap:8px;flex-direction:column;align-items:flex-end;font-family:system-ui,sans-serif;';

  function btn(label, bg, shadow) {
    var b = document.createElement('button');
    b.innerHTML = label;
    b.style.cssText = 'background:'+bg+';color:#fff;border:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px '+shadow+';transition:opacity 0.15s;';
    b.onmouseenter = function(){ b.style.opacity='0.9'; };
    b.onmouseleave = function(){ b.style.opacity='1'; };
    return b;
  }

  var statusEl = document.createElement('div');
  statusEl.style.cssText = 'padding:8px 14px;border-radius:6px;font-size:13px;font-weight:500;display:none;';

  var cancelBtn = btn('Avbryt', '#6b7280', 'rgba(107,114,128,0.3)');
  cancelBtn.style.display = 'none';
  cancelBtn.style.padding = '8px 16px';
  cancelBtn.style.fontSize = '13px';

  var saveBtn = btn('&#128190; Spara &auml;ndringar', '#16a34a', 'rgba(22,163,74,0.35)');
  saveBtn.style.display = 'none';

  var editBtn = btn('&#9998; Redigera offert', '#2563eb', 'rgba(37,99,235,0.35)');

  bar.appendChild(statusEl);
  bar.appendChild(cancelBtn);
  bar.appendChild(saveBtn);
  bar.appendChild(editBtn);
  document.body.appendChild(bar);

  /* ── edit-mode CSS ── */
  var sty = document.createElement('style');
  sty.textContent = [
    '.qe-mode [data-editable]{outline:2px dashed #2563eb;outline-offset:2px;border-radius:3px;',
    'cursor:text;background:rgba(37,99,235,0.04);}',
    '.qe-mode [data-editable]:hover{background:rgba(37,99,235,0.09);}',
    '.qe-mode [data-editable]:focus{outline:2px solid #1d4ed8 !important;background:rgba(37,99,235,0.07);}',
  ].join('');
  document.head.appendChild(sty);

  var editing = false;

  function startEdit() {
    editing = true;
    document.body.classList.add('qe-mode');
    document.querySelectorAll('[data-editable]').forEach(function(el) {
      el.setAttribute('contenteditable','true');
      el.setAttribute('spellcheck','false');
    });
    editBtn.style.display = 'none';
    saveBtn.style.display = 'block';
    cancelBtn.style.display = 'block';
    statusEl.style.display = 'none';
  }

  function stopEdit() {
    editing = false;
    document.body.classList.remove('qe-mode');
    document.querySelectorAll('[data-editable]').forEach(function(el) {
      el.removeAttribute('contenteditable');
    });
    editBtn.style.display = 'block';
    saveBtn.style.display = 'none';
    cancelBtn.style.display = 'none';
  }

  /* ── path setter: "a.0.b" → obj.a[0].b = value ── */
  function setPath(obj, path, value) {
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var k = parts[i];
      var nextIsIdx = !isNaN(Number(parts[i+1]));
      if (cur[k] == null) cur[k] = nextIsIdx ? [] : {};
      cur = cur[k];
    }
    var last = parts[parts.length - 1];
    cur[isNaN(Number(last)) ? last : Number(last)] = value;
  }

  function collectSections() {
    var sections = {};
    document.querySelectorAll('[data-editable]').forEach(function(el) {
      var path = el.getAttribute('data-editable');
      /* innerText preserves visible line breaks; trim whitespace */
      var value = (el.innerText || el.textContent || '').trim();
      setPath(sections, path, value);
    });
    return sections;
  }

  function showStatus(ok, msg) {
    statusEl.style.background = ok ? '#f0fdf4' : '#fef2f2';
    statusEl.style.color = ok ? '#16a34a' : '#dc2626';
    statusEl.textContent = msg;
    statusEl.style.display = 'block';
    if (ok) setTimeout(function(){ statusEl.style.display='none'; }, 4000);
  }

  function doSave() {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '&#9203; Sparar...';
    statusEl.style.display = 'none';

    fetch(SB_URL + '/functions/v1/save_quote_edits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quote_id: QID, write_token: WTOKEN, sections: collectSections() })
    })
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (d.success) { stopEdit(); showStatus(true, '\\u2713 Sparat!'); }
      else throw new Error(d.error || 'Fel vid sparning');
    })
    .catch(function(e){ showStatus(false, '\\u2717 ' + e.message); })
    .finally(function(){
      saveBtn.disabled = false;
      saveBtn.innerHTML = '&#128190; Spara &auml;ndringar';
    });
  }

  editBtn.addEventListener('click', startEdit);
  saveBtn.addEventListener('click', doSave);
  cancelBtn.addEventListener('click', stopEdit);
})();
`;
}
