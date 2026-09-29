const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(ROOT, 'server-data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const SESSION_SECRET = process.env.SESSION_SECRET || 'CHANGE_THIS_SESSION_SECRET_IN_PRODUCTION';
const ADMIN_NAME = process.env.ADMIN_NAME || 'ADMIN GROUP A';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'KU MASAKA';

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const CATEGORIES = [
  { id: 'electronics', label: 'Electronics' },
  { id: 'fashion', label: 'Fashion' },
  { id: 'office', label: 'Office' },
  { id: 'machinery', label: 'Machinery' },
  { id: 'home', label: 'Home & Living' },
  { id: 'agriculture', label: 'Agriculture' }
];
const LOCATIONS = [
  { id: 'masaka', label: 'Masaka', lat: -0.3372, lng: 31.7345 },
  { id: 'ssembabule', label: 'Ssembabule', lat: -0.0904, lng: 31.4534 },
  { id: 'kampala', label: 'Kampala', lat: 0.3476, lng: 32.5825 },
  { id: 'gayaza', label: 'Gayaza', lat: 0.4907, lng: 32.6167 },
  { id: 'kyotera', label: 'Kyotera', lat: -0.6193, lng: 31.5253 },
  { id: 'kumasaka', label: 'Kampala University Masaka', lat: -0.3406, lng: 31.7331 }
];

const emptyDb = () => ({
  users: [], businesses: [], products: [], orders: [], messages: [], feedback: [], traffic: {}, settings: {
    paymentAccounts: { momo: '', mastercard: '' }
  }
});

function readDb() {
  if (!fs.existsSync(DB_FILE)) return emptyDb();
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return emptyDb(); }
}
function writeDb(db) {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
function uid(prefix) { return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`; }
function clean(v) { return String(v ?? '').trim(); }
function moneyNumber(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  try {
    const [salt, hash] = String(stored).split(':');
    const check = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
  } catch { return false; }
}
function signToken(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifyToken(token) {
  try {
    const [body, sig] = String(token || '').split('.');
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}
function auth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const session = verifyToken(token);
  if (!session) return res.status(401).json({ error: 'Authentication required.' });
  req.session = session;
  next();
}
function role(roleName) {
  return (req, res, next) => {
    if (req.session?.type !== roleName) return res.status(403).json({ error: 'This action is not available to this account.' });
    next();
  };
}
function publicBusiness(b) {
  return {
    id: b.id, name: b.name, category: b.category, location: b.location, bio: b.bio,
    paymentMethods: Object.fromEntries(Object.entries(b.paymentMethods || {}).filter(([,v]) => v?.enabled).map(([k,v]) => [k, { enabled: true, account: v.account || '' }])),
    deliveryLocations: b.deliveryLocations || {}, chatbot: b.chatbot || { persona: 'friendly', greeting: `Hi! Thanks for visiting ${b.name}. How can I help?` }
  };
}
function publicProduct(p) {
  return { ...p, image: p.imageUrl || null };
}
function trialInfo(db) {
  const count = db.businesses.length;
  return { limit: 100, used: count, remaining: Math.max(0, 100 - count) };
}
function recordVisit(db) {
  const day = new Date().toISOString().slice(0,10);
  db.traffic[day] = (db.traffic[day] || 0) + 1;
}
function ensureSeed() {
  const db = readDb();
  if (db.businesses.length || db.products.length) return;
  const businesses = [
    { id:'biz_demo_electro', name:'Kasese Electro Hub', email:'kasese.electro@example.com', passwordHash:hashPassword('demo1234'), category:'electronics', location:'kampala', bio:'Phones, accessories and home electronics at fair prices.', joined:'2026-02-11', freeTrial:true, trialEndsAt:'2026-08-11', paymentMethods:{momo:{enabled:true,account:'0700 000 001'},airtel:{enabled:false,account:''},mastercard:{enabled:true,account:'DEMO-MERCHANT-001'}}, deliveryLocations:{kampala:{enabled:true,fee:5000},masaka:{enabled:true,fee:7000}}, chatbot:{persona:'friendly',greeting:'Hi! Thanks for visiting Kasese Electro Hub. How can I help?'} },
    { id:'biz_demo_threads', name:'Masaka Threads', email:'masaka.threads@example.com', passwordHash:hashPassword('demo1234'), category:'fashion', location:'masaka', bio:'Locally tailored fashion for men, women and children.', joined:'2026-03-02', freeTrial:true, trialEndsAt:'2026-09-02', paymentMethods:{momo:{enabled:true,account:'0700 000 002'},airtel:{enabled:true,account:'0750 000 002'},mastercard:{enabled:false,account:''}}, deliveryLocations:{masaka:{enabled:true,fee:3000},kumasaka:{enabled:true,fee:2500}}, chatbot:{persona:'friendly',greeting:'Welcome to Masaka Threads. How can we help?'} }
  ];
  const products = [
    { id:uid('prod'), name:'Dual-SIM Smartphone', category:'electronics', bizId:'biz_demo_electro', price:620000, discount:10, stock:24, desc:'6.5 inch display, 128GB storage, dual camera.', imageUrl:null, createdAt:new Date().toISOString(), views:0, deliveryOptions:{kampala:{enabled:true,fee:5000},masaka:{enabled:true,fee:7000}} },
    { id:uid('prod'), name:'Ankara Print Dress', category:'fashion', bizId:'biz_demo_threads', price:85000, discount:20, stock:15, desc:'Vibrant Ankara print, available in multiple sizes.', imageUrl:null, createdAt:new Date().toISOString(), views:0, deliveryOptions:{masaka:{enabled:true,fee:3000},kumasaka:{enabled:true,fee:2500}} }
  ];
  db.businesses = businesses; db.products = products; writeDb(db);
}
ensureSeed();

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype)) return cb(new Error('Only JPEG, PNG, WebP or GIF images are allowed.'));
    cb(null, true);
  }
});

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', immutable: true }));
app.use((req,res,next)=>{ if(req.path.startsWith('/server-data') || req.path.startsWith('/.git') || req.path === '/.env' || req.path === '/package-lock.json') return res.status(404).end(); next(); });
app.use(express.static(ROOT, { extensions: ['html'] }));

app.get('/api/config', (req,res) => res.json({ categories:CATEGORIES, locations:LOCATIONS, trial:trialInfo(readDb()) }));
app.get('/api/catalog', (req,res) => {
  const db = readDb(); recordVisit(db);
  const cat = clean(req.query.cat).toLowerCase(); const q = clean(req.query.q).toLowerCase();
  const businesses = db.businesses.filter(b => b.active !== false).map(publicBusiness);
  const products = db.products.filter(p => {
    const b = db.businesses.find(x => x.id === p.bizId);
    const hay = `${p.name} ${p.desc} ${b?.name || ''}`.toLowerCase();
    return (!cat || p.category === cat) && (!q || hay.includes(q));
  }).map(publicProduct);
  writeDb(db);
  res.json({ products, businesses, trafficRecorded:true });
});

app.post('/api/auth/signup', (req,res) => {
  const db = readDb(); const roleName = req.body.role;
  const email = clean(req.body.email).toLowerCase(); const password = String(req.body.password || '');
  if (!email || password.length < 6) return res.status(400).json({error:'A valid email and a password of at least 6 characters are required.'});
  if ([...db.users,...db.businesses].some(x => x.email === email)) return res.status(409).json({error:'That email is already registered.'});
  if (roleName === 'user') {
    const user = { id:uid('user'), role:'user', name:clean(req.body.name) || 'Shopper', email, passwordHash:hashPassword(password), joined:new Date().toISOString().slice(0,10), active:true };
    db.users.push(user); writeDb(db);
    return res.json({ token:signToken({type:'user',id:user.id}), account:{id:user.id,type:'user',name:user.name,email:user.email} });
  }
  if (roleName === 'business') {
    const name = clean(req.body.name); if (!name) return res.status(400).json({error:'Business name is required.'});
    if (db.businesses.some(b => b.name.toLowerCase() === name.toLowerCase())) return res.status(409).json({error:'That business name is already registered.'});
    const gotTrial = db.businesses.length < 100; const joined = new Date(); const end = new Date(joined); end.setMonth(end.getMonth()+6);
    const business = { id:uid('biz'), role:'business', name, email, passwordHash:hashPassword(password), category:clean(req.body.category), location:clean(req.body.location), bio:clean(req.body.bio), joined:joined.toISOString().slice(0,10), freeTrial:gotTrial, trialEndsAt:gotTrial ? end.toISOString().slice(0,10) : null, active:true, paymentMethods:{momo:{enabled:false,account:''},airtel:{enabled:false,account:''},mastercard:{enabled:false,account:''}}, deliveryLocations:{[clean(req.body.location)]:{enabled:true,fee:0}}, chatbot:{persona:'friendly',greeting:`Hi! Thanks for visiting ${name}. How can I help?`} };
    db.businesses.push(business); writeDb(db);
    return res.json({ token:signToken({type:'business',id:business.id}), account:{id:business.id,type:'business',name:business.name,email:business.email} });
  }
  res.status(400).json({error:'Unsupported account type.'});
});

app.post('/api/auth/login', (req,res) => {
  const db = readDb(); const id = clean(req.body.id); const pw = String(req.body.password || '');
  if (id === ADMIN_NAME && pw === ADMIN_PASSWORD) return res.json({token:signToken({type:'admin',id:'admin'}),account:{id:'admin',type:'admin',name:ADMIN_NAME}});
  const user = db.users.find(u => u.email === id.toLowerCase() && verifyPassword(pw,u.passwordHash) && u.active !== false);
  if (user) return res.json({token:signToken({type:'user',id:user.id}),account:{id:user.id,type:'user',name:user.name,email:user.email}});
  const business = db.businesses.find(b => (b.email === id.toLowerCase() || b.name.toLowerCase() === id.toLowerCase()) && verifyPassword(pw,b.passwordHash) && b.active !== false);
  if (business) return res.json({token:signToken({type:'business',id:business.id}),account:{id:business.id,type:'business',name:business.name,email:business.email}});
  res.status(401).json({error:'We could not match those details.'});
});

app.get('/api/me', auth, (req,res) => {
  const db=readDb(); let account=null;
  if(req.session.type==='user') { const u=db.users.find(x=>x.id===req.session.id); if(u) account={id:u.id,type:'user',name:u.name,email:u.email}; }
  if(req.session.type==='business') { const b=db.businesses.find(x=>x.id===req.session.id); if(b) account={...publicBusiness(b),email:b.email,trialEndsAt:b.trialEndsAt,freeTrial:b.freeTrial}; }
  if(req.session.type==='admin') account={id:'admin',type:'admin',name:ADMIN_NAME};
  if(!account) return res.status(401).json({error:'Account not found.'}); res.json({account});
});

app.get('/api/businesses/:id', (req,res) => { const db=readDb(); const b=db.businesses.find(x=>x.id===req.params.id); if(!b) return res.status(404).json({error:'Business not found.'}); res.json(publicBusiness(b)); });
app.get('/api/products/:id', (req,res) => { const db=readDb(); const p=db.products.find(x=>x.id===req.params.id); if(!p) return res.status(404).json({error:'Product not found.'}); p.views=(p.views||0)+1; writeDb(db); const b=db.businesses.find(x=>x.id===p.bizId); res.json({product:publicProduct(p),business:publicBusiness(b)}); });

app.get('/api/cart', auth, role('user'), (req,res) => {
  const db=readDb(); const cart = db.users.find(u=>u.id===req.session.id)?.cart || []; res.json({cart});
});
app.put('/api/cart', auth, role('user'), (req,res) => {
  const db=readDb(); const user=db.users.find(u=>u.id===req.session.id); if(!user) return res.status(404).json({error:'User not found.'});
  const incoming=Array.isArray(req.body.items)?req.body.items:[]; const cleanItems=[];
  for(const item of incoming){ const p=db.products.find(x=>x.id===item.productId); const qty=Math.max(1,Math.floor(Number(item.qty))); if(p && p.stock>=qty) cleanItems.push({productId:p.id,qty}); }
  user.cart=cleanItems; writeDb(db); res.json({cart:cleanItems});
});

app.post('/api/products', auth, role('business'), upload.single('image'), (req,res) => {
  const db=readDb(); const biz=db.businesses.find(b=>b.id===req.session.id); if(!biz) return res.status(404).json({error:'Business not found.'});
  const price=moneyNumber(req.body.price); const discount=Math.min(90,Math.max(0,moneyNumber(req.body.discount))); const stock=Math.max(0,Math.floor(moneyNumber(req.body.stock)));
  if(!clean(req.body.name)||price<=0) return res.status(400).json({error:'Product name and positive price are required.'});
  let imageUrl=null;
  if(req.file){ const extMap={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','image/gif':'.gif'}; const ext=extMap[req.file.mimetype] || '.jpg'; const finalName=`${uid('img')}${ext}`; fs.renameSync(req.file.path,path.join(UPLOAD_DIR,finalName)); imageUrl=`/uploads/${finalName}`; }
  const deliveryOptions=JSON.parse(req.body.deliveryOptions || '{}');
  for(const [loc,v] of Object.entries(deliveryOptions)){ if(!LOCATIONS.some(l=>l.id===loc)) delete deliveryOptions[loc]; else v.fee=Math.min(10000,Math.max(0,moneyNumber(v.fee))); }
  const p={id:uid('prod'),name:clean(req.body.name),category:clean(req.body.category),bizId:biz.id,price,discount,stock,desc:clean(req.body.desc),imageUrl,createdAt:new Date().toISOString(),views:0,deliveryOptions};
  db.products.push(p); writeDb(db); res.status(201).json({product:publicProduct(p)});
});
app.put('/api/products/:id', auth, role('business'), upload.single('image'), (req,res) => {
  const db=readDb(); const p=db.products.find(x=>x.id===req.params.id && x.bizId===req.session.id); if(!p) return res.status(404).json({error:'Product not found.'});
  p.name=clean(req.body.name); p.category=clean(req.body.category); p.price=moneyNumber(req.body.price); p.discount=Math.min(90,Math.max(0,moneyNumber(req.body.discount))); p.stock=Math.max(0,Math.floor(moneyNumber(req.body.stock))); p.desc=clean(req.body.desc);
  if(req.body.deliveryOptions){ try { p.deliveryOptions=JSON.parse(req.body.deliveryOptions); } catch {} }
  if(p.deliveryOptions) for(const [loc,v] of Object.entries(p.deliveryOptions)){ if(!LOCATIONS.some(l=>l.id===loc)) delete p.deliveryOptions[loc]; else v.fee=Math.min(10000,Math.max(0,moneyNumber(v.fee))); }
  if(req.file){ if(p.imageUrl){ const old=path.join(ROOT,p.imageUrl.replace(/^\//,'')); if(fs.existsSync(old)) fs.unlinkSync(old); } const extMap={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','image/gif':'.gif'}; const ext=extMap[req.file.mimetype] || '.jpg'; const finalName=`${uid('img')}${ext}`; fs.renameSync(req.file.path,path.join(UPLOAD_DIR,finalName)); p.imageUrl=`/uploads/${finalName}`; }
  writeDb(db); res.json({product:publicProduct(p)});
});
app.delete('/api/products/:id', auth, (req,res) => { const db=readDb(); const p=db.products.find(x=>x.id===req.params.id); if(!p) return res.status(404).json({error:'Product not found.'}); if(req.session.type!=='admin' && !(req.session.type==='business'&&p.bizId===req.session.id)) return res.status(403).json({error:'Not allowed.'}); if(p.imageUrl){ const fp=path.join(ROOT,p.imageUrl.replace(/^\//,'')); if(fs.existsSync(fp)) fs.unlinkSync(fp); } db.products=db.products.filter(x=>x.id!==p.id); writeDb(db); res.json({ok:true}); });

app.put('/api/business/settings', auth, role('business'), (req,res)=>{
  const db=readDb(); const b=db.businesses.find(x=>x.id===req.session.id); if(!b) return res.status(404).json({error:'Business not found.'});
  if(req.body.paymentMethods){ const allowed=['momo','airtel','mastercard']; b.paymentMethods=b.paymentMethods||{}; for(const k of allowed){ if(req.body.paymentMethods[k]) b.paymentMethods[k]={enabled:!!req.body.paymentMethods[k].enabled,account:clean(req.body.paymentMethods[k].account)}; } }
  if(req.body.deliveryLocations){ b.deliveryLocations={}; for(const [loc,v] of Object.entries(req.body.deliveryLocations)){ if(LOCATIONS.some(l=>l.id===loc)) b.deliveryLocations[loc]={enabled:!!v.enabled,fee:Math.min(10000,Math.max(0,moneyNumber(v.fee)))}; } }
  if(req.body.chatbot){ b.chatbot={persona:clean(req.body.chatbot.persona)||'friendly',greeting:clean(req.body.chatbot.greeting)||`Hi! Thanks for visiting ${b.name}. How can I help?`}; }
  writeDb(db); res.json({business:publicBusiness(b)});
});

app.get('/api/business/dashboard', auth, role('business'), (req,res)=>{
  const db=readDb(); const b=db.businesses.find(x=>x.id===req.session.id); if(!b) return res.status(404).json({error:'Business not found.'});
  const products=db.products.filter(p=>p.bizId===b.id); const orders=db.orders.filter(o=>o.items.some(i=>i.bizId===b.id));
  const lines=[]; for(const o of orders) for(const i of o.items.filter(x=>x.bizId===b.id)) lines.push({...i,date:o.createdAt,location:o.deliveries?.find(d=>d.bizId===b.id)?.location});
  const revenue=lines.reduce((s,l)=>s+l.lineTotal,0); const units=lines.reduce((s,l)=>s+l.qty,0);
  const notes=db.messages.filter(m=>m.businessId===b.id && m.kind==='notification').slice(-20).reverse();
  res.json({business:publicBusiness(b),products:products.map(publicProduct),orders,lines,revenue,units,lowStock:products.filter(p=>p.stock>0&&p.stock<=5).length,notifications:notes});
});

app.post('/api/orders', auth, role('user'), (req,res)=>{
  const db=readDb(); const user=db.users.find(u=>u.id===req.session.id); if(!user) return res.status(404).json({error:'User not found.'});
  const rawItems=Array.isArray(req.body.items)?req.body.items:[]; if(!rawItems.length) return res.status(400).json({error:'Your cart is empty.'});
  const groups=new Map(); let subtotal=0;
  for(const raw of rawItems){ const p=db.products.find(x=>x.id===raw.productId); const qty=Math.floor(Number(raw.qty)); if(!p||qty<1) return res.status(400).json({error:'A product in your cart is no longer available.'}); if(p.stock<qty) return res.status(409).json({error:`Not enough stock for ${p.name}.`}); const b=db.businesses.find(x=>x.id===p.bizId); if(!b) return res.status(400).json({error:'Seller no longer exists.'}); const finalPrice=Math.round(p.price*(1-p.discount/100)); const g=groups.get(b.id)||{bizId:b.id,items:[],paymentMethod:null,location:null,deliveryFee:0}; g.items.push({productId:p.id,bizId:b.id,qty,unitPrice:finalPrice,lineTotal:finalPrice*qty}); groups.set(b.id,g); subtotal+=finalPrice*qty; }
  const selections=Array.isArray(req.body.businessSelections)?req.body.businessSelections:[];
  for(const g of groups.values()){
    const sel=selections.find(x=>x.bizId===g.bizId); const b=db.businesses.find(x=>x.id===g.bizId); const method=sel?.paymentMethod; const account=b.paymentMethods?.[method]; if(!method||!account?.enabled||!account.account) return res.status(400).json({error:`Choose one of the payment methods offered by ${b.name}.`});
    const loc=clean(sel.location); const locCfg=b.deliveryLocations?.[loc]; const productOptions=g.items.map(i=>db.products.find(p=>p.id===i.productId)?.deliveryOptions?.[loc]).filter(x=>x?.enabled); if(!loc || (!locCfg?.enabled && !productOptions.length)) return res.status(400).json({error:`${b.name} does not offer delivery or pickup at the selected point.`});
    const fee=productOptions.length ? Math.max(...productOptions.map(x=>Math.min(10000,Math.max(0,moneyNumber(x.fee))))) : Math.min(10000,Math.max(0,moneyNumber(locCfg.fee)));
    g.paymentMethod=method; g.paymentAccount=account.account; g.location=loc; g.deliveryFee=fee;
  }
  const deliveryTotal=[...groups.values()].reduce((s,g)=>s+g.deliveryFee,0); const total=subtotal+deliveryTotal;
  for(const raw of rawItems){ const p=db.products.find(x=>x.id===raw.productId); p.stock-=Math.floor(Number(raw.qty)); }
  const order={id:uid('order'),userId:user.id,items:[...groups.values()].flatMap(g=>g.items),businessSelections:[...groups.values()].map(g=>({bizId:g.bizId,paymentMethod:g.paymentMethod,paymentAccount:g.paymentAccount,location:g.location,deliveryFee:g.deliveryFee})),subtotal,deliveryTotal,total,status:'payment_instructions_issued',createdAt:new Date().toISOString()};
  db.orders.push(order); user.cart=[];
  for(const g of groups.values()) db.messages.push({id:uid('msg'),businessId:g.bizId,userId:user.id,kind:'notification',from:'system',text:`New order ${order.id} includes ${g.items.reduce((s,i)=>s+i.qty,0)} item(s). Payment method: ${g.paymentMethod}. Location: ${LOCATIONS.find(l=>l.id===g.location)?.label||g.location}.`,createdAt:new Date().toISOString(),read:false});
  writeDb(db); res.status(201).json({order});
});

app.post('/api/messages', auth, role('user'), (req,res)=>{ const db=readDb(); const b=db.businesses.find(x=>x.id===req.body.businessId && x.active!==false); if(!b) return res.status(404).json({error:'Business not found.'}); const text=clean(req.body.text); if(!text) return res.status(400).json({error:'Message cannot be empty.'}); const now=new Date().toISOString(); const m={id:uid('msg'),businessId:b.id,userId:req.session.id,kind:'chat',from:'user',text,createdAt:now,read:false}; db.messages.push(m); const greeting=clean(b.chatbot?.greeting)||`Thank you for contacting ${b.name}. Your message has been received.`; const lower=text.toLowerCase(); let reply=greeting; if(/delivery|deliver|pickup|pick up|location/.test(lower)){ const points=Object.entries(b.deliveryLocations||{}).filter(([,v])=>v?.enabled).map(([id,v])=>{const l=LOCATIONS.find(x=>x.id===id);return `${l?.label||id} (UGX ${Number(v.fee||0).toLocaleString('en-UG')})`;}); reply=points.length?`Thanks for your message. We offer delivery or pickup at: ${points.join(', ')}. A member of the business can provide further details.`:`Thanks for your message. Please wait for a business representative to reply with delivery or pickup details.`; } else if(/price|cost|how much|discount/.test(lower)){ reply=`Thanks for contacting ${b.name}. Please open the product listing for its current price and discount. A business representative can answer product-specific questions here.`; } else if(/stock|available|in stock/.test(lower)){ reply=`Thanks for checking with ${b.name}. Please refer to the product's current stock on the public listing, and a business representative can confirm availability.`; } db.messages.push({id:uid('msg'),businessId:b.id,userId:req.session.id,kind:'chat',from:'business',text:reply,createdAt:new Date().toISOString(),read:false,automated:true}); writeDb(db); res.status(201).json({message:m,autoReply:reply}); });
app.get('/api/my/messages', auth, role('user'), (req,res)=>{ const db=readDb(); const list=db.messages.filter(m=>m.userId===req.session.id&&m.kind==='chat').slice(-100).reverse(); res.json({messages:list}); });
app.get('/api/messages/:businessId', auth, (req,res)=>{ const db=readDb(); if(req.session.type==='user'){ const list=db.messages.filter(m=>m.businessId===req.params.businessId&&m.userId===req.session.id&&m.kind==='chat'); return res.json({messages:list}); } if(req.session.type==='business'){ if(req.session.id!==req.params.businessId) return res.status(403).json({error:'Not allowed.'}); const list=db.messages.filter(m=>m.businessId===req.params.businessId&&m.kind==='chat'); return res.json({messages:list}); } res.status(403).json({error:'Not allowed.'}); });
app.post('/api/messages/:businessId/reply', auth, role('business'), (req,res)=>{ const db=readDb(); if(req.session.id!==req.params.businessId) return res.status(403).json({error:'Not allowed.'}); const userId=clean(req.body.userId), text=clean(req.body.text); if(!userId||!text) return res.status(400).json({error:'User and message are required.'}); const m={id:uid('msg'),businessId:req.session.id,userId,kind:'chat',from:'business',text,createdAt:new Date().toISOString(),read:false}; db.messages.push(m); writeDb(db); res.status(201).json({message:m}); });

app.post('/api/feedback', auth, (req,res)=>{ const db=readDb(); const text=clean(req.body.message); if(!text) return res.status(400).json({error:'Message cannot be empty.'}); db.feedback.push({id:uid('fb'),from:req.session.type,name:clean(req.body.name)||req.session.id,targetBusinessId:clean(req.body.businessId)||null,message:text,createdAt:new Date().toISOString()}); writeDb(db); res.status(201).json({ok:true}); });

app.get('/api/admin/overview', auth, role('admin'), (req,res)=>{ const db=readDb(); res.json({users:db.users.filter(u=>u.active!==false),businesses:db.businesses.filter(b=>b.active!==false),products:db.products,orders:db.orders,feedback:db.feedback,traffic:Object.entries(db.traffic).sort().slice(-30),trial:trialInfo(db)}); });
app.delete('/api/admin/users/:id', auth, role('admin'), (req,res)=>{ const db=readDb(); db.users=db.users.filter(u=>u.id!==req.params.id); writeDb(db); res.json({ok:true}); });
app.delete('/api/admin/businesses/:id', auth, role('admin'), (req,res)=>{ const db=readDb(); const p=db.products.filter(x=>x.bizId===req.params.id); for(const x of p){ if(x.imageUrl){const fp=path.join(ROOT,x.imageUrl.replace(/^\//,'')); if(fs.existsSync(fp)) fs.unlinkSync(fp);} } db.businesses=db.businesses.filter(b=>b.id!==req.params.id); db.products=db.products.filter(p=>p.bizId!==req.params.id); writeDb(db); res.json({ok:true}); });
app.delete('/api/admin/products/:id', auth, role('admin'), (req,res)=>{ const db=readDb(); const p=db.products.find(x=>x.id===req.params.id); if(p?.imageUrl){const fp=path.join(ROOT,p.imageUrl.replace(/^\//,'')); if(fs.existsSync(fp)) fs.unlinkSync(fp);} db.products=db.products.filter(x=>x.id!==req.params.id); writeDb(db); res.json({ok:true}); });
app.get('/api/admin/settings', auth, role('admin'), (req,res)=>res.json(readDb().settings));
app.put('/api/admin/settings', auth, role('admin'), (req,res)=>{ const db=readDb(); db.settings.paymentAccounts={momo:clean(req.body.momo),mastercard:clean(req.body.mastercard)}; writeDb(db); res.json(db.settings); });
app.get('/api/admin/messages', auth, role('admin'), (req,res)=>{ const db=readDb(); res.json({messages:db.messages.filter(m=>m.kind==='chat').slice(-200).reverse()}); });

app.use((err,req,res,next)=>{ if(err instanceof multer.MulterError) return res.status(400).json({error:err.message}); if(err) return res.status(400).json({error:err.message||'Request failed.'}); next(); });

app.listen(PORT, ()=>console.log(`THE FREE MARKET GLOBE server running on http://localhost:${PORT}`));
