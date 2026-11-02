const SESSION_MS = 12 * 60 * 60 * 1000;
const STATUS = new Set(['new', 'review', 'accepted', 'rejected']);
const ROLES = new Set(['Moderator', 'Manager', 'Administrator']);

const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const random = (length = 32) => { const bytes = crypto.getRandomValues(new Uint8Array(length)); return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''); };
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
const unhex = value => Uint8Array.from(value.match(/.{2}/g) || [], part => parseInt(part, 16));
const digest = async value => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));

async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(salt), iterations: 100000 }, key, 256));
}
function equal(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function cookie(request, name) {
  const part = (request.headers.get('Cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : '';
}
function cookieHeader(value, maxAge) {
  return `bh_session=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}
function withSecurity(response) {
  const h = new Headers(response.headers);
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('X-Frame-Options', 'DENY');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  h.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: h });
}
async function body(request) {
  if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) throw fail('Gebruik een geldig JSON-formulier.', 415);
  const raw = await request.text(); if (raw.length > 24000) throw fail('Dit formulier is te groot.', 413);
  try { const value = JSON.parse(raw); if (!value || Array.isArray(value) || typeof value !== 'object') throw 0; return value; }
  catch { throw fail('Het formulier is niet goed leesbaar.', 400); }
}
const text = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
function validateApplication(data) {
  const a = { discord: text(data.discord, 64), age: Number(data.age), role: text(data.role, 40), experience: text(data.experience, 1500), motivation: text(data.motivation, 2000), availability: text(data.availability, 120) };
  if (data.consent !== true) throw fail('Geef toestemming voordat je je sollicitatie verstuurt.');
  if (a.discord.length < 2) throw fail('Vul je Discord-gebruikersnaam in.');
  if (!Number.isInteger(a.age) || a.age < 1 || a.age > 120) throw fail('Vul een geldige leeftijd in. Er geldt geen minimumleeftijd.');
  if (!ROLES.has(a.role)) throw fail('Kies een van de beschikbare rollen.');
  if (a.experience.length < 10) throw fail('Vertel iets over je ervaring (minimaal 10 tekens).');
  if (a.motivation.length < 20) throw fail('Je motivatie is te kort (minimaal 20 tekens).');
  if (a.availability.length < 3) throw fail('Vul in wanneer je beschikbaar bent.');
  return a;
}
async function takeLimit(db, key, max, windowMs) {
  const now = Date.now();
  const row = await db.prepare(`INSERT INTO rate_limits (bucket, window_start, hits) VALUES (?, ?, 1)
    ON CONFLICT(bucket) DO UPDATE SET
      hits = CASE WHEN rate_limits.window_start <= ? THEN 1 ELSE rate_limits.hits + 1 END,
      window_start = CASE WHEN rate_limits.window_start <= ? THEN excluded.window_start ELSE rate_limits.window_start END
    RETURNING hits`).bind(key, now, now - windowMs, now - windowMs).first();
  return row.hits <= max;
}
async function ensureOwner(db, secret) {
  let owner = await db.prepare('SELECT salt, hash FROM owner WHERE id=1').first();
  if (!owner && secret && /^\d{4}$/.test(secret)) {
    const salt = random(16), hash = await passwordHash(secret, salt);
    await db.prepare('INSERT OR IGNORE INTO owner (id, salt, hash, created_at) VALUES (1, ?, ?, ?)').bind(salt, hash, new Date().toISOString()).run();
    owner = await db.prepare('SELECT salt, hash FROM owner WHERE id=1').first();
  }
  return owner;
}
async function session(db, request) {
  const token = cookie(request, 'bh_session'); if (!token || token.length > 150) return false;
  const row = await db.prepare('SELECT token_hash FROM sessions WHERE token_hash=? AND expires_at>?').bind(await digest(token), Date.now()).first();
  return Boolean(row);
}
async function getApplication(db, row) {
  const [notes, history] = await Promise.all([
    db.prepare('SELECT body, created_at FROM notes WHERE application_id=? ORDER BY id').bind(row.id).all(),
    db.prepare('SELECT status, created_at FROM status_history WHERE application_id=? ORDER BY id').bind(row.id).all()
  ]);
  return { id: row.id, discord: row.discord, age: row.age, role: row.role, experience: row.experience, motivation: row.motivation, availability: row.availability, status: row.status, archivedAt: row.archived_at, createdAt: row.created_at, notes: notes.results.map(n => ({ text: n.body, at: n.created_at })), history: history.results.map(h => ({ status: h.status, at: h.created_at })) };
}
async function handle(request, env) {
  const url = new URL(request.url), path = url.pathname, db = env.DB;
  if (request.method === 'GET' && path === '/api/health') return json({ ok: true, ownerConfigured: Boolean(await ensureOwner(db, env.OWNER_CODE)) });
  if (!path.startsWith('/api/')) return withSecurity(await env.ASSETS.fetch(request));
  if (['POST', 'PATCH', 'DELETE'].includes(request.method)) {
    const origin = request.headers.get('Origin');
    if (!origin || new URL(origin).host !== url.host) return json({ error: 'Dit verzoek is niet toegestaan.' }, 403);
  }
  if (path === '/api/applications' && request.method === 'POST') {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!await takeLimit(db, `submit:${await digest(ip)}`, 4, 3600000)) return json({ error: 'Er zijn te veel sollicitaties verstuurd vanaf dit netwerk. Probeer het later opnieuw.' }, 429);
    const a = validateApplication(await body(request)), id = crypto.randomUUID(), now = new Date().toISOString();
    await db.prepare('INSERT INTO applications (id,discord,age,role,experience,motivation,availability,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,a.discord,a.age,a.role,a.experience,a.motivation,a.availability,'new',now).run();
    await db.prepare('INSERT INTO status_history (application_id,status,created_at) VALUES (?,?,?)').bind(id,'new',now).run();
    return json({ ok:true, trackingCode:id, message:'Je sollicitatie is ontvangen. Bewaar je persoonlijke volgcode om je status te bekijken.' },201);
  }
  if (path === '/api/application-status' && request.method === 'POST') {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!await takeLimit(db, `status:${await digest(ip)}`, 30, 900000)) return json({ error:'Je hebt vaak een status gecontroleerd. Probeer het over 15 minuten opnieuw.' },429);
    const { code } = await body(request), id = text(code,64).toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return json({ error:'We konden geen sollicitatie met deze volgcode vinden.' },404);
    const row = await db.prepare('SELECT a.role,a.status,a.created_at,(SELECT h.created_at FROM status_history h WHERE h.application_id=a.id ORDER BY h.id DESC LIMIT 1) AS status_updated_at FROM applications a WHERE a.id=?').bind(id).first();
    if (!row) return json({ error:'We konden geen sollicitatie met deze volgcode vinden.' },404);
    return json({ application:{role:row.role,status:row.status,createdAt:row.created_at,updatedAt:row.status_updated_at||row.created_at} });
  }
  if (path === '/api/auth/login' && request.method === 'POST') {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const loginBucket = `login:${await digest(ip)}`;
    if (!await takeLimit(db, loginBucket, 5, 900000)) return json({ error:'Te veel mislukte inlogpogingen. Probeer het over 15 minuten opnieuw.' },429);
    const { password } = await body(request), secret = text(password,128), owner = await ensureOwner(db,env.OWNER_CODE);
    if (!owner) return json({ error:'De owner-login is nog niet ingesteld.' },503);
    if (!equal(await passwordHash(secret,owner.salt),owner.hash)) return json({ error:'De pincode of het wachtwoord klopt niet.' },401);
    await db.prepare('DELETE FROM rate_limits WHERE bucket=?').bind(loginBucket).run();
    const token=random(32), tokenHash=await digest(token), now=Date.now();
    await db.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(now).run();
    await db.prepare('INSERT INTO sessions (token_hash,expires_at,created_at) VALUES (?,?,?)').bind(tokenHash,now+SESSION_MS,now).run();
    return json({ok:true},200,{ 'Set-Cookie':cookieHeader(token,SESSION_MS/1000) });
  }
  if (path === '/api/auth/session' && request.method === 'GET') return json({ authenticated:await session(db,request), ownerConfigured:Boolean(await ensureOwner(db,env.OWNER_CODE)) });
  if (path === '/api/auth/logout' && request.method === 'POST') {
    const token=cookie(request,'bh_session'); if(token) await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run();
    return json({ok:true},200,{ 'Set-Cookie':cookieHeader('',0) });
  }
  if (path === '/api/applications' && request.method === 'GET') {
    if (!await session(db,request)) return json({error:'Log in om sollicitaties te bekijken.'},401);
    const rows=await db.prepare('SELECT * FROM applications ORDER BY created_at DESC').all();
    return json({applications:await Promise.all(rows.results.map(row=>getApplication(db,row)))});
  }
  const match=path.match(/^\/api\/applications\/([\w-]+)(?:\/(status|notes|archive))?$/);
  if(match&&request.method==='GET'&&!match[2]) {
    if(!await session(db,request))return json({error:'Log in om sollicitaties te bekijken.'},401);
    const row=await db.prepare('SELECT * FROM applications WHERE id=?').bind(match[1]).first();
    return row?json({application:await getApplication(db,row)}):json({error:'Deze sollicitatie bestaat niet meer.'},404);
  }
  if(match&&request.method==='PATCH'&&match[2]==='status') {
    if(!await session(db,request))return json({error:'Je sessie is verlopen. Log opnieuw in.'},401);
    const {status}=await body(request);if(!STATUS.has(status))return json({error:'Kies een geldige status.'},400);
    const now=new Date().toISOString(), result=await db.prepare('UPDATE applications SET status=? WHERE id=?').bind(status,match[1]).run();
    if(!result.meta.changes)return json({error:'Deze sollicitatie bestaat niet meer.'},404);
    await db.prepare('INSERT INTO status_history (application_id,status,created_at) VALUES (?,?,?)').bind(match[1],status,now).run();return json({ok:true});
  }
  if(match&&request.method==='PATCH'&&match[2]==='archive') {
    if(!await session(db,request))return json({error:'Je sessie is verlopen. Log opnieuw in.'},401);
    const {archived}=await body(request);if(typeof archived!=='boolean')return json({error:'Kies of je de sollicitatie wilt archiveren.'},400);
    const result=await db.prepare('UPDATE applications SET archived_at=? WHERE id=?').bind(archived?new Date().toISOString():null,match[1]).run();
    if(!result.meta.changes)return json({error:'Deze sollicitatie bestaat niet meer.'},404);return json({ok:true});
  }
  if(match&&request.method==='POST'&&match[2]==='notes') {
    if(!await session(db,request))return json({error:'Je sessie is verlopen. Log opnieuw in.'},401);
    const {note}=await body(request), value=text(note,500);if(!value)return json({error:'Een notitie mag niet leeg zijn.'},400);
    if(!await db.prepare('SELECT id FROM applications WHERE id=?').bind(match[1]).first())return json({error:'Deze sollicitatie bestaat niet meer.'},404);
    const now=new Date().toISOString();await db.prepare('INSERT INTO notes (application_id,body,created_at) VALUES (?,?,?)').bind(match[1],value,now).run();return json({ok:true,note:{text:value,at:now}},201);
  }
  if(match&&!match[2]&&request.method==='DELETE') {
    if(!await session(db,request))return json({error:'Je sessie is verlopen. Log opnieuw in.'},401);
    const result=await db.prepare('DELETE FROM applications WHERE id=?').bind(match[1]).run();
    if(!result.meta.changes)return json({error:'Deze sollicitatie bestaat niet meer.'},404);return json({ok:true});
  }
  return json({error:'Deze pagina bestaat niet.'},404);
}

export default {
  async fetch(request, env) {
    try { return withSecurity(await handle(request,env)); }
    catch (error) { console.error(error); return json({error:error.status?error.message:'Er ging iets mis. Probeer het opnieuw.'},error.status||500); }
  }
};

