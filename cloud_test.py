from playwright.sync_api import sync_playwright
CHROME="/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME,args=["--no-sandbox"]); pg=b.new_page()
    errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    # Scenario 1: business created locally BEFORE cloud was enabled, cloud empty -> must survive and be uploaded
    pg.add_init_script("""if(!localStorage.getItem('seeded')){localStorage.setItem('seeded','1');
      localStorage.setItem('fmg_businesses',JSON.stringify([{id:'b1',name:'Local Shop',location:'masaka'}]));
      localStorage.setItem('fmg_products',JSON.stringify([{id:'p1',bizId:'b1',name:'Thing',price:5000}]));}""")
    pg.goto("http://localhost:8123/_cloudtest.html"); pg.wait_for_timeout(800)
    local=pg.evaluate("JSON.parse(localStorage.getItem('fmg_businesses'))")
    cloud=pg.evaluate("Object.keys(__cloud.fmg_businesses||{})")
    print("S1 local businesses after sync:",[x['name'] for x in local],"| cloud has:",cloud)
    assert len(local)==1 and cloud==['b1']
    # Scenario 2: cloud already has real data from other devices -> stale local must NOT overwrite it
    pg.evaluate("localStorage.setItem('fmg_businesses',JSON.stringify([{id:'old',name:'Stale'}]))")
    pg.evaluate("sessionStorage.setItem('cloudstate',JSON.stringify({fmg_businesses:{b9:{id:'b9',name:'Real Cloud Shop'}}}))")
    pg.goto("http://localhost:8123/_cloudtest.html"); pg.wait_for_timeout(800)
    local=pg.evaluate("JSON.parse(localStorage.getItem('fmg_businesses'))")
    print("S2 local after sync:",[x['name'] for x in local])
    assert [x["name"] for x in local]==["Real Cloud Shop"]; print("errors:",errs); print("CLOUD FIX PASSED"); b.close()
