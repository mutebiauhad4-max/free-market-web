# CAMPUS MARKET: everything done (Group A, Kampala University Masaka)

## What is in this zip
- `website/` the complete site. Upload the CONTENTS of this folder to your GitHub repo (index.html must be at the top level).
- `screenshots/` every screenshot taken while building and testing (home, product, cart, checkout, dashboards, admin, Business AI).
- `CAMPUS_MARKET_Documentation.pdf` system documentation (version 2.0: now covers Business AI, the cloud-sync fix, payments and messaging).
- `tests/` the automated checks that were run.

## Done
1. **Public storefront**: search, categories, product pages, cart, checkout, cookie consent.
2. **Business dashboard**: products, orders, finance, charts, delivery/pickup map, payment methods, messages.
3. **Admin panel**: users, businesses, products, traffic and progression charts, report download, feedback and thread oversight.
4. **Shared database (Firebase)**: optional, already on in your live site.
5. **Bug fixes**: cart behind header, "View public site" links, sign-up redirect, and the **cloud data-loss bug** (businesses showing 0 in admin / "Unknown seller" on products).
6. **Payments and delivery**: per-business MoMo/Airtel/Mastercard, checkout shows only methods every seller in the cart accepts, per-location delivery fees capped at UGX 10,000.
7. **Messaging**: shopper to business and back, with unread badge.
8. **Rebrand** to CAMPUS MARKET with new logo, favicon and illustration.
9. **Business AI**: one chat that uses many free AI services (Gemini, Groq, OpenRouter, Mistral, Cerebras, SambaNova, Hugging Face, GitHub Models, NVIDIA, Together). It tries the next service automatically if one is busy or out of free quota, lets shoppers pick a service, reads product photos, saves each shopper's chat memory, and falls back to built-in help. Optional key-hiding server in `website/server/`.

## Tested
- Full end-to-end suite: all checks passed.
- Business AI (simulated Gemini): answer, memory after reload, product image sent, fallback on failure, clear history: passed.
- Cloud fix (simulated Firestore): local business survives and uploads; real cloud data is never overwritten: passed.

## Things YOU must do / know
1. **Re-register any business that disappeared** on the live site (data already wiped can't be recovered). Admin should then show it and products show the seller name.
2. **Turn on Business AI**: get a free key from each service you want (links are in `website/js/ai-config.js`) and paste it in. Empty ones are skipped; more keys means more free usage. Use free-tier keys only, since visitors can read keys in a static site; for a serious launch use the proxy in `website/server/`. Services without a public API (free ChatGPT or Claude web chat) cannot be added. I tested against simulated services only (no internet here), and free plans and model names change, so after adding keys ask one question per service and tell me which fail.
3. **Real money**: checkout is still simulated. Finance pages are computed from recorded orders, but no real payments are collected. Going live with payments needs a provider account (e.g. Flutterwave/Pesapal) plus a small server. Until then, avoid telling customers that payment is taken online.
4. The Chart.js error in your console is a blocked CDN (ad-blocker/network), not a code fault.

Admin login: ADMIN GROUP A / KU MASAKA (change this before wide use).
