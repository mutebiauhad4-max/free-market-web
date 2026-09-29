# THE FREE MARKET GLOBE — Server-backed v2

This version replaces the browser-only product/data storage with a shared Node.js server. Products and uploaded images are stored on the server, so a product uploaded from one device can be viewed by other devices using the same deployed website.

## Main fixes in v2

- Product images are uploaded to `/uploads` on the server.
- Product records are stored in `server-data/database.json` on the server.
- Public catalogue reads from the server API instead of localStorage.
- Business uploads become public listings after the server saves them.
- User carts are synced to the server.
- Checkout groups cart items by business and only offers payment methods enabled by that business.
- Supported business payment methods: MTN MoMo Pay, Airtel Pay and Mastercard.
- Businesses can enter their payment account/reference for each enabled method.
- Businesses can select delivery/pickup points and set a fee per point, capped at UGX 10,000.
- Businesses can set product-specific delivery/pickup points and fees.
- Customer-to-business messages are stored on the server.
- Businesses can reply to individual customers from the dashboard.
- Signed-in customers poll for new business replies.
- Business and admin "View public site" links open the real public page in a new tab.
- Admin product deletion removes the server record and uploaded image.
- Admin and business dashboards read shared server data.
- Passwords for normal users/businesses are stored as scrypt hashes.
- Admin credentials can be overridden with environment variables.

## Run on Kali / Linux

Install Node.js 20 or newer, then in the project folder:

```bash
npm install
cp .env.example .env
npm start
```

Open:

```text
http://localhost:3000
```

For a fresh production server, set a long random `SESSION_SECRET` in `.env`.

## GitHub warning

GitHub Pages can host the front-end files, but it cannot run `server.js`. The server-backed version must be deployed to a Node.js-capable host or VPS. The browser should point to the same origin as the Node server so `/api/*` and `/uploads/*` work without CORS configuration.

The server writes `server-data/database.json` and uploaded files into `uploads/`. These directories are intentionally excluded from Git. A production deployment needs persistent storage; otherwise a host that resets its filesystem can lose uploaded images and data.

For a stronger production system, replace the JSON data store with PostgreSQL and replace local upload storage with persistent/object storage. The API routes are already separated so this can be done without redesigning the pages.

## Payment note

The site now respects each business's payment choices and displays the account/reference the business entered. The current server records the order and issues payment instructions; it does not claim that a real MTN MoMo, Airtel Pay or Mastercard transaction has been completed. Real payment collection requires approved gateway credentials and server-to-server verification from the relevant providers.

## Default demonstration admin

Name: `ADMIN GROUP A`

Password: `KU MASAKA`

Change these in production using `ADMIN_NAME` and `ADMIN_PASSWORD` environment variables.

## Project structure

```text
index.html
business-dashboard.html
admin.html
server.js
package.json
.env.example
css/style.css
js/data.js
js/main.js
js/dashboard.js
js/admin.js
uploads/              # created/used by the server
server-data/          # created/used by the server
```

## Core API routes

- `GET /api/catalog`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/me`
- `POST /api/products`
- `PUT /api/products/:id`
- `DELETE /api/products/:id`
- `PUT /api/business/settings`
- `GET /api/business/dashboard`
- `PUT /api/cart`
- `POST /api/orders`
- `POST /api/messages`
- `GET /api/messages/:businessId`
- `POST /api/messages/:businessId/reply`
- `GET /api/my/messages`
- Admin management routes under `/api/admin/*`

## v2.1 fixes

This update uses the server-backed v2 package and fixes the requested marketplace behaviour:

- Product images and product records are saved on the server and served from `/uploads` and `/api/catalog`, so they are visible to other devices connected to the same deployed server.
- Checkout only permits MTN MoMo Pay, Airtel Pay or Mastercard methods enabled by the relevant business.
- Customer-to-business chat is stored on the server. The business dashboard receives the conversation and can reply to the same customer. A small business-specific automatic assistant reply is generated after a customer message.
- The View public site link in both the business and admin dashboards has a direct navigation handler and opens `index.html` in a new tab.
- Businesses can configure MTN MoMo Pay, Airtel Pay and Mastercard account details from their dashboard.
- Businesses can configure delivery/pickup points and fees. The server enforces a maximum of UGX 10,000 per point.
- Product-level delivery options can be selected and their fees are validated server-side.
- Deleting a product also removes its stored server image.

For public multi-device operation, deploy the complete Node.js application. A static-only GitHub Pages deployment cannot execute `server.js` or store shared uploads.
