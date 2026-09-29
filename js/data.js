/* THE FREE MARKET GLOBE v2 - shared API client */
const API_BASE = '/api';
const FMG_CATEGORIES = [
  {id:'electronics',label:'Electronics'}, {id:'fashion',label:'Fashion'}, {id:'office',label:'Office'},
  {id:'machinery',label:'Machinery'}, {id:'home',label:'Home & Living'}, {id:'agriculture',label:'Agriculture'}
];
const FMG_LOCATIONS = [
  {id:'masaka',label:'Masaka',lat:-0.3372,lng:31.7345}, {id:'ssembabule',label:'Ssembabule',lat:-0.0904,lng:31.4534},
  {id:'kampala',label:'Kampala',lat:0.3476,lng:32.5825}, {id:'gayaza',label:'Gayaza',lat:0.4907,lng:32.6167},
  {id:'kyotera',label:'Kyotera',lat:-0.6193,lng:31.5253}, {id:'kumasaka',label:'Kampala University Masaka',lat:-0.3406,lng:31.7331}
];
const FMG_FREE_TRIAL_LIMIT=100, FMG_FREE_TRIAL_MONTHS=6;
const tokenKey='fmg_token', cartKey='fmg_cart';
function fmgLoad(key,fallback){try{const x=localStorage.getItem(key);return x?JSON.parse(x):fallback}catch{return fallback}}
function fmgSave(key,v){localStorage.setItem(key,JSON.stringify(v))}
function fmgUid(prefix){return prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7)}
async function fmgApi(path,options={}){
  const headers={...(options.headers||{})}; const token=localStorage.getItem(tokenKey);
  if(token) headers.Authorization='Bearer '+token;
  if(options.body && !(options.body instanceof FormData) && !headers['Content-Type']) headers['Content-Type']='application/json';
  const res=await fetch(API_BASE+path,{...options,headers});
  let data={}; try{data=await res.json()}catch{}
  if(res.status===401){ localStorage.removeItem(tokenKey); localStorage.removeItem('fmg_account'); }
  if(!res.ok) throw new Error(data.error||'Request failed.');
  return data;
}
const FMG={
  categories:FMG_CATEGORIES,locations:FMG_LOCATIONS,uid:fmgUid,
  getSession(){return fmgLoad('fmg_account',null)},
  setSession(account,token){fmgSave('fmg_account',account);localStorage.setItem(tokenKey,token)},
  clearSession(){localStorage.removeItem('fmg_account');localStorage.removeItem(tokenKey);localStorage.removeItem(cartKey)},
  getCart(){return fmgLoad(cartKey,[])}, saveCart(v){fmgSave(cartKey,v)},
  categoryById(id){return FMG_CATEGORIES.find(x=>x.id===id)}, locationById(id){return FMG_LOCATIONS.find(x=>x.id===id)},
  placeholder(category,name){const c=category||'market';const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 420"><rect width="600" height="420" fill="#3B2417"/><circle cx="500" cy="80" r="150" fill="#E8A93B" opacity=".12"/><text x="300" y="235" font-family="Georgia" font-size="72" fill="#E8A93B" text-anchor="middle">${(name||c).slice(0,2).toUpperCase()}</text></svg>`;return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)},
  async catalog(params={}){const q=new URLSearchParams();if(params.cat)q.set('cat',params.cat);if(params.q)q.set('q',params.q);return fmgApi('/catalog?'+q)},
  async login(id,password){const r=await fmgApi('/auth/login',{method:'POST',body:JSON.stringify({id,password})});this.setSession(r.account,r.token);return r.account},
  async signup(payload){const r=await fmgApi('/auth/signup',{method:'POST',body:JSON.stringify(payload)});this.setSession(r.account,r.token);return r.account},
  async me(){return (await fmgApi('/me')).account},
  async product(id){return fmgApi('/products/'+encodeURIComponent(id))},
  async addCart(productId){const cart=this.getCart();const i=cart.find(x=>x.productId===productId);if(i)i.qty++;else cart.push({productId,qty:1});this.saveCart(cart);return cart},
  async saveCartRemote(){if(this.getSession()?.type!=='user')return;await fmgApi('/cart',{method:'PUT',body:JSON.stringify({items:this.getCart()})})},
  async sendMessage(businessId,text){return fmgApi('/messages',{method:'POST',body:JSON.stringify({businessId,text})})},
  async messages(businessId){return fmgApi('/messages/'+businessId)},
  async feedback(message,businessId=null){return fmgApi('/feedback',{method:'POST',body:JSON.stringify({message,businessId})})}
};
