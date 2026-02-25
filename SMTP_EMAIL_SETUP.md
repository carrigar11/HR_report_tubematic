# Why you didn't receive the company registration email

The app **saves** every "Register your company" request in the database (you can see them in **System Owner → Company requests**). The email to **deveshgoswami191@gmail.com** is only sent if **SMTP is configured** in the app.

## How to receive emails at deveshgoswami191@gmail.com

1. **Log in as admin** (or system owner) and open **Settings** (gear icon in the header).

2. **Email SMTP (send mail)** section:
   - If it says "No SMTP config found", you must add one first in **Django Admin**:  
     `http://localhost:8000/admin/` → **Core** → **Email SMTP configs** → **Add**.
   - Fill in:
     - **SMTP server:** `smtp.gmail.com`
     - **SMTP port:** `587`
     - **Auth username:** `deveshgoswami191@gmail.com` (or another Gmail you use to send)
     - **Auth password:** use a **Gmail App Password** (not your normal Gmail password)
     - **Is active:** ✓
   - Save. Then in the app **Settings** page you can edit the same config (e.g. change password).

3. **Gmail App Password** (required for Gmail):
   - Go to [Google Account → Security](https://myaccount.google.com/security).
   - Turn on **2-Step Verification** if it’s off.
   - Open **App passwords** (search for it or under "2-Step Verification").
   - Create an app password for "Mail" / "Other (HR app)".
   - Use that **16-character password** in **Auth password** (no spaces).

4. **Recipient:** The app sends the company registration email to the address set in:
   - **System setting** `company_registration_email`, or
   - Default: **deveshgoswami191@gmail.com**

After SMTP is configured and saved, new "Register your company" submissions will send an email to that address. Old requests are still in **System Owner → Company requests**.
