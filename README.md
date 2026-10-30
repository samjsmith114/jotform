# Emergency Fund Man -> TimePayment Automation (Vercel & Cloud)

Automated integration bridge that connects the branded **Emergency Fund Man** Jotform directly to the **TimePayment** Dealer Application portal (`dealercode=VHD64&apptype=B`).

## Architecture
1. **Customer Submits Form:** Customer applies via the branded Jotform (`https://form.jotform.com/263005960567056` or custom domain).
2. **Webhook Triggered:** Jotform fires an instant webhook payload to `/webhook` (handled by Vercel Serverless Function `/api/webhook.js`).
3. **Automated Submission:** Headless Playwright browser launches silently via `@sparticuz/chromium`, fills out TimePayment fields, agrees to terms, and submits.
4. **Email Notification:** Client receives immediate confirmation email with details at `sam@emergencyfundman.com`.
5. **Brand Concealment:** The customer never sees TimePayment URLs, logos, or disclosures.

## 🚀 Deployment on Vercel
1. Log in to [Vercel.com](https://vercel.com) using your GitHub account (`samjsmith114`).
2. Click **Add New...** -> **Project**.
3. Import the repository: **`samjsmith114/jotform`**.
4. Framework Preset: **Other**.
5. Click **Deploy**.
6. Vercel will build and assign a live production URL, e.g.:
   `https://jotform-xxx.vercel.app`

## 🔗 Jotform Webhook Setup
1. Open the form in Jotform Builder: `https://www.jotform.com/build/263005960567056`.
2. Go to **Settings** -> **Integrations**.
3. Search for **WebHooks**.
4. Enter your live Vercel URL followed by `/webhook`:
   ```
   https://your-project.vercel.app/webhook
   ```
5. Click **Complete Integration**.
