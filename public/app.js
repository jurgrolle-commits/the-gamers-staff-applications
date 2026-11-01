const app = document.querySelector('#app');
const labels = { new: 'Nieuw', review: 'In behandeling', accepted: 'Aangenomen', rejected: 'Afgewezen' };
const icons = { Moderator: '◉', Manager: '✳', Administrator: '⌘' };
const savedTrackingCode = () => { try { return localStorage.getItem('staffApplicationTrackingCode') || ''; } catch { return ''; } };
const state = { applications: [], filter: 'active', query: '', selected: null, deleteConfirm: false, applicantCode: savedTrackingCode() };

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const date = value => { try { return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)); } catch { return '—'; } };
async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) { const error = new Error(data.error || 'Er ging iets mis.'); error.status = response.status; throw error; }
  return data;
}
const post = (url, data) => api(url, { method: 'POST', body: JSON.stringify(data) });
function statusBadge(status) { return `<span class="badge ${esc(status)}">${esc(labels[status] || status)}</span>`; }
function toast(text) { let el = document.querySelector('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); } el.textContent = text; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2400); }
function header() { return `<header class="wrap topbar"><a class="brand" href="#top" data-action="home"><span class="brand-symbol" aria-hidden="true"><span></span><span></span><span></span></span><span class="brandname">ONS TEAM<small>DISCORD COMMUNITY</small></span></a><nav class="nav"><a href="#rollen">De rollen</a><a href="#solliciteren">Solliciteren</a><a href="#sollicitant-status">Mijn status</a><button class="owner-btn" data-action="login">Inloggen als owner</button></nav></header>`; }
function footer() { return `<footer class="wrap footer"><div class="footer-inner"><span>© ${new Date().getFullYear()} · Solliciteren bij ons Discord-team</span><span class="footer-code">SAMEN MAKEN WE DE COMMUNITY <span style="color:#a78bfa">✦</span></span></div></footer>`; }
function home() {
  const roles = [['Moderator', 'LEDEN & MODERATIE', 'Help gesprekken prettig en veilig te houden en geef leden hulp als dat nodig is.'], ['Manager', 'TEAM & ORGANISATIE', 'Coördineer het team en houd afspraken, activiteiten en dagelijkse organisatie op koers.'], ['Administrator', 'BEHEER & ONTWIKKELING', 'Beheer de Discord-server en help de server verder ontwikkelen.']];
  return `${header()}<main id="top" class="wrap"><section class="hero"><div><div class="eyebrow"><i class="dot"></i> WE ZOEKEN NIEUWE TEAMLEDEN</div><h1>Samen maken we<br><em>het verschil.</em></h1><p>Wil je bijdragen aan onze Discord-community? Solliciteer als moderator, manager of administrator en vertel ons hoe jij wilt helpen.</p><a class="hero-link" href="#solliciteren">Bekijk de sollicitatie <span>↓</span></a></div><aside class="hero-aside"><div class="online"><i class="dot"></i> SOLLICITATIES ZIJN OPEN</div><h2>Er is plek voor jou.</h2><p>We zoeken mensen die graag samenwerken, verantwoordelijkheid nemen en onze leden een goede ervaring willen geven.</p><div class="statrow"><div class="stat"><strong>03</strong> TEAMROLLEN</div><div class="stat"><strong>JOUW</strong> INBRENG TELT</div></div></aside></section>
  <section id="sollicitant-status" class="tracking-section"><div class="tracking-copy"><div class="eyebrow"><i class="dot"></i> JOUW SOLLICITATIE</div><h2>Volg je sollicitatie</h2><p>Na het versturen bewaren we je persoonlijke volgcode op dit apparaat. Je ziet hier zodra je aanvraag nieuw, in behandeling, aangenomen of afgewezen is.</p></div><div class="tracking-card"><form id="trackingForm"><label for="trackingCode">Persoonlijke volgcode</label><div class="tracking-controls"><input id="trackingCode" name="code" value="${esc(state.applicantCode)}" required maxlength="64" autocomplete="off" placeholder="Plak hier je volgcode"><button class="primary" type="submit">Bekijk status <span>→</span></button></div><label class="remember-choice"><input id="rememberTracking" name="rememberTracking" type="checkbox" ${state.applicantCode ? 'checked' : ''}><span>Onthoud de code op dit apparaat</span></label></form><div id="statusResult" class="status-result" role="status" aria-live="polite">${state.applicantCode ? 'Je sollicitatiestatus wordt geladen…' : 'Je status verschijnt hier zodra je je volgcode invult.'}</div></div></section>
  <section id="rollen"><div class="section-head"><h2>Kies jouw rol</h2><p>Welke plek past bij jou?</p></div><div class="roles">${roles.map(([role, tag, description]) => `<article class="role"><div class="role-icon">${icons[role]}</div><h3>${role}</h3><p>${description}</p><div class="role-bottom"><span class="role-tag">${tag}</span><button class="link" data-action="choose-role" data-role="${role}">Deze rol kiezen&nbsp; →</button></div></article>`).join('')}</div></section>
  <section id="solliciteren" class="apply-wrap"><div class="apply-intro"><div class="eyebrow"><i class="dot"></i> SOLLICITATIE</div><h2>Vertel ons<br>wie je bent.</h2><p>Vul het formulier in. We nemen contact met je op via Discord als we je aanvraag hebben bekeken.</p><div class="steps"><div class="step"><b>01</b> Vertel iets over jezelf</div><div class="step"><b>02</b> We bekijken je aanvraag</div><div class="step"><b>03</b> Je hoort van ons</div></div></div><div class="form-card"><div class="form-title"><h3>Jouw sollicitatie</h3><span class="required-note">* VERPLICHT</span></div><form id="applicationForm"><div class="fields">
    <div class="field full"><label for="discord">Discord-gebruikersnaam <span class="req">*</span></label><input id="discord" name="discord" required minlength="2" maxlength="64" placeholder="Je Discord-gebruikersnaam of @naam" autocomplete="username"></div>
    <div class="field"><label for="age">Leeftijd <span class="req">*</span></label><input id="age" name="age" type="number" min="13" max="99" required placeholder="Je leeftijd"><span class="hint">Je moet minimaal 13 jaar zijn om te solliciteren.</span></div><div class="field"><label for="role">Ik solliciteer als <span class="req">*</span></label><select id="role" name="role" required><option value="" disabled selected>Kies een rol</option><option>Moderator</option><option>Manager</option><option>Administrator</option></select></div>
    <div class="field full"><label for="experience">Ervaring <span class="req">*</span></label><textarea id="experience" name="experience" required minlength="10" maxlength="1500" placeholder="Heb je eerder een community of Discord-server geholpen? Wat heb je daarvan geleerd?"></textarea></div>
    <div class="field full"><label for="motivation">Waarom wil je bij ons team? <span class="req">*</span></label><textarea id="motivation" name="motivation" required minlength="20" maxlength="2000" placeholder="Vertel wat jou enthousiast maakt en hoe jij onze community wilt helpen."></textarea></div>
    <div class="field full"><label for="availability">Beschikbaarheid <span class="req">*</span></label><input id="availability" name="availability" required maxlength="120" placeholder="Bijv. doordeweeks na 16:00 en in het weekend"></div></div><label class="consent"><input type="checkbox" name="consent" required><span>Ik geef toestemming om mijn gegevens te gebruiken voor de beoordeling van mijn sollicitatie.</span></label><button class="primary submit" type="submit">Verstuur sollicitatie <span>→</span></button><div id="formMessage" class="message" role="status" aria-live="polite"></div></form></div></section></main>${footer()}<div class="modal-backdrop" id="loginBackdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="loginHeading"><div class="modal-top"><div><div class="eyebrow">ALLEEN VOOR DE OWNER</div><h2 id="loginHeading">Owner-login</h2></div><button class="close" data-action="close-login" aria-label="Sluiten">×</button></div><p>Log in om sollicitaties te bekijken en te beoordelen.</p><form id="loginForm"><label class="field-label" for="ownerPassword">OWNER-PIN</label><input id="ownerPassword" name="password" type="password" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" autocomplete="current-password" required placeholder="4 cijfers"><div id="loginMessage" class="message" role="alert"></div><button class="primary submit" type="submit">Open het beheer&nbsp; →</button></form></section></div>`;
}
function admin() {
  const counts = { all: state.applications.length, active: 0, archived: 0, new: 0, review: 0, accepted: 0, rejected: 0 };
  state.applications.forEach(a => counts[a.status] = (counts[a.status] || 0) + 1);
  counts.archived = state.applications.filter(a => Boolean(a.archivedAt)).length;
  counts.active = counts.all - counts.archived;
  counts.new = state.applications.filter(a => !a.archivedAt && a.status === 'new').length;
  counts.review = state.applications.filter(a => !a.archivedAt && a.status === 'review').length;
  counts.accepted = state.applications.filter(a => !a.archivedAt && a.status === 'accepted').length;
  counts.rejected = state.applications.filter(a => !a.archivedAt && a.status === 'rejected').length;
  const filters = [['active', 'Actief'], ['all', 'Alles'], ['new', 'Nieuw'], ['review', 'In behandeling'], ['accepted', 'Aangenomen'], ['rejected', 'Afgewezen'], ['archived', 'Archief']];
  const apps = state.applications.filter(a => {
    const active = !a.archivedAt;
    const visible = state.filter === 'all' || (state.filter === 'active' && active) || (state.filter === 'archived' && !active) || (!['all', 'active', 'archived'].includes(state.filter) && active && a.status === state.filter);
    return visible && [a.discord, a.role].some(x => x.toLowerCase().includes(state.query.toLowerCase()));
  });
  return `<section class="screen active" aria-label="Ownerdashboard"><header class="wrap adminbar"><div class="brand-left"><span class="brand-symbol" aria-hidden="true"><span></span><span></span><span></span></span><span class="admin-title">ONS TEAM<small>OWNERBEHEER</small></span></div><div style="display:flex;gap:9px"><button class="secondary" data-action="refresh">Vernieuwen</button><button class="owner-btn" data-action="logout">Uitloggen</button></div></header><main class="wrap adminmain"><div class="admin-heading"><div><div class="eyebrow"><i class="dot"></i> BESLOTEN BEHEER</div><h1>Sollicitaties</h1><p>Open een aanvraag om de volledige sollicitatie te lezen en te beoordelen.</p></div></div><div class="summary">${[['Totaal', counts.all], ['Actief', counts.active], ['Nieuw', counts.new], ['Archief', counts.archived]].map(([name, count]) => `<div class="sumcard"><span>${name}</span><strong>${count}</strong></div>`).join('')}</div><div class="filters"><div class="filter-group">${filters.map(([key, name]) => `<button class="filter ${state.filter === key ? 'active' : ''}" data-action="filter" data-filter="${key}">${name}${key === 'all' ? '' : ` · ${counts[key] || 0}`}</button>`).join('')}</div><input class="search" data-search placeholder="Zoek op Discord-naam of rol…" aria-label="Zoek sollicitaties" value="${esc(state.query)}"></div><div class="table-wrap"><table><thead><tr><th>Discord-naam</th><th>Rol</th><th>Ingediend</th><th>Status</th><th>Acties</th></tr></thead><tbody>${apps.length ? apps.map(a => `<tr class="application-row" data-action="open-application" data-id="${esc(a.id)}"><td><span class="applicant">${esc(a.discord)}</span><span class="subtext">${a.age} jaar${a.archivedAt ? ' · Gearchiveerd' : ''}</span></td><td>${esc(a.role)}</td><td>${date(a.createdAt)}</td><td>${statusBadge(a.status)}</td><td class="row-actions"><button type="button" class="row-action" data-action="open-application" data-id="${esc(a.id)}">Open</button><button type="button" class="row-action archive-row" data-action="row-archive" data-id="${esc(a.id)}">${a.archivedAt ? 'Terugzetten' : 'Opzijzetten'}</button><button type="button" class="danger-icon" data-action="row-delete" data-id="${esc(a.id)}">Verwijderen</button></td></tr>`).join('') : `<tr><td colspan="5"><div class="empty"><strong>${state.applications.length ? 'Geen resultaten' : 'Nog geen sollicitaties'}</strong>${state.applications.length ? 'Pas je zoekopdracht of filter aan.' : 'Nieuwe sollicitaties verschijnen hier.'}</div></td></tr>`}</tbody></table></div><p class="storage-note"><b>Privébeheer.</b> Sollicitaties worden op de server bewaard en zijn alleen zichtbaar na owner-login.</p></main></section>`;
}
function detail() {
  const a = state.selected; if (!a) return '';
  const notes = a.notes || []; const history = a.history || [];
  return `<div class="modal-backdrop active" id="detailBackdrop"><section class="modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="detailTitle"><div class="modal-top"><div><div class="eyebrow">SOLLICITATIE · ${date(a.createdAt)}</div><h2 id="detailTitle">${esc(a.discord)}</h2></div><button class="close" data-action="close-detail" aria-label="Sluiten">×</button></div><div class="detail-grid"><div class="detail-item"><span>Discord-gebruikersnaam</span><p>${esc(a.discord)}</p></div><div class="detail-item"><span>Leeftijd</span><p>${a.age} jaar</p></div><div class="detail-item"><span>Rol</span><p>${esc(a.role)}</p></div><div class="detail-item"><span>Beschikbaarheid</span><p>${esc(a.availability)}</p></div><div class="detail-item wide"><span>Ervaring</span><p>${esc(a.experience)}</p></div><div class="detail-item wide"><span>Motivatie</span><p>${esc(a.motivation)}</p></div></div><div class="applicant-code"><div><span>VOLGCODE VOOR DE SOLLICITANT</span><code>${esc(a.id)}</code><small>Deel deze persoonlijke code via Discord. Hiermee kan de sollicitant de status bekijken.</small></div><button class="secondary" data-action="copy-applicant-code" data-code="${esc(a.id)}">Code kopiëren</button></div><div class="detail-actions"><div class="field"><label for="statusSelect">Status</label><select id="statusSelect"><option value="new">Nieuw</option><option value="review">In behandeling</option><option value="accepted">Aangenomen</option><option value="rejected">Afgewezen</option></select></div><button class="secondary" data-action="save-status" data-id="${esc(a.id)}">Status opslaan</button></div><div class="management-actions"><button class="secondary" data-action="toggle-archive" data-id="${esc(a.id)}">${a.archivedAt ? 'Terugzetten naar actief' : 'Opzijzetten'}</button><button class="danger-button" data-action="ask-delete">Definitief verwijderen</button></div>${state.deleteConfirm ? `<div class="delete-confirm" role="alert"><strong>Deze sollicitatie definitief verwijderen?</strong><p>De aanvraag en interne notities worden permanent gewist.</p><div><button class="secondary" data-action="cancel-delete">Annuleren</button> <button class="danger-button" data-action="confirm-delete" data-id="${esc(a.id)}">Verwijder definitief</button></div></div>` : ''}<div style="margin-top:18px"><label class="field-label" for="noteInput">Interne notitie</label><div style="display:flex;gap:8px;margin-top:7px"><input id="noteInput" maxlength="500" placeholder="Notitie voor jezelf…"><button class="secondary" data-action="add-note" data-id="${esc(a.id)}">Toevoegen</button></div><div class="note-list">${notes.length ? notes.map(n => `<div class="note"><small>${date(n.at)} · OWNER</small>${esc(n.text)}</div>`).join('') : 'Nog geen interne notities.'}</div></div>${history.length > 1 ? `<details style="margin-top:15px"><summary class="muted" style="cursor:pointer">Statusgeschiedenis</summary><div class="note-list">${history.slice().reverse().map(h => `<div class="note"><small>${date(h.at)}</small>${esc(labels[h.status] || h.status)}</div>`).join('')}</div></details>` : ''}</section></div>`;
}
function showMessage(id, text, kind) { const el = document.querySelector(`#${id}`); if (el) { el.className = `message show ${kind}`; el.textContent = text; } }
function showSuccess(code) {
  app.insertAdjacentHTML('beforeend', `<div class="modal-backdrop active success-backdrop" id="successBackdrop"><section class="modal success-modal" role="dialog" aria-modal="true" aria-labelledby="successTitle"><div class="success-icon"><svg viewBox="0 0 48 48" role="presentation"><path d="m14 25 7 7 14-16"/></svg></div><div class="eyebrow success-eyebrow">SOLLICITATIE VERSTUURD</div><h2 id="successTitle">Je sollicitatie is binnen!</h2><p>Je persoonlijke volgcode is op dit apparaat bewaard. Gebruik hem ook als je je status op een ander apparaat wilt bekijken.</p><div class="tracking-code"><span>JOUW VOLGCODE</span><code>${esc(code)}</code><button class="secondary" data-action="copy-tracking-code">Code kopiëren</button></div><button class="primary success-close" data-action="show-status">Bekijk mijn status&nbsp; →</button></section></div>`);
  document.body.classList.add('modal-open');
  document.querySelector('[data-action="close-success"]')?.focus();
}
function closeSuccess() { document.querySelector('#successBackdrop')?.remove(); document.body.classList.remove('modal-open'); }
function statusMessage(status) { return ({ new:'Je sollicitatie is goed ontvangen en wacht op beoordeling.', review:'Het team is je sollicitatie aan het bekijken.', accepted:'Goed nieuws! Je bent aangenomen. Gefeliciteerd!', rejected:'Je sollicitatie is afgewezen. Bedankt voor je interesse en moeite.' })[status] || 'Je sollicitatiestatus is bijgewerkt.'; }
async function checkApplicantStatus(code, remember = false, silent = false) {
  const result = document.querySelector('#statusResult'); if (!result) return;
  const value = String(code || '').trim().toLowerCase();
  if (!value) { result.textContent = 'Vul je persoonlijke volgcode in om je status te bekijken.'; return; }
  if (!silent) result.innerHTML = '<span class="status-loading"><i></i> Status ophalen…</span>';
  try {
    const data = await post('/api/application-status', { code:value });
    const application = data.application;
    let previousStatus = '';
    try { previousStatus = localStorage.getItem(`staffApplicationLastStatus:${value}`) || ''; localStorage.setItem(`staffApplicationLastStatus:${value}`, application.status); } catch {}
    if (remember) { try { localStorage.setItem('staffApplicationTrackingCode', value); } catch {} state.applicantCode = value; }
    if (previousStatus && previousStatus !== application.status) toast(`Melding: je sollicitatiestatus is gewijzigd naar ${labels[application.status] || application.status}.`);
    result.innerHTML = `<div class="status-card"><div><span class="status-caption">STATUS · ${esc(application.role)}</span><h3>${esc(labels[application.status] || 'Bijgewerkt')}</h3><p>${esc(statusMessage(application.status))}</p><small>Ingediend ${date(application.createdAt)} · Status bijgewerkt ${date(application.updatedAt)}</small></div><button class="secondary" type="button" data-action="refresh-applicant-status">Vernieuwen</button></div>${state.applicantCode ? '<button class="forget-tracking" type="button" data-action="forget-tracking">Vergeet deze code op dit apparaat</button>' : ''}`;
  } catch (error) {
    if (!silent) result.innerHTML = `<p class="status-error" role="alert">${esc(error.message)}</p>`;
    if (error.status === 404 && state.applicantCode === value) { state.applicantCode = ''; try { localStorage.removeItem('staffApplicationTrackingCode'); } catch {} }
  }
}
function openLogin() { document.querySelector('#loginBackdrop')?.classList.add('active'); document.querySelector('#ownerPassword')?.focus(); }
function renderDetail() { document.querySelector('#detailBackdrop')?.remove(); if (state.selected) { app.insertAdjacentHTML('beforeend', detail()); document.querySelector('#statusSelect').value = state.selected.status; } }
async function refreshApplications() { const data = await api('/api/applications'); state.applications = data.applications; }
async function openApplication(id) { try { const data = await api(`/api/applications/${encodeURIComponent(id)}`); state.selected = data.application; renderDetail(); } catch (error) { if (error.status === 401) await logout(false); else toast(error.message); } }
async function logout(notify = true) { try { await post('/api/auth/logout', {}); } catch {} state.selected = null; state.applications = []; state.filter = 'active'; state.deleteConfirm = false; app.innerHTML = home(); if (notify) toast('Je bent uitgelogd'); }

app.addEventListener('click', async event => {
  if (event.target.id === 'detailBackdrop') { state.selected = null; state.deleteConfirm = false; event.target.remove(); return; }
  if (event.target.id === 'successBackdrop') { closeSuccess(); return; }
  if (event.target.id === 'loginBackdrop') { event.target.classList.remove('active'); return; }
  const button = event.target.closest('[data-action]'); if (!button) return;
  const action = button.dataset.action;
  if (action === 'retry') location.reload();
  if (action === 'login') openLogin();
  if (action === 'close-login') document.querySelector('#loginBackdrop')?.classList.remove('active');
  if (action === 'close-success') closeSuccess();
  if (action === 'show-status') { closeSuccess(); document.querySelector('#sollicitant-status')?.scrollIntoView({ behavior:'smooth' }); if (state.applicantCode) await checkApplicantStatus(state.applicantCode, true); }
  if (action === 'refresh-applicant-status') await checkApplicantStatus(document.querySelector('#trackingCode')?.value || state.applicantCode, Boolean(document.querySelector('#rememberTracking')?.checked));
  if (action === 'forget-tracking') { const forgottenCode = state.applicantCode; state.applicantCode = ''; try { localStorage.removeItem('staffApplicationTrackingCode'); localStorage.removeItem(`staffApplicationLastStatus:${forgottenCode}`); } catch {} const input = document.querySelector('#trackingCode'); if (input) input.value = ''; const remember = document.querySelector('#rememberTracking'); if (remember) remember.checked = false; const result = document.querySelector('#statusResult'); if (result) result.textContent = 'De volgcode is van dit apparaat verwijderd.'; }
  if (action === 'copy-tracking-code') { try { await navigator.clipboard.writeText(state.applicantCode); toast('Volgcode gekopieerd'); } catch { toast('Kopiëren lukte niet. Selecteer de code en kopieer hem handmatig.'); } }
  if (action === 'copy-applicant-code') { try { await navigator.clipboard.writeText(button.dataset.code); toast('Volgcode gekopieerd. Stuur hem zelf via Discord naar de sollicitant.'); } catch { toast('Kopiëren lukte niet. Selecteer de code en kopieer hem handmatig.'); } }
  if (action === 'choose-role') { document.querySelector('#role').value = button.dataset.role; document.querySelector('#solliciteren').scrollIntoView({ behavior: 'smooth' }); setTimeout(() => document.querySelector('#discord')?.focus({ preventScroll: true }), 450); }
  if (action === 'filter') { state.filter = button.dataset.filter; app.innerHTML = admin(); }
  if (action === 'refresh') { button.disabled = true; try { await refreshApplications(); app.innerHTML = admin(); toast('Sollicitaties bijgewerkt'); } catch (error) { toast(error.message); } }
  if (action === 'open-application') await openApplication(button.dataset.id);
  if (action === 'row-archive') {
    button.disabled = true;
    try { const application = state.applications.find(a => a.id === button.dataset.id); const archived = !application?.archivedAt; await api(`/api/applications/${encodeURIComponent(button.dataset.id)}/archive`, { method: 'PATCH', body: JSON.stringify({ archived }) }); await refreshApplications(); app.innerHTML = admin(); toast(archived ? 'Sollicitatie opzijgezet in het archief' : 'Sollicitatie teruggezet naar actief'); }
    catch (error) { toast(error.message); button.disabled = false; }
  }
  if (action === 'row-delete') { await openApplication(button.dataset.id); if (state.selected) { state.deleteConfirm = true; renderDetail(); } }
  if (action === 'close-detail') { state.selected = null; state.deleteConfirm = false; document.querySelector('#detailBackdrop')?.remove(); }
  if (action === 'save-status') {
    button.disabled = true;
    try { await api(`/api/applications/${encodeURIComponent(button.dataset.id)}/status`, { method: 'PATCH', body: JSON.stringify({ status: document.querySelector('#statusSelect').value }) }); await refreshApplications(); state.selected = state.applications.find(x => x.id === button.dataset.id); app.innerHTML = admin(); renderDetail(); toast('Status bijgewerkt'); }
    catch (error) { toast(error.message); button.disabled = false; }
  }
  if (action === 'toggle-archive') {
    button.disabled = true;
    try {
      const archived = !state.selected.archivedAt;
      await api(`/api/applications/${encodeURIComponent(button.dataset.id)}/archive`, { method: 'PATCH', body: JSON.stringify({ archived }) });
      await refreshApplications(); state.selected = state.applications.find(x => x.id === button.dataset.id); state.deleteConfirm = false;
      app.innerHTML = admin(); renderDetail(); toast(archived ? 'Sollicitatie gearchiveerd' : 'Sollicitatie teruggezet naar actief');
    } catch (error) { toast(error.message); button.disabled = false; }
  }
  if (action === 'ask-delete') { state.deleteConfirm = true; renderDetail(); }
  if (action === 'cancel-delete') { state.deleteConfirm = false; renderDetail(); }
  if (action === 'confirm-delete') {
    button.disabled = true;
    try {
      await api(`/api/applications/${encodeURIComponent(button.dataset.id)}`, { method: 'DELETE' });
      state.selected = null; state.deleteConfirm = false; await refreshApplications(); app.innerHTML = admin(); toast('Sollicitatie definitief verwijderd');
    } catch (error) { toast(error.message); button.disabled = false; }
  }
  if (action === 'add-note') {
    const input = document.querySelector('#noteInput'); const note = input.value.trim(); if (!note) { input.focus(); return; } button.disabled = true;
    try { await post(`/api/applications/${encodeURIComponent(button.dataset.id)}/notes`, { note }); await refreshApplications(); state.selected = state.applications.find(x => x.id === button.dataset.id); app.innerHTML = admin(); renderDetail(); toast('Notitie toegevoegd'); }
    catch (error) { toast(error.message); button.disabled = false; }
  }
  if (action === 'logout') await logout();
  if (action === 'home') { event.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
});
app.addEventListener('input', event => { if (event.target.matches('[data-search]')) { state.query = event.target.value; const position = event.target.selectionStart; app.innerHTML = admin(); const search = document.querySelector('[data-search]'); search.focus(); search.setSelectionRange(position, position); } });
app.addEventListener('submit', async event => {
  if (event.target.id === 'applicationForm') {
    event.preventDefault(); const form = event.target; if (!form.reportValidity()) return;
    const button = form.querySelector('[type=submit]'); button.disabled = true;
    const data = Object.fromEntries(new FormData(form)); data.consent = data.consent === 'on'; data.age = Number(data.age);
    try {
      const response = await post('/api/applications', data);
      state.applicantCode = response.trackingCode;
      try { localStorage.setItem('staffApplicationTrackingCode', state.applicantCode); } catch {}
      form.reset();
      const codeInput = document.querySelector('#trackingCode'); if (codeInput) codeInput.value = state.applicantCode;
      const rememberInput = document.querySelector('#rememberTracking'); if (rememberInput) rememberInput.checked = true;
      showSuccess(state.applicantCode);
      checkApplicantStatus(state.applicantCode, true, true);
    }
    catch (error) { showMessage('formMessage', error.message, 'error'); }
    finally { button.disabled = false; }
  }
  if (event.target.id === 'trackingForm') {
    event.preventDefault(); const form = event.target; const code = new FormData(form).get('code');
    if (!form.elements.rememberTracking.checked && !state.applicantCode) { await checkApplicantStatus(code); return; }
    if (!form.elements.rememberTracking.checked) { try { localStorage.removeItem('staffApplicationTrackingCode'); } catch {} state.applicantCode = ''; }
    await checkApplicantStatus(code, form.elements.rememberTracking.checked);
  }
  if (event.target.id === 'loginForm') {
    event.preventDefault(); const form = event.target; const button = form.querySelector('[type=submit]'); button.disabled = true;
    try { await post('/api/auth/login', { password: new FormData(form).get('password') }); state.filter = 'all'; state.query = ''; await refreshApplications(); app.innerHTML = admin(); }
    catch (error) { showMessage('loginMessage', error.message, 'error'); }
    finally { button.disabled = false; }
  }
});
async function start() {
  try { const status = await api('/api/auth/session'); if (status.authenticated) { await refreshApplications(); app.innerHTML = admin(); return; } app.innerHTML = home(); if (state.applicantCode) checkApplicantStatus(state.applicantCode, true, true); }
  catch { app.innerHTML = '<main class="error-screen"><div class="brand-symbol" style="margin:0 auto 22px"><span></span><span></span><span></span></div><h1>De site is niet bereikbaar.</h1><p>Start de server opnieuw of controleer de verbinding en vernieuw deze pagina.</p><button class="primary" data-action="retry" style="margin:auto">Opnieuw proberen</button></main>'; }
}
document.addEventListener('keydown', event => { if (event.key === 'Escape') { document.querySelector('#detailBackdrop')?.remove(); document.querySelector('#loginBackdrop')?.classList.remove('active'); closeSuccess(); state.selected = null; state.deleteConfirm = false; } });
start();
setInterval(() => { if (state.applicantCode && !document.hidden && document.querySelector('#statusResult')) checkApplicantStatus(state.applicantCode, true, true); }, 60000);

