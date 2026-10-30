# Emergency Fund Man -> TimePayment Automation

Automated integration bridge that connects the branded **Emergency Fund Man** Jotform directly to the **TimePayment** Dealer Application portal (`dealercode=VHD64&apptype=B`).

## Architecture
1. **Customer Submits Form:** Customer applies via the branded Jotform (`https://form.jotform.com/263005960567056` or custom domain).
2. **Webhook Triggered:** Jotform fires an instant webhook payload to `/webhook`.
3. **Automated Submission:** Headless Playwright browser launches silently, fills out TimePayment fields, agrees to terms, and submits.
4. **Email Notification:** Client receives immediate confirmation email with details at `sam@emergencyfundman.com`.
5. **Brand Concealment:** The customer never sees TimePayment URLs, logos, or disclosures.

## Deployment on Render (Free)
1. Log in to [Render.com](https://render.com).
2. Click **New +** -> **Web Service**.
3. Connect your GitHub repository: `samjsmith114/jotform`.
4. Choose **Docker** environment (Render detects `Dockerfile` automatically).
5. Click **Create Web Service**.
6. Render will generate a live URL, e.g.: `https://jotform-timepayment.onrender.com`.

## Jotform Webhook Setup
1. Open the form in Jotform Builder: `https://www.jotform.com/build/263005960567056`.
2. Go to **Settings** -> **Integrations**.
3. Search for **WebHooks**.
4. Enter your live Render URL followed by `/webhook`:
   ```
   https://your-service-name.onrender.com/webhook
   ```
5. Click **Complete Integration**.
