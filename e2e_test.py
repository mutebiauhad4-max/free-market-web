from playwright.sync_api import sync_playwright

BASE = "http://localhost:8123"

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        # ---- 1. View public site links ----
        page.goto(f"{BASE}/index.html", wait_until="load")
        page.evaluate("document.getElementById('consentAccept').click()")
        page.evaluate("FMG.setSession({type:'business', id: FMG.getBusinesses()[0].id})")
        page.goto(f"{BASE}/business-dashboard.html", wait_until="load")
        page.click("text=View public site")
        page.wait_for_timeout(300)
        assert page.url.endswith("index.html"), f"FAIL business View public site -> {page.url}"
        print("PASS: business dashboard 'View public site' navigates")

        page.evaluate("FMG.setSession({type:'admin'})")
        page.goto(f"{BASE}/admin.html", wait_until="load")
        page.click("text=View public site")
        page.wait_for_timeout(300)
        assert page.url.endswith("index.html"), f"FAIL admin View public site -> {page.url}"
        print("PASS: admin panel 'View public site' navigates")

        # ---- 2. Business signup redirects to dashboard ----
        page.goto(f"{BASE}/index.html", wait_until="load")
        page.evaluate("document.getElementById('consentAccept').click()")
        page.evaluate("openAuthModal('signup')")
        page.click("#roleBizBtn")
        page.fill("#suBizName", "New Test Business")
        page.fill("#suEmail", "newtestbiz@example.com")
        page.fill("#suPw", "password1")
        page.click("text=Create account")
        page.wait_for_timeout(400)
        assert page.url.endswith("business-dashboard.html"), f"FAIL signup redirect -> {page.url}"
        print("PASS: business signup redirects to dashboard")

        # ---- 3. Payment methods dashboard section ----
        page.evaluate("showSection('sec-payment-methods')")
        page.wait_for_timeout(200)
        page.check("#pm-momo-enabled")
        page.fill("#pm-momo-value", "+256799999999")
        page.click("#paymentMethodsSaveBtn")
        page.wait_for_timeout(200)
        biz = page.evaluate("FMG.getBusinesses().find(b=>b.name==='New Test Business')")
        assert biz["paymentMethods"]["momo"]["enabled"] and biz["paymentMethods"]["momo"]["number"] == "+256799999999"
        print("PASS: business payment methods saved")

        # ---- 4. Delivery fee cap enforcement ----
        page.evaluate("fmgSave('fmg_biz_locations_' + FMG.getBusinesses().find(b=>b.name==='New Test Business').id, ['masaka'])")
        page.evaluate("openProductForm(null)")
        page.wait_for_timeout(200)
        page.fill("#pfName", "Overpriced Delivery Item")
        page.fill("#pfPrice", "10000")
        page.fill("#pfStock", "5")
        page.check("#pfDeliveryEnabled")
        page.wait_for_timeout(200)
        page.fill(".pf-delivery-fee", "15000")  # exceeds cap
        page.click("#productFormSave")
        page.wait_for_timeout(200)
        err_visible = page.is_visible("#productFormError:not(.hidden)")
        assert err_visible, "FAIL: delivery fee cap was not enforced"
        print("PASS: delivery fee >10,000 blocked with error:", page.text_content("#productFormError"))

        page.fill(".pf-delivery-fee", "8000")  # within cap
        page.click("#productFormSave")
        page.wait_for_timeout(300)
        prod = page.evaluate("FMG.getProducts().find(p=>p.name==='Overpriced Delivery Item')")
        assert prod["deliveryFees"]["masaka"] == 8000
        print("PASS: valid delivery fee saved:", prod["deliveryFees"])

        # ---- 5. Checkout uses business-specific payment methods + delivery fee ----
        page.evaluate("""() => {
            const u = {id: FMG.uid('user'), role:'user', name:'Checkout Tester', email:'checkout.tester@example.com', password:'x', joined:'2026-01-01'};
            FMG.saveUsers([u]); FMG.setSession({type:'user', id:u.id});
        }""")
        page.goto(f"{BASE}/index.html", wait_until="load")
        page.evaluate("document.getElementById('consentAccept')?.click()")
        page.evaluate("""() => {
            const p = FMG.getProducts().find(x=>x.name==='Overpriced Delivery Item');
            addToCart(p.id);
        }""")
        page.evaluate("openCheckoutModal()")
        page.wait_for_timeout(300)
        options = page.evaluate("Array.from(document.querySelectorAll('#checkoutMethod option')).map(o=>o.value)")
        assert options == ["momo"], f"FAIL: expected only momo offered, got {options}"
        print("PASS: checkout only offers the business's configured payment method:", options)

        page.select_option("#checkoutLocation", "masaka")
        page.wait_for_timeout(200)
        fee_text = page.text_content("#checkoutDeliveryFee")
        assert "8,000" in fee_text, f"FAIL delivery fee display: {fee_text}"
        print("PASS: delivery fee shown at checkout:", fee_text)

        # ---- 6. Messaging: user -> business -> reply ----
        page.fill("#payDetail", "0799999999") if page.is_visible("#payDetail") else None
        page.evaluate("document.getElementById('checkoutOverlay')?.remove()")
        page.evaluate("""() => {
            const p = FMG.getProducts().find(x=>x.name==='Overpriced Delivery Item');
            openThreadWithBusiness(p.bizId);
        }""")
        page.wait_for_timeout(200)
        page.fill("#threadInput", "Hi, is this still in stock?")
        page.click("#threadOverlay button.btn-primary")
        page.wait_for_timeout(200)
        thread = page.evaluate("FMG.getThreads()[0]")
        assert thread["messages"][-1]["text"] == "Hi, is this still in stock?"
        print("PASS: user message saved to thread")
        page.evaluate("document.getElementById('threadOverlay')?.remove()")

        # business replies
        page.evaluate(f"""() => {{
            const threads = FMG.getThreads();
            threads[0].messages.push({{from:'business', text:'Yes it is!', at: new Date().toISOString()}});
            threads[0].unreadForUser = true;
            FMG.saveThreads(threads);
        }}""")
        page.evaluate("renderMessagesBadge()")
        page.wait_for_timeout(200)
        badge_visible = page.is_visible("#messagesCount:not(.hidden)")
        assert badge_visible, "FAIL: unread messages badge not shown after business reply"
        print("PASS: unread badge appears after business reply")

        page.click("#messagesOpenBtn")
        page.wait_for_timeout(200)
        page.click("#myMessagesOverlay .cart-item")
        page.wait_for_timeout(200)
        msgs = page.evaluate("document.getElementById('threadMessages').innerText")
        assert "Yes it is!" in msgs, f"FAIL: reply not visible in thread modal: {msgs}"
        print("PASS: customer can see the business's reply:", msgs)

        print("\\nALL CHECKS PASSED" if not errors else f"\\nPAGE ERRORS SEEN: {errors}")
        browser.close()

run()
