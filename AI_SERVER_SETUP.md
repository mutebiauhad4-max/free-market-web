# CAMPUS MARKET — AI-integrated website

This version includes the Business AI directly in `index.html` and uses `server/ai.js` as the secure Gemini backend.

## Render
Set the service as a Node web service with:
- Build command: `npm install`
- Start command: `npm start`

Add environment variables:
- `GEMINI_API_KEY` = your Gemini API key
- `GEMINI_MODEL` = `gemini-2.5-flash`

Do not put the Gemini API key in browser JavaScript.

The site also has your supplied Firebase project configuration enabled in `js/firebase-config.js`.

## Important
Firebase Firestore must be created and its rules/storage configured in the Firebase console for cross-device product data to persist.
