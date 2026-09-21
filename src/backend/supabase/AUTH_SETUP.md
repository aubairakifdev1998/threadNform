# Thread N Form — Supabase setup checklist

Do these in the Dashboard. The app cannot set them for you.

Open project:  
https://supabase.com/dashboard/project/ruoftwoqxbmvfgnxtywa

---

## Step 1 — Site URL & redirects (required for confirm email + Google)

1. Go to **Authentication → URL Configuration**
2. Set **Site URL** to:
   ```
   http://localhost:3001
   ```
3. Under **Redirect URLs**, add (one per line):
   ```
   http://localhost:3001/auth/callback
   http://localhost:3001/**
   ```
4. Click **Save**

---

## Step 2 — Brand the confirmation email (replace “Supabase Auth”)

1. Go to **Authentication → Emails** (or **Providers → Email**)
2. Set **Sender name** to:
   ```
   Thread N Form
   ```
3. Go to **Authentication → Email Templates → Confirm signup**
4. Set **Subject** to:
   ```
   Confirm your Thread N Form account
   ```
5. Replace the body with the HTML in:
   `src/backend/supabase/email-templates/confirm-signup.html`  
   (copy only the HTML below the comment block — keep `{{ .ConfirmationURL }}`)
6. Save

Optional later: custom SMTP under **Project Settings → Authentication → SMTP** with From name `Thread N Form`.

---

## Step 3 — Enable Google sign-in

### A. Google Cloud Console
1. Open https://console.cloud.google.com/apis/credentials
2. Create **OAuth client ID** → Application type **Web application**
3. Add **Authorized redirect URI** (copy exact value from Supabase Google provider screen). It looks like:
   ```
   https://ruoftwoqxbmvfgnxtywa.supabase.co/auth/v1/callback
   ```
4. Copy **Client ID** and **Client Secret**

### B. Supabase
1. Go to **Authentication → Providers → Google**
2. Enable Google
3. Paste Client ID + Client Secret
4. Save

Storefront already calls Google from `/login` → `/auth/callback`.

---

## Step 4 — Confirm admin access

Only users in table `admin_users` with `status = ACTIVE` can use `/admin`.

Local owner login is in:
`src/backend/.admin-credentials.local`

Regular customer accounts will be redirected away from admin.

---

## Quick verify

| Check | Expected |
|---|---|
| Register new email | Email from **Thread N Form**, not Supabase Auth |
| Confirm link | Lands on `localhost:3001/auth/callback`, then account |
| Google button | Opens Google, returns to storefront signed in |
| `/admin` as customer | Blocked |
| `/admin` as owner | Dashboard loads |

---

## Production (when you deploy)

Update Site URL + Redirect URLs to your live domain, e.g.:
```
https://threadnform.com
https://threadnform.com/auth/callback
```
Also set backend `FRONTEND_URL` and frontend `NEXT_PUBLIC_SITE_URL` to that domain.
