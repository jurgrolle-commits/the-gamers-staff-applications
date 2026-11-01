import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const scrypt = promisify(scryptCallback);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'applications.sqlite');
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3000);
const SECURE_COOKIE = process.env.NODE_ENV === 'production';
const SESSION_MS = 12 * 60 * 60 * 1000;
const STATUS = new Set(['new', 'review', 'accepted', 'rejected']);
const ROLES = new Set(['Moderator', 'Manager', 'Administrator']);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

await mkdir(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS owner (id INTEGER PRIMARY KEY CHECK(id=1), salt TEXT NOT NULL, hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS applications (
 id TEXT PRIMARY KEY, discord TEXT NOT NULL, age INTEGER NOT NULL,
 role TEXT NOT NULL, experience TEXT NOT NULL, motivation TEXT NOT NULL, availability TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'new', archived_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS applications_created ON applications(created_at DESC);
CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE, body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS status_history (id INTEGER PRIMARY KEY AUTOINCREMENT, application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE, status TEXT NOT NULL, created_at TEXT NOT NULL);
`);
// Keep existing submissions if the application table predates this version.
let applicationFields = db.prepare('PRAGMA table_info(applications)').all().map(column => column.name);
if (!applicationFields.includes('archived_at')) {
  db.exec('ALTER TABLE applications ADD COLUMN archived_at TEXT');
  applicationFields = db.prepare('PRAGMA table_info(applications)').all().map(column => column.name);
}
const currentApplicationFields = ['id','discord','age','role','experience','motivation','availability','status','archived_at','created_at'];
if (applicationFields.length !== currentApplicationFields.length || currentApplicationFields.some(field => !applicationFields.includes(field))) {
  db.exec('PRAGMA foreign_keys=OFF');
  try {
    db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE applications_rebuilt (
        id TEXT PRIMARY KEY, discord TEXT NOT NULL, age INTEGER NOT NULL, role TEXT NOT NULL,
        experience TEXT NOT NULL, motivation TEXT NOT NULL, availability TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'new', archived_at TEXT, created_at TEXT NOT NULL
      );
      INSERT INTO applications_rebuilt (id,discord,age,role,experience,motivation,availability,status,archived_at,created_at)
        SELECT id,discord,age,role,experience,motivation,availability,status,archived_at,created_at FROM applications;
      DROP TABLE applications;
      ALTER TABLE applications_rebuilt RENAME TO applications;
      COMMIT;`);
  } catch (error) {
    db.exec('ROLLBACK'); throw error;
  } finally { db.exec('PRAGMA foreign_keys=ON'); }
  db.exec('CREATE INDEX IF NOT EXISTS applications_created ON applications(created_at DESC)');
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function promptSecret(question) {
  return new Promise(resolve => {
    const input=process.stdin;
    if(!input.isTTY||typeof input.setRawMode!=='function') { console.error('Stel de owner-code in vanuit een interactieve terminal, zodat invoer verborgen blijft.');rl.close();process.exit(1); }
    rl.pause(); input.setRawMode(true); input.resume(); process.stdout.write(question);
    let value='';
    const onData=buffer=>{for(const char of buffer.toString('utf8')){
      if(char==='\u0003'){process.stdout.write('\n');input.setRawMode(false);input.off('data',onData);process.exit(130)}
      if(char==='\r'||char==='\n'){process.stdout.write('\n');input.setRawMode(false);input.off('data',onData);resolve(value);return}
      if(char==='\u007f'||char==='\b'){value=value.slice(0,-1);process.stdout.write('\b \b');continue}
      if(char.charCodeAt(0)>=32){value+=char;process.stdout.write('•')}
    }};
    input.on('data',onData);
  });
}
async function setupOwner() {
  if (db.prepare('SELECT id FROM owner WHERE id=1').get()) {
    console.log('Er is al een owner-login ingesteld.');
    rl.close(); return;
  }
  const password = await promptSecret('Kies een owner-code (minimaal 8 tekens; invoer blijft verborgen): ');
  const confirm = await promptSecret('Voer de owner-code nogmaals in: ');
  rl.close();
  if (password.length < 8 || password !== confirm) {
    console.error('Niet opgeslagen: gebruik minimaal 8 tekens en voer beide keren dezelfde code in.');
    process.exitCode = 1; return;
  }
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  db.prepare('INSERT INTO owner (id,salt,hash,created_at) VALUES (1,?,?,?)').run(salt.toString('hex'), hash.toString('hex'), new Date().toISOString());
  console.log('Owner-login ingesteld. De geheime code is niet als leesbare tekst opgeslagen. Start de site met: pnpm start');
}
if (process.argv[2] === 'setup-owner') {
  await setupOwner(); db.close(); process.exit(process.exitCode || 0);
}

const ownerExists = () => Boolean(db.prepare('SELECT id FROM owner WHERE id=1').get());
// On a fresh hosted install, accept the owner code only from the server's secret
// environment. The code is immediately salted and hashed; it is never logged.
if (!ownerExists() && process.env.OWNER_CODE) {
  if (process.env.OWNER_CODE.length < 8) throw new Error('OWNER_CODE moet minimaal 8 tekens bevatten.');
  const salt = randomBytes(16);
  const hash = await scrypt(process.env.OWNER_CODE, salt, 64);
  db.prepare('INSERT INTO owner (id,salt,hash,created_at) VALUES (1,?,?,?)')
    .run(salt.toString('hex'), hash.toString('hex'), new Date().toISOString());
}
const hashToken = token => createHash('sha256').update(token).digest('hex');
const loginAttempts = new Map();
const submissions = new Map();
const STATUS_LABELS = { new: 'Nieuw', review: 'In behandeling', accepted: 'Aangenomen', rejected: 'Afgewezen' };

function headers(res, type='application/json; charset=utf-8') {
  res.setHeader('Content-Type', type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader('Cache-Control', 'no-store');
}
function json(res, status, data) {
  headers(res); res.writeHead(status); res.end(JSON.stringify(data));
}
function cookies(req) {
  const result = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i > -1) result[part.slice(0,i).trim()] = decodeURIComponent(part.slice(i+1).trim());
  }
  return result;
}
function session(req) {
  const token = cookies(req).bh_session;
  if (!token || token.length > 120) return null;
  const row = db.prepare('SELECT token_hash FROM sessions WHERE token_hash=? AND expires_at>?').get(hashToken(token), Date.now());
  return row?.token_hash || null;
}
function clearSession(res) {
  res.setHeader('Set-Cookie', `bh_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${SECURE_COOKIE ? '; Secure' : ''}`);
}
function secureSession(res, token) {
  res.setHeader('Set-Cookie', `bh_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS/1000}${SECURE_COOKIE ? '; Secure' : ''}`);
}
function rateLimit(map, key, limit, windowMs) {
  const now = Date.now(); const old = (map.get(key) || []).filter(time => now-time < windowMs);
  if (old.length >= limit) { map.set(key, old); return false; }
  old.push(now); map.set(key, old);
  if (map.size > 3000) for (const [k,v] of map) if (!v.some(time=>now-time<windowMs)) map.delete(k);
  return true;
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin || !req.headers.host) return false;
  try { return new URL(origin).host.toLowerCase() === req.headers.host.toLowerCase(); } catch { return false; }
}
async function body(req) {
  const type = req.headers['content-type'] || '';
  if (!type.toLowerCase().startsWith('application/json')) throw Object.assign(new Error('Gebruik een geldig JSON-formulier.'), { status: 415 });
  let data='';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 24_000) { req.destroy(); throw Object.assign(new Error('Dit formulier is te groot.'), { status: 413 }); }
  }
  try { const value=JSON.parse(data); if (!value || Array.isArray(value) || typeof value!=='object') throw 0; return value; }
  catch { throw Object.assign(new Error('Het formulier is niet goed leesbaar.'), { status: 400 }); }
}
function text(v, max) { return typeof v === 'string' ? v.trim().slice(0,max) : ''; }
function publicApplication(row) {
  return { id:row.id, discord:row.discord, age:row.age, role:row.role, experience:row.experience, motivation:row.motivation, availability:row.availability, status:row.status, archivedAt:row.archived_at, createdAt:row.created_at, notes:db.prepare('SELECT body,created_at FROM notes WHERE application_id=? ORDER BY id').all(row.id).map(n=>({text:n.body,at:n.created_at})), history:db.prepare('SELECT status,created_at FROM status_history WHERE application_id=? ORDER BY id').all(row.id).map(h=>({status:h.status,at:h.created_at})) };
}
function validateApplication(data) {
  const a={discord:text(data.discord,64),age:Number(data.age),role:text(data.role,40),experience:text(data.experience,1500),motivation:text(data.motivation,2000),availability:text(data.availability,120)};
  if(data.consent!==true) throw Object.assign(new Error('Geef toestemming voordat je je sollicitatie verstuurt.'),{status:400});
  if(a.discord.length<2) throw Object.assign(new Error('Vul je Discord-gebruikersnaam in.'),{status:400});
  if(!Number.isInteger(a.age)||a.age<13||a.age>99) throw Object.assign(new Error('Vul een geldige leeftijd in (13–99).'),{status:400});
  if(!ROLES.has(a.role)) throw Object.assign(new Error('Kies een van de beschikbare rollen.'),{status:400});
  if(a.experience.length<10) throw Object.assign(new Error('Vertel iets over je ervaring (minimaal 10 tekens).'),{status:400});
  if(a.motivation.length<20) throw Object.assign(new Error('Je motivatie is te kort (minimaal 20 tekens).'),{status:400});
  if(a.availability.length<3) throw Object.assign(new Error('Vul in wanneer je beschikbaar bent.'),{status:400});
  return a;
}
async function handle(req,res) {
  const url=new URL(req.url,'http://localhost'); const pathname=url.pathname;
  if(req.method==='GET'&&pathname==='/api/health') return json(res,200,{ok:true,ownerConfigured:ownerExists()});
  if(pathname.startsWith('/api/')) {
    if(['POST','PATCH','DELETE'].includes(req.method)&&!sameOrigin(req)) return json(res,403,{error:'Dit verzoek is niet toegestaan.'});
    if(pathname==='/api/applications'&&req.method==='POST') {
      const ip=req.socket.remoteAddress||'unknown';
      if(!rateLimit(submissions,ip,4,60*60*1000)) return json(res,429,{error:'Er zijn te veel sollicitaties verstuurd vanaf dit netwerk. Probeer het later opnieuw.'});
      const a=validateApplication(await body(req)); const id=randomUUID(); const now=new Date().toISOString();
      db.prepare('INSERT INTO applications (id,discord,age,role,experience,motivation,availability,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id,a.discord,a.age,a.role,a.experience,a.motivation,a.availability,'new',now);
      db.prepare('INSERT INTO status_history (application_id,status,created_at) VALUES (?,?,?)').run(id,'new',now);
      return json(res,201,{ok:true,message:'Je sollicitatie is ontvangen. Bedankt! We nemen contact met je op via Discord.'});
    }
    if(pathname==='/api/auth/login'&&req.method==='POST') {
      const ip=req.socket.remoteAddress||'unknown';
      if(!rateLimit(loginAttempts,ip,5,15*60*1000)) return json(res,429,{error:'Te veel mislukte inlogpogingen. Probeer het over 15 minuten opnieuw.'});
      const {password}=await body(req); const secret=text(password,128); const record=db.prepare('SELECT salt,hash FROM owner WHERE id=1').get();
      if(!record) return json(res,503,{error:'De owner-login is nog niet ingesteld. Volg de installatiestappen in README.md.'});
      const candidate=await scrypt(secret,Buffer.from(record.salt,'hex'),64); const expected=Buffer.from(record.hash,'hex');
      if(candidate.length!==expected.length||!timingSafeEqual(candidate,expected)) return json(res,401,{error:'De pincode of het wachtwoord klopt niet.'});
      const token=randomBytes(32).toString('base64url'); const tokenHash=hashToken(token); const now=Date.now();
      db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now); db.prepare('INSERT INTO sessions (token_hash,expires_at,created_at) VALUES (?,?,?)').run(tokenHash,now+SESSION_MS,now);
      loginAttempts.delete(ip); secureSession(res,token); return json(res,200,{ok:true});
    }
    if(pathname==='/api/auth/session'&&req.method==='GET') return json(res,200,{authenticated:Boolean(session(req)),ownerConfigured:ownerExists()});
    if(pathname==='/api/auth/logout'&&req.method==='POST') {const tokenHash=session(req);if(tokenHash)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash);clearSession(res);return json(res,200,{ok:true});}
    if(pathname==='/api/applications'&&req.method==='GET') {
      if(!session(req)) return json(res,401,{error:'Log in om sollicitaties te bekijken.'});
      const rows=db.prepare('SELECT * FROM applications ORDER BY created_at DESC').all().map(publicApplication); return json(res,200,{applications:rows});
    }
    const match=pathname.match(/^\/api\/applications\/([\w-]+)(?:\/(status|notes|archive))?$/);
    if(match&&req.method==='GET'&&!match[2]) {if(!session(req))return json(res,401,{error:'Log in om sollicitaties te bekijken.'});const row=db.prepare('SELECT * FROM applications WHERE id=?').get(match[1]);return row?json(res,200,{application:publicApplication(row)}):json(res,404,{error:'Deze sollicitatie bestaat niet meer.'});}
    if(match&&req.method==='PATCH'&&match[2]==='status') {
      if(!session(req))return json(res,401,{error:'Je sessie is verlopen. Log opnieuw in.'});const {status}=await body(req);if(!STATUS.has(status))return json(res,400,{error:'Kies een geldige status.'});const now=new Date().toISOString();
      const result=db.prepare('UPDATE applications SET status=? WHERE id=?').run(status,match[1]);if(!result.changes)return json(res,404,{error:'Deze sollicitatie bestaat niet meer.'});db.prepare('INSERT INTO status_history (application_id,status,created_at) VALUES (?,?,?)').run(match[1],status,now);return json(res,200,{ok:true});
    }
    if(match&&req.method==='PATCH'&&match[2]==='archive') {
      if(!session(req))return json(res,401,{error:'Je sessie is verlopen. Log opnieuw in.'});
      const {archived}=await body(req);if(typeof archived!=='boolean')return json(res,400,{error:'Kies of je de sollicitatie wilt archiveren.'});
      const result=db.prepare('UPDATE applications SET archived_at=? WHERE id=?').run(archived?new Date().toISOString():null,match[1]);
      if(!result.changes)return json(res,404,{error:'Deze sollicitatie bestaat niet meer.'});return json(res,200,{ok:true});
    }
    if(match&&req.method==='POST'&&match[2]==='notes') {
      if(!session(req))return json(res,401,{error:'Je sessie is verlopen. Log opnieuw in.'});const {note}=await body(req);const value=text(note,500);if(value.length<1)return json(res,400,{error:'Een notitie mag niet leeg zijn.'});if(!db.prepare('SELECT id FROM applications WHERE id=?').get(match[1]))return json(res,404,{error:'Deze sollicitatie bestaat niet meer.'});const now=new Date().toISOString();db.prepare('INSERT INTO notes (application_id,body,created_at) VALUES (?,?,?)').run(match[1],value,now);return json(res,201,{ok:true,note:{text:value,at:now}});
    }
    if(match&&!match[2]&&req.method==='DELETE') {
      if(!session(req))return json(res,401,{error:'Je sessie is verlopen. Log opnieuw in.'});
      const result=db.prepare('DELETE FROM applications WHERE id=?').run(match[1]);
      if(!result.changes)return json(res,404,{error:'Deze sollicitatie bestaat niet meer.'});return json(res,200,{ok:true});
    }
    return json(res,404,{error:'Deze pagina bestaat niet.'});
  }
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end('Method not allowed');}
  const relative=pathname==='/'?'index.html':decodeURIComponent(pathname.slice(1));
  if(relative.includes('..')||relative.includes('\\')){res.writeHead(404);return res.end('Niet gevonden');}
  const file=path.join(ROOT,'public',relative);
  try {const contents=await readFile(file);headers(res,MIME[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.writeHead(200);if(req.method==='HEAD')return res.end();return res.end(contents);}
  catch {res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});return res.end('Niet gevonden');}
}

if(!ownerExists()) console.warn('Owner-login ontbreekt. Stel deze eenmalig in met: pnpm owner:setup');
const server=http.createServer((req,res)=>{handle(req,res).catch(error=>{if(res.headersSent){res.destroy();return;}const status=error.status||500;if(status===500)console.error(error);json(res,status,{error:status===500?'Er ging iets mis. Probeer het opnieuw.':error.message});});});
server.listen(PORT,HOST,()=>console.log(`De sollicitatiesite is bereikbaar op http://${HOST}:${PORT}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0)}));
