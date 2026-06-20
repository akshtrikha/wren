'use strict'

// ─── helpers ──────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id)
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))
const clone = v => JSON.parse(JSON.stringify(v))
const uid = () => 'c' + Date.now() + Math.random().toString(36).slice(2, 6)

function blankReq() {
  return {
    id: '', name: '', method: 'GET', url: '',
    headers: [], params: [],
    body: { type: 'none', content: '', fields: [] },
    auth: { type: 'none', token: '', username: '', password: '', header: '', value: '' }
  }
}

function newTabObj(overrides) {
  return Object.assign({
    id: uid(), req: blankReq(), response: null,
    wsId: '', folderId: '', reqId: '',
    reqTab: 'params', resTab: 'pretty',
  }, overrides)
}

// ─── state ────────────────────────────────────────────────────────────────
const S = {
  workspaces: [], environments: [],
  envId: '', wsId: '', folderId: '', reqId: '',
  expandedWs: new Set(),
  showHistory: false, history: [], historyDate: '',
  req: blankReq(),
  response: null, loading: false,
  reqTab: 'params', resTab: 'pretty',
  tabs: [], activeTabId: '',
}

// ─── api ──────────────────────────────────────────────────────────────────
const api = {
  get: url => fetch(url).then(r => r.json()),
  json: (method, url, body) =>
    fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(r => r.ok ? r.json() : r.text().then(t => Promise.reject(t))),
  del: url => fetch(url, { method: 'DELETE' }),
}

// ─── render helpers ───────────────────────────────────────────────────────
function mbHtml(method) {
  return `<span class="mb mb-${esc(method)}">${esc(method)}</span>`
}

function colorizeJSON(str) {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(
      /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      m => {
        let c = 'jn'
        if (/^"/.test(m)) c = /:$/.test(m) ? 'jk' : 'js'
        else if (/true|false/.test(m)) c = 'jb'
        else if (/null/.test(m)) c = 'jnl'
        return `<span class="${c}">${m}</span>`
      }
    )
}

function highlightJSON(str) {
  try { str = JSON.stringify(JSON.parse(str), null, 2) } catch (_) {}
  return colorizeJSON(str)
}

function fmtSize(b) {
  if (b < 1024) return b + ' B'
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1048576).toFixed(1) + ' MB'
}
function fmtTime(ms) { return ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(2) + 's' }
function statusCls(s) {
  if (s >= 500) return 'status-5xx'
  if (s >= 400) return 'status-4xx'
  if (s >= 300) return 'status-3xx'
  return 'status-2xx'
}

// ─── tab strip ────────────────────────────────────────────────────────────
function renderTabs() {
  const strip = $('tab-strip')
  strip.innerHTML = S.tabs.map(t => {
    const method = t.req.method || 'GET'
    const label  = t.req.name || t.req.url || 'New Request'
    const short  = label.length > 22 ? label.slice(0, 22) + '…' : label
    const active = t.id === S.activeTabId
    return `<div class="tab-item${active ? ' active' : ''}" onclick="switchTab('${t.id}')">
      <span class="tab-item-label">${mbHtml(method)}<span class="tab-item-name">${esc(short)}</span></span>
      <button class="tab-item-close" title="Close tab" onclick="event.stopPropagation();closeTab('${t.id}')">×</button>
    </div>`
  }).join('') + `<button class="tab-add" title="New tab" onclick="addTab()">+</button>`
}

function syncActiveTab() {
  const t = S.tabs.find(t => t.id === S.activeTabId)
  if (!t) return
  t.req = clone(S.req); t.response = S.response
  t.wsId = S.wsId; t.folderId = S.folderId; t.reqId = S.reqId
  t.reqTab = S.reqTab; t.resTab = S.resTab
}

function loadTab(t) {
  S.activeTabId = t.id
  S.req = clone(t.req); S.response = t.response ? clone(t.response) : null
  S.wsId = t.wsId; S.folderId = t.folderId; S.reqId = t.reqId
  S.reqTab = t.reqTab; S.resTab = t.resTab
}

function switchTab(tabId) {
  if (tabId === S.activeTabId) return
  syncFromDOM(); syncActiveTab()
  const t = S.tabs.find(t => t.id === tabId)
  if (!t) return
  loadTab(t)
  renderTabs(); renderRequestPanel(); renderResponse(); renderSidebar()
  saveTabSession()
}

function addTab() {
  syncFromDOM(); syncActiveTab()
  const t = newTabObj()
  S.tabs.push(t); loadTab(t)
  renderTabs(); renderRequestPanel(); renderResponse(); renderSidebar()
  saveTabSession()
}

function closeTab(tabId) {
  if (S.tabs.length === 1) { newRequest(); return }
  const idx = S.tabs.findIndex(t => t.id === tabId)
  const wasActive = tabId === S.activeTabId
  S.tabs.splice(idx, 1)
  if (wasActive) {
    const t = S.tabs[Math.min(idx, S.tabs.length - 1)]
    loadTab(t)
    renderRequestPanel(); renderResponse(); renderSidebar()
  }
  renderTabs()
  saveTabSession()
}

// ─── tab session persistence ──────────────────────────────────────────────
function saveTabSession() {
  try { localStorage.setItem('wren_tabs', JSON.stringify({ tabs: S.tabs, activeTabId: S.activeTabId })) } catch (_) {}
}

function restoreTabSession() {
  try {
    const saved = JSON.parse(localStorage.getItem('wren_tabs') || 'null')
    if (saved && saved.tabs && saved.tabs.length) {
      S.tabs = saved.tabs
      S.activeTabId = saved.activeTabId
      const t = S.tabs.find(t => t.id === S.activeTabId) || S.tabs[0]
      if (t) loadTab(t)
      return true
    }
  } catch (_) {}
  return false
}

// ─── sidebar ──────────────────────────────────────────────────────────────
function renderSidebar() {
  // env select
  const envSel = $('env-select')
  envSel.innerHTML = `<option value="">No environment</option>` +
    S.environments.map(e =>
      `<option value="${esc(e.id)}"${e.id === S.envId ? ' selected' : ''}>${esc(e.name)}</option>`
    ).join('')

  const list = $('workspace-list')
  if (!S.workspaces.length) {
    list.innerHTML = `<div class="empty-ws">No workspaces yet.<br><small>Click "+ Workspace" to start.</small></div>`
    return
  }

  list.innerHTML = S.workspaces.map(ws => {
    const open = S.expandedWs.has(ws.id)
    const inner = open ? (() => {
      const reqs = (ws.requests || []).map(r => reqItemHtml(ws.id, '', r)).join('')
      const folders = (ws.folders || []).map(f => {
        const frqs = (f.requests || []).map(r => reqItemHtml(ws.id, f.id, r)).join('')
        return `<div class="folder-item">
          <div class="folder-header" onclick="toggleFolder(event,'${esc(ws.id)}','${esc(f.id)}')">
            <span class="folder-arrow">▶</span><span>${esc(f.name)}</span>
          </div>
          <div class="folder-requests" style="display:none">${frqs}</div>
        </div>`
      }).join('')
      return `<div class="ws-requests">${reqs}${folders}</div>`
    })() : ''

    return `<div class="ws-item">
      <div class="ws-header${S.wsId === ws.id ? ' active' : ''}" onclick="toggleWs('${esc(ws.id)}')">
        <span class="ws-arrow${open ? ' open' : ''}">▶</span>
        <span class="ws-name">${esc(ws.name)}</span>
        <span class="ws-actions">
          <button class="btn-icon" title="Delete" onclick="event.stopPropagation();deleteWorkspace('${esc(ws.id)}')">✕</button>
        </span>
      </div>
      ${inner}
    </div>`
  }).join('')
}

function reqItemHtml(wsId, folderId, r) {
  const active = S.reqId === r.id && S.wsId === wsId
  return `<div class="req-item${active ? ' active' : ''}" onclick="loadReq('${esc(wsId)}','${esc(folderId)}','${esc(r.id)}')">
    ${mbHtml(r.method)}
    <span class="req-item-name">${esc(r.name || r.url || 'Untitled')}</span>
  </div>`
}

function toggleWs(id) {
  S.expandedWs.has(id) ? S.expandedWs.delete(id) : S.expandedWs.add(id)
  renderSidebar()
}

function toggleFolder(e, wsId, fId) {
  e.stopPropagation()
  const folderItem = e.currentTarget.parentElement
  const reqs = folderItem.querySelector('.folder-requests')
  const arrow = folderItem.querySelector('.folder-arrow')
  const open = reqs.style.display === ''
  reqs.style.display = open ? 'none' : ''
  arrow.textContent = open ? '▶' : '▼'
}

// ─── request panel ────────────────────────────────────────────────────────
function renderRequestPanel() {
  $('req-name').value = S.req.name
  $('req-method').value = S.req.method
  updateMethodColor()
  $('req-url').value = S.req.url
  renderTab(S.reqTab)
  setReqTabActive(S.reqTab)
}

function updateMethodColor() {
  const sel = $('req-method')
  sel.className = 'method-select method-' + sel.value
}

function setReqTabActive(tab) {
  document.querySelectorAll('.req-tabs .tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab))
  document.querySelectorAll('.tab-panel').forEach(p =>
    p.classList.toggle('active', p.id === 'tab-' + tab))
}

function renderTab(tab) {
  switch (tab) {
    case 'params':   renderKV('tab-params', S.req.params || [], 'params'); break
    case 'headers':  renderKV('tab-headers', S.req.headers || [], 'headers'); break
    case 'body':     renderBodyTab(); break
    case 'auth':     renderAuthTab(); break
  }
}

// ── KV table (params & headers) ──────────────────────────────────────────
function renderKV(panelId, rows, field) {
  $(panelId).innerHTML =
    rows.map((r, i) => `<div class="kv-row" data-field="${field}" data-idx="${i}">
      <input type="checkbox" class="kv-check"${r.enabled ? ' checked' : ''} data-f="enabled">
      <input type="text" class="kv-key" placeholder="Key" value="${esc(r.key)}" data-f="key">
      <input type="text" class="kv-val" placeholder="Value" value="${esc(r.value)}" data-f="val">
      <button class="btn-icon" onclick="removeKV('${field}',${i})">✕</button>
    </div>`).join('') +
    `<button class="add-row-btn" onclick="addKV('${field}')">+ Add</button>`
}

function addKV(field) {
  S.req[field] = S.req[field] || []
  S.req[field].push({ key: '', value: '', enabled: true })
  renderKV('tab-' + field, S.req[field], field)
}

function removeKV(field, idx) {
  S.req[field].splice(idx, 1)
  renderKV('tab-' + field, S.req[field], field)
}

function syncKV(field) {
  S.req[field] = [...document.querySelectorAll(`.kv-row[data-field="${field}"]`)].map(row => ({
    key:     row.querySelector('[data-f="key"]').value,
    value:   row.querySelector('[data-f="val"]').value,
    enabled: row.querySelector('[data-f="enabled"]').checked,
  }))
}

// ── Body tab ─────────────────────────────────────────────────────────────
function renderBodyTab() {
  const b = S.req.body
  const typeBtns = ['none','json','form','multipart','raw'].map(t =>
    `<button class="body-type-btn${b.type === t ? ' active' : ''}" onclick="setBodyType('${t}')">${t}</button>`
  ).join('')

  let inner = ''
  if (b.type === 'none') {
    inner = `<span style="color:var(--text3);font-size:12px;margin-top:4px">No request body.</span>`
  } else if (b.type === 'json') {
    inner = `<div id="body-ta" class="body-ce json-viewer" contenteditable="true" spellcheck="false" data-placeholder='{ "key": "value" }' oninput="updateBodyCE()" onkeydown="handleBodyKeydown(event)" onpaste="handleBodyPaste(event)"></div>`
    inner += `<button class="add-row-btn" onclick="beautifyJSON()" style="margin-top:2px">Beautify</button>`
  } else if (b.type === 'raw') {
    inner = `<textarea id="body-ta" class="body-textarea" placeholder="Raw body…">${esc(b.content)}</textarea>`
  } else {
    const fields = b.fields || []
    inner = fields.map((f, i) => `<div class="kv-row" data-field="bodyfields" data-idx="${i}">
      <input type="checkbox" class="kv-check"${f.enabled ? ' checked' : ''} data-f="enabled">
      <input type="text" class="kv-key" placeholder="Key" value="${esc(f.key)}" data-f="key">
      <input type="text" class="kv-val" placeholder="Value" value="${esc(f.value)}" data-f="val">
      <button class="btn-icon" onclick="removeBodyField(${i})">✕</button>
    </div>`).join('') + `<button class="add-row-btn" onclick="addBodyField()">+ Add</button>`
  }

  $('tab-body').innerHTML = `<div class="body-type-bar">${typeBtns}</div>${inner}`
  if (b.type === 'json') $('body-ta').innerHTML = colorizeJSON(b.content)
}

function setBodyType(type) {
  syncBody()
  S.req.body.type = type
  renderBodyTab()
}

function getCaretOffset(el) {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return 0
  const range = sel.getRangeAt(0)
  let count = 0
  const walk = node => {
    if (node === range.endContainer) { count += range.endOffset; return true }
    if (node.nodeType === Node.TEXT_NODE) { count += node.length }
    else if (node.nodeName === 'BR') { count += 1 }
    else { for (const c of node.childNodes) { if (walk(c)) return true } }
    return false
  }
  walk(el)
  return count
}

function restoreCaretOffset(el, offset) {
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  let charCount = 0, found = false
  const walk = node => {
    if (found) return
    if (node.nodeType === Node.TEXT_NODE) {
      const end = charCount + node.length
      if (offset <= end) {
        range.setStart(node, offset - charCount)
        range.collapse(true)
        found = true
        return
      }
      charCount = end
    } else { for (const c of node.childNodes) walk(c) }
  }
  walk(el)
  if (!found) { range.selectNodeContents(el); range.collapse(false) }
  sel.removeAllRanges(); sel.addRange(range)
}

function updateBodyCE() {
  const el = $('body-ta')
  if (!el || el.tagName === 'TEXTAREA') return
  const offset = getCaretOffset(el)
  el.innerHTML = colorizeJSON(el.innerText || '')
  restoreCaretOffset(el, offset)
}

function handleBodyPaste(e) {
  e.preventDefault()
  document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
}

function handleBodyKeydown(e) {
  if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  ') }
  else if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); document.execCommand('insertText', false, '\n') }
}

function beautifyJSON() {
  const el = $('body-ta')
  if (!el) return
  const text = el.tagName === 'TEXTAREA' ? el.value : (el.innerText || '')
  try {
    const formatted = JSON.stringify(JSON.parse(text.trim()), null, 2)
    el.innerHTML = colorizeJSON(formatted)
    S.req.body.content = formatted
    const r = document.createRange(), s = window.getSelection()
    r.selectNodeContents(el); r.collapse(false); s.removeAllRanges(); s.addRange(r)
  } catch (_) { alert('Invalid JSON') }
}

function addBodyField() {
  S.req.body.fields = S.req.body.fields || []
  S.req.body.fields.push({ key: '', value: '', enabled: true })
  renderBodyTab()
}

function removeBodyField(idx) {
  S.req.body.fields.splice(idx, 1)
  renderBodyTab()
}

function syncBody() {
  const ta = $('body-ta')
  if (ta) {
    const text = ta.tagName === 'TEXTAREA' ? ta.value : (ta.innerText || '')
    S.req.body.content = S.req.body.type === 'json' ? text.trim() : text
  }
  const rows = [...document.querySelectorAll('.kv-row[data-field="bodyfields"]')]
  if (rows.length) {
    S.req.body.fields = rows.map(row => ({
      key:     row.querySelector('[data-f="key"]').value,
      value:   row.querySelector('[data-f="val"]').value,
      enabled: row.querySelector('[data-f="enabled"]').checked,
    }))
  }
}

// ── Auth tab ─────────────────────────────────────────────────────────────
function renderAuthTab() {
  const a = S.req.auth
  const typeBtns = ['none','bearer','basic','custom'].map(t =>
    `<button class="auth-type-btn${a.type === t ? ' active' : ''}" onclick="setAuthType('${t}')">${t}</button>`
  ).join('')

  let fields = ''
  if (a.type === 'bearer') {
    fields = `<div class="form-group"><label>Token</label>
      <input type="text" id="auth-token" value="${esc(a.token)}" placeholder="{{token}} or paste token"></div>`
  } else if (a.type === 'basic') {
    fields = `<div class="form-group"><label>Username</label>
      <input type="text" id="auth-user" value="${esc(a.username)}" placeholder="username"></div>
      <div class="form-group"><label>Password</label>
      <input type="password" id="auth-pass" value="${esc(a.password)}" placeholder="password"></div>`
  } else if (a.type === 'custom') {
    fields = `<div class="form-group"><label>Header name</label>
      <input type="text" id="auth-hdr" value="${esc(a.header)}" placeholder="X-API-Key"></div>
      <div class="form-group"><label>Value</label>
      <input type="text" id="auth-val" value="${esc(a.value)}" placeholder="{{apiKey}}"></div>`
  }

  $('tab-auth').innerHTML = `<div class="auth-type-bar">${typeBtns}</div>${fields}`
}

function setAuthType(type) {
  syncAuth()
  S.req.auth.type = type
  renderAuthTab()
}

function syncAuth() {
  const a = S.req.auth
  if ($('auth-token')) a.token    = $('auth-token').value
  if ($('auth-user'))  a.username = $('auth-user').value
  if ($('auth-pass'))  a.password = $('auth-pass').value
  if ($('auth-hdr'))   a.header   = $('auth-hdr').value
  if ($('auth-val'))   a.value    = $('auth-val').value
}

// ─── response panel ───────────────────────────────────────────────────────
function renderResponse() {
  const r = S.response
  const meta = $('res-meta')
  const body = $('res-body')

  if (!r) {
    meta.innerHTML = ''
    body.innerHTML = `<div style="color:var(--text3);font-size:12px;padding:20px">Send a request to see the response.</div>`
    return
  }
  if (r.error) {
    meta.innerHTML = `<span style="color:var(--err);font-size:12px">Request failed</span>`
    body.innerHTML = `<pre class="json-viewer" style="color:var(--err)">${esc(r.error)}</pre>`
    return
  }

  const cls = statusCls(r.status)
  meta.innerHTML = `
    <span class="status-badge ${cls}">${esc(r.statusText)}</span>
    <span style="color:var(--text2)">${fmtTime(r.duration)}</span>
    <span style="color:var(--text2)">${fmtSize(r.size)}</span>`

  setResTabActive(S.resTab)
  renderResBody(S.resTab)
}

function setResTabActive(tab) {
  document.querySelectorAll('.res-tabs .tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab))
}

function renderResBody(tab) {
  const r = S.response
  if (!r || r.error) return
  const body = $('res-body')

  if (tab === 'pretty') {
    const ct = Object.entries(r.headers || {})
      .find(([k]) => k.toLowerCase() === 'content-type')?.[1] || ''
    const looksJSON = ct.includes('json') || /^\s*[\[{]/.test(r.body)
    body.innerHTML = `<pre class="json-viewer">${looksJSON ? highlightJSON(r.body) : esc(r.body)}</pre>`
  } else if (tab === 'raw') {
    body.innerHTML = `<pre class="json-viewer">${esc(r.body)}</pre>`
  } else {
    const rows = Object.entries(r.headers || {}).map(([k, v]) =>
      `<div style="display:flex;gap:12px;padding:2px 0;border-bottom:1px solid var(--border)">
        <span style="color:var(--accent);min-width:180px;flex-shrink:0;font-size:11px">${esc(k)}</span>
        <span style="color:var(--text2);font-size:11px;word-break:break-all">${esc(v)}</span>
      </div>`
    ).join('')
    body.innerHTML = `<div style="display:flex;flex-direction:column">${rows}</div>`
  }
}

// ─── load / save ──────────────────────────────────────────────────────────
function loadReq(wsId, folderId, reqId) {
  const ws = S.workspaces.find(w => w.id === wsId)
  if (!ws) return
  const req = folderId
    ? ws.folders?.find(f => f.id === folderId)?.requests?.find(r => r.id === reqId)
    : ws.requests?.find(r => r.id === reqId)
  if (!req) return

  S.wsId = wsId; S.folderId = folderId; S.reqId = reqId
  S.req = clone(req)
  S.response = null; S.reqTab = 'params'; S.resTab = 'pretty'
  syncActiveTab(); renderTabs()
  renderRequestPanel(); renderResponse(); renderSidebar()
  saveTabSession()
}

function newRequest() {
  S.reqId = ''; S.folderId = ''; S.wsId = ''
  S.req = blankReq(); S.response = null; S.reqTab = 'params'; S.resTab = 'pretty'
  syncActiveTab(); renderTabs()
  renderRequestPanel(); renderResponse(); renderSidebar()
  saveTabSession()
}

function syncFromDOM() {
  S.req.name   = $('req-name').value
  S.req.method = $('req-method').value
  S.req.url    = $('req-url').value
  syncKV('params'); syncKV('headers'); syncBody(); syncAuth()
}

async function saveRequest() {
  syncFromDOM()
  if (!S.wsId) { openSaveModal(); return }
  if (!S.req.id) S.req.id = uid()
  if (!S.req.name) S.req.name = S.req.url || 'Untitled'

  const ws = clone(S.workspaces.find(w => w.id === S.wsId))
  if (!ws) { openSaveModal(); return }

  const upsert = (arr, item) => {
    const i = arr.findIndex(r => r.id === item.id)
    if (i >= 0) arr[i] = item; else arr.push(item)
  }

  if (S.folderId) {
    const f = ws.folders?.find(f => f.id === S.folderId)
    if (f) upsert(f.requests, clone(S.req))
  } else {
    upsert(ws.requests, clone(S.req))
  }

  try {
    const updated = await api.json('PUT', `/api/workspaces/${ws.id}`, ws)
    const idx = S.workspaces.findIndex(w => w.id === ws.id)
    S.workspaces[idx] = updated
    S.reqId = S.req.id
    renderSidebar()
  } catch (e) { alert('Save failed: ' + e) }
}

// ─── send ─────────────────────────────────────────────────────────────────
async function sendRequest() {
  if (S.loading) return
  syncFromDOM()

  const env = S.environments.find(e => e.id === S.envId) || { id: '', name: '', variables: {} }
  S.loading = true
  const btn = $('btn-send')
  btn.classList.add('loading'); btn.textContent = '…'

  try {
    S.response = await api.json('POST', '/api/send', { request: S.req, environment: env })
  } catch (e) {
    S.response = { error: String(e) }
  }

  S.loading = false
  btn.classList.remove('loading'); btn.textContent = 'Send'
  S.resTab = 'pretty'
  syncActiveTab()
  saveTabSession()
  renderResponse()
}

// ─── curl import/export ───────────────────────────────────────────────────
function openCurlImport() { openModal('modal-curl') }

async function importCurl() {
  const text = $('curl-input').value.trim()
  if (!text) return
  try {
    const req = await api.json('POST', '/api/import/curl', { curl: text })
    S.req = { ...blankReq(), ...req }
    S.reqId = ''; syncActiveTab(); renderTabs(); renderRequestPanel(); closeModal()
  } catch (e) { alert('Parse error: ' + e) }
}

async function copyCurl() {
  syncFromDOM()
  try {
    const { curl } = await api.json('POST', '/api/export/curl', S.req)
    await navigator.clipboard.writeText(curl)
    const btn = $('btn-copy-curl')
    btn.textContent = 'Copied!'
    setTimeout(() => { btn.textContent = 'Copy cURL' }, 1500)
  } catch (_) { alert('Failed to copy') }
}

// ─── workspaces ───────────────────────────────────────────────────────────
function openNewWorkspace() {
  $('new-ws-name').value = ''
  openModal('modal-new-ws')
  setTimeout(() => $('new-ws-name').focus(), 50)
}

async function createWorkspace() {
  const name = $('new-ws-name').value.trim()
  if (!name) return
  try {
    const ws = await api.json('POST', '/api/workspaces', { name })
    S.workspaces.push(ws)
    S.wsId = ws.id; S.expandedWs.add(ws.id)
    closeModal(); renderSidebar()
  } catch (e) { alert('Error: ' + e) }
}

async function deleteWorkspace(id) {
  if (!confirm('Delete this workspace and all its requests?')) return
  try {
    await api.del(`/api/workspaces/${id}`)
    S.workspaces = S.workspaces.filter(w => w.id !== id)
    if (S.wsId === id) { S.wsId = ''; S.req = blankReq(); S.response = null; renderRequestPanel(); renderResponse() }
    renderSidebar()
  } catch (e) { alert('Error: ' + e) }
}

// ─── save modal ───────────────────────────────────────────────────────────
function openSaveModal() {
  $('save-ws-select').innerHTML = S.workspaces.map(w =>
    `<option value="${esc(w.id)}"${w.id === S.wsId ? ' selected' : ''}>${esc(w.name)}</option>`
  ).join('')
  $('save-req-name').value = S.req.name || S.req.url || 'New Request'
  openModal('modal-save')
}

async function confirmSave() {
  const name = $('save-req-name').value.trim() || 'Untitled'
  const wsId = $('save-ws-select').value
  if (!wsId) { alert('Pick a workspace first'); return }
  S.req.name = name; S.wsId = wsId; S.folderId = ''
  await saveRequest(); closeModal()
}

// ─── environments ─────────────────────────────────────────────────────────
function openEnvModal() { renderEnvModal(); openModal('modal-env') }

function renderEnvModal() {
  const body = $('env-modal-body')
  if (!S.environments.length) {
    body.innerHTML = `<div style="color:var(--text3);font-size:12px">No environments yet. Add one above.</div>`
    return
  }
  body.innerHTML = S.environments.map(env => `
    <div class="env-entry" data-id="${esc(env.id)}" style="margin-bottom:12px">
      <div class="env-entry-header">
        <strong>${esc(env.name)}</strong>
        <button class="btn-icon" onclick="deleteEnv('${esc(env.id)}')">✕ Delete</button>
      </div>
      <div class="env-vars" style="display:flex;flex-direction:column;gap:4px;margin-top:6px">
        ${Object.entries(env.variables || {}).map(([k, v]) => `
          <div class="kv-row env-var-row" data-env="${esc(env.id)}">
            <input type="text" class="kv-key env-key" value="${esc(k)}" placeholder="KEY">
            <input type="text" class="kv-val env-val" value="${esc(v)}" placeholder="value">
            <button class="btn-icon" onclick="this.closest('.kv-row').remove()">✕</button>
          </div>`).join('')}
        <button class="add-row-btn" onclick="addEnvVar('${esc(env.id)}')">+ Add variable</button>
      </div>
    </div>`).join('<hr style="border:none;border-top:1px solid var(--border);margin:8px 0">')
}

function addEnvVar(envId) {
  const vars = document.querySelector(`.env-entry[data-id="${envId}"] .env-vars`)
  const row = document.createElement('div')
  row.className = 'kv-row env-var-row'; row.dataset.env = envId
  row.innerHTML = `<input type="text" class="kv-key env-key" placeholder="KEY"><input type="text" class="kv-val env-val" placeholder="value"><button class="btn-icon" onclick="this.closest('.kv-row').remove()">✕</button>`
  vars.insertBefore(row, vars.lastElementChild)
}

async function createEnv() {
  const name = $('new-env-name').value.trim()
  if (!name) return
  try {
    const env = await api.json('POST', '/api/environments', { name, variables: {} })
    S.environments.push(env)
    $('new-env-name').value = ''
    renderEnvModal(); renderSidebar()
  } catch (e) { alert('Error: ' + e) }
}

async function deleteEnv(id) {
  if (!confirm('Delete environment?')) return
  await api.del(`/api/environments/${id}`)
  S.environments = S.environments.filter(e => e.id !== id)
  if (S.envId === id) S.envId = ''
  renderEnvModal(); renderSidebar()
}

async function closeEnvModal() {
  // persist env changes
  for (const entry of document.querySelectorAll('.env-entry')) {
    const id = entry.dataset.id
    const env = S.environments.find(e => e.id === id)
    if (!env) continue
    const variables = {}
    entry.querySelectorAll('.env-var-row').forEach(row => {
      const k = row.querySelector('.env-key')?.value.trim()
      const v = row.querySelector('.env-val')?.value ?? ''
      if (k) variables[k] = v
    })
    env.variables = variables
    await api.json('PUT', `/api/environments/${id}`, env).catch(() => {})
  }
  closeModal(); renderSidebar()
}

// ─── postman import ───────────────────────────────────────────────────────
function openPostmanImport() { openModal('modal-postman') }

async function importPostman() {
  const file = $('postman-file').files[0]
  if (!file) return
  let col
  try { col = JSON.parse(await file.text()) } catch (_) { alert('Invalid JSON'); return }
  try {
    const ws = await api.json('POST', '/api/import/postman', col)
    S.workspaces.push(ws); S.expandedWs.add(ws.id)
    closeModal(); renderSidebar()
  } catch (e) { alert('Import failed: ' + e) }
}

// ─── history ──────────────────────────────────────────────────────────────
async function toggleHistory() {
  S.showHistory = !S.showHistory
  const sec = $('history-section')
  const btn = $('btn-history')
  if (S.showHistory) {
    sec.style.display = ''
    btn.textContent = 'History ▼'
    if (!S.historyDate) S.historyDate = new Date().toISOString().slice(0, 10)
    try {
      S.history = (await api.get(`/api/history?date=${S.historyDate}`)).reverse()
      renderHistory()
    } catch (_) {}
  } else {
    sec.style.display = 'none'
    btn.textContent = 'History ▶'
  }
}

async function goHistoryDay(date) {
  S.historyDate = date
  try {
    S.history = (await api.get(`/api/history?date=${date}`)).reverse()
    renderHistory()
  } catch (_) {}
}

function renderHistory() {
  const list = $('history-list')
  const today = new Date().toISOString().slice(0, 10)
  const date = S.historyDate || today
  const prev = new Date(date + 'T12:00:00Z'); prev.setUTCDate(prev.getUTCDate() - 1)
  const next = new Date(date + 'T12:00:00Z'); next.setUTCDate(next.getUTCDate() + 1)
  const prevStr = prev.toISOString().slice(0, 10)
  const nextStr = next.toISOString().slice(0, 10)
  const isToday = date === today
  const nav = `<div class="history-date-nav">
    <button onclick="goHistoryDay('${prevStr}')">‹</button>
    <span>${date}</span>
    <button onclick="goHistoryDay('${nextStr}')"${isToday ? ' disabled' : ''}>›</button>
  </div>`
  if (!S.history.length) {
    list.innerHTML = nav + `<div style="padding:6px 4px;color:var(--text3);font-size:11px">No history for this date.</div>`
    return
  }
  list.innerHTML = nav + S.history.slice(0, 40).map((h, i) => {
    const t = new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return `<div class="history-item" onclick="loadFromHistory(${i})">
      ${mbHtml(h.request?.method || 'GET')}
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(h.request?.url || '')}</span>
      <span style="color:var(--text3);font-size:10px">${t}</span>
    </div>`
  }).join('')
}

function loadFromHistory(idx) {
  const h = S.history[idx]
  if (!h) return
  syncFromDOM(); syncActiveTab()
  const t = newTabObj()
  t.req = clone(h.request)
  t.response = h.response ? clone(h.response) : null
  t.resTab = 'pretty'
  S.tabs.push(t); loadTab(t)
  renderTabs(); renderRequestPanel(); renderResponse(); renderSidebar()
  saveTabSession()
}

// ─── modals ───────────────────────────────────────────────────────────────
function openModal(id) {
  $('modal-overlay').classList.remove('hidden')
  document.querySelectorAll('.modal').forEach(m => m.classList.toggle('active', m.id === id))
}
function closeModal() {
  $('modal-overlay').classList.add('hidden')
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'))
}

// ─── event wiring ─────────────────────────────────────────────────────────
function wireEvents() {
  $('btn-send').onclick         = sendRequest
  $('btn-save').onclick         = saveRequest
  $('btn-new-req').onclick      = newRequest
  $('btn-import-curl').onclick  = openCurlImport
  $('btn-copy-curl').onclick    = copyCurl
  $('btn-new-ws').onclick       = openNewWorkspace
  $('btn-import-postman').onclick = openPostmanImport
  $('btn-manage-env').onclick   = openEnvModal
  $('btn-history').onclick      = toggleHistory

  $('req-method').onchange = () => { S.req.method = $('req-method').value; updateMethodColor() }
  $('req-url').oninput     = () => { S.req.url = $('req-url').value }
  $('req-name').oninput    = () => { S.req.name = $('req-name').value }
  $('env-select').onchange = () => { S.envId = $('env-select').value }

  // request tabs
  document.querySelectorAll('.req-tabs .tab-btn').forEach(btn => {
    btn.onclick = () => {
      if (S.reqTab === 'body') syncBody()
      if (S.reqTab === 'auth') syncAuth()
      S.reqTab = btn.dataset.tab
      setReqTabActive(S.reqTab); renderTab(S.reqTab)
    }
  })

  // response tabs
  document.querySelectorAll('.res-tabs .tab-btn').forEach(btn => {
    btn.onclick = () => {
      S.resTab = btn.dataset.tab
      setResTabActive(S.resTab); renderResBody(S.resTab)
    }
  })

  // modal overlay backdrop
  $('modal-overlay').onclick = e => { if (e.target === $('modal-overlay')) closeModal() }

  // modal buttons
  $('btn-curl-import').onclick   = importCurl
  $('btn-curl-cancel').onclick   = closeModal
  $('btn-new-ws-create').onclick = createWorkspace
  $('btn-new-ws-cancel').onclick = closeModal
  $('btn-save-confirm').onclick  = confirmSave
  $('btn-save-cancel').onclick   = closeModal
  $('btn-env-save').onclick      = closeEnvModal
  $('btn-env-add').onclick       = createEnv
  $('btn-postman-import').onclick = importPostman
  $('btn-postman-cancel').onclick = closeModal

  // new-ws-name Enter key
  $('new-ws-name').onkeydown = e => { if (e.key === 'Enter') createWorkspace() }

  // Cmd/Ctrl+Enter to send
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !S.loading) { e.preventDefault(); sendRequest() }
    if (e.key === 'Escape') closeModal()
  })

  // resize handle
  const handle = document.querySelector('.resize-handle')
  const reqPanel = document.querySelector('.request-panel')
  let dragging = false, startY = 0, startH = 0

  handle.onmousedown = e => {
    dragging = true; startY = e.clientY; startH = reqPanel.offsetHeight
    handle.classList.add('dragging')
    document.body.style.userSelect = 'none'
    e.preventDefault()
  }
  document.onmousemove = e => {
    if (!dragging) return
    const h = Math.max(150, Math.min(startH + e.clientY - startY, window.innerHeight - 180))
    reqPanel.style.height = h + 'px'
  }
  document.onmouseup = () => {
    dragging = false
    handle.classList.remove('dragging')
    document.body.style.userSelect = ''
  }

  window.addEventListener('beforeunload', () => {
    syncFromDOM(); syncActiveTab(); saveTabSession()
  })
}

// ─── init ─────────────────────────────────────────────────────────────────
async function init() {
  try {
    [S.workspaces, S.environments] = await Promise.all([
      api.get('/api/workspaces'),
      api.get('/api/environments'),
    ])
  } catch (e) { console.error('Init failed', e) }

  if (!restoreTabSession()) {
    const first = newTabObj()
    S.tabs = [first]; S.activeTabId = first.id
  }

  wireEvents()
  renderTabs()
  renderSidebar()
  renderRequestPanel()
  renderResponse()
}

init()
