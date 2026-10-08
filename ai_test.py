import json
from playwright.sync_api import sync_playwright
CHROME="/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
calls=[]
def make(name,status=200):
    def h(route):
        body=json.loads(route.request.post_data); calls.append((name,body,route.request.headers))
        if status!=200: return route.fulfill(status=status,body="busy")
        if name=="gemini": out={"candidates":[{"content":{"parts":[{"text":"ANSWER from gemini"}]}}]}
        else: out={"choices":[{"message":{"content":"ANSWER from "+name}}]}
        route.fulfill(status=200,content_type="application/json",body=json.dumps(out))
    return h
CONF='''const BUSINESS_AI_CONFIG={enabled:true,mode:"failover",proxyUrl:"",timeoutMs:5000,providers:[
{id:"gemini",name:"Google Gemini",type:"gemini",model:"g",apiKey:"K1",vision:true,search:true},
{id:"groq",name:"Groq",type:"openai",url:"https://api.groq.com/openai/v1/chat/completions",model:"m",apiKey:"K2"},
{id:"mistral",name:"Mistral",type:"openai",url:"https://api.mistral.ai/v1/chat/completions",model:"m",apiKey:"K3",vision:true},
{id:"cerebras",name:"Cerebras",type:"openai",url:"https://api.cerebras.ai/v1/chat/completions",model:"m",apiKey:""}]};'''
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME,args=["--no-sandbox"])
    pg=b.new_context(viewport={"width":1280,"height":800}).new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.route("**/ai-config.js",lambda r:r.fulfill(content_type="application/javascript",body=CONF))
    pg.route("**/generativelanguage.googleapis.com/**",make("gemini",429))   # Gemini out of quota
    pg.route("**/api.groq.com/**",make("groq")); pg.route("**/api.mistral.ai/**",make("mistral")); pg.route("**/api.cerebras.ai/**",make("cerebras"))
    pg.goto("http://localhost:8123/index.html"); pg.wait_for_timeout(700); pg.click("#consentAccept"); pg.click("#baiToggle")
    opts=pg.eval_on_selector_all("#baiProvider option","o=>o.map(x=>x.textContent)"); print("picker:",opts)
    assert len(opts)==4   # auto + 3 keyed providers (cerebras has no key -> skipped)
    pg.fill("#baiInput","best phone?"); pg.click("#baiSend"); pg.wait_for_timeout(900)
    t=pg.inner_text("#baiBody"); assert "ANSWER from groq" in t and "via Groq" in t, t
    print("failover ok: gemini 429 -> groq answered")
    assert not any(c[0]=="cerebras" for c in calls)
    assert calls[1][2].get("authorization")=="Bearer K2"
    pg.select_option("#baiProvider","mistral"); pg.fill("#baiInput","and delivery?"); pg.click("#baiSend"); pg.wait_for_timeout(900)
    assert "via Mistral" in pg.inner_text("#baiBody"); print("manual provider choice ok")
    # picture question must skip non-vision groq and go to a vision provider
    pg.evaluate("document.getElementById('baiFile').dispatchEvent(new Event('x'))")
    n=len(calls)
    pg.set_input_files("#baiFile",{"name":"a.png","mimeType":"image/png","buffer":bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cfc0000003010100c9fe92ef0000000049454e44ae426082")})
    pg.wait_for_timeout(700); pg.select_option("#baiProvider","auto"); pg.fill("#baiInput","what is this?"); pg.click("#baiSend"); pg.wait_for_timeout(1200)
    used=[c[0] for c in calls[n:]]; print("picture question tried:",used); assert "groq" not in used and used[-1]=="mistral"
    pg.screenshot(path="/home/claude/shots/24_business_ai_multi_provider.png")
    # all fail -> built-in fallback
    for pat,nm in [("**/api.groq.com/**","groq"),("**/api.mistral.ai/**","mistral")]:
        pg.unroute(pat); pg.route(pat,make(nm,500))
    pg.fill("#baiInput","how do I pay?"); pg.click("#baiSend"); pg.wait_for_timeout(1500)
    assert "MTN MoMo" in pg.inner_text("#baiBody"); print("all-fail fallback ok")
    pg.reload(); pg.wait_for_timeout(500); pg.click("#baiToggle"); assert "best phone?" in pg.inner_text("#baiBody"); print("memory ok")
    print("errors:",errs); print("AI TESTS PASSED"); b.close()
