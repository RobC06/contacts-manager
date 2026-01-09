# Deployment Guide - Contact Outreach Manager

This guide will help you deploy your Contact Outreach Manager to the web so you can access it from anywhere.

## Before You Deploy

**Important Security Note:** When deploying to the web, your application will be accessible via the internet. Make sure to:
- Use a strong password (set during first-time setup)
- Consider the platform's security features
- Regularly backup your data

## Recommended Free Hosting Options

### Option 1: Render (Easiest, Recommended)

**Free Tier:**  - 750 hours/month free
- Automatic HTTPS
- Persistent storage available

**Steps:**

1. **Create a Render account**
   - Go to https://render.com
   - Sign up with GitHub (easiest method)

2. **Prepare your repository**
   - Make sure all your code is committed and pushed to GitHub
   - The repository should include all files from this project

3. **Create a new Web Service on Render**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Name:** contact-outreach-manager (or your choice)
     - **Environment:** Node
     - **Build Command:** `npm install`
     - **Start Command:** `npm start`
     - **Instance Type:** Free

4. **Add Environment Variables** (in Render dashboard)
   - `NODE_ENV`: `production`
   - `SESSION_SECRET`: `your-random-secret-key-here` (generate a strong random string)
   - `PORT`: Leave blank (Render sets this automatically)

5. **Deploy**
   - Click "Create Web Service"
   - Wait for deployment (3-5 minutes)
   - Access your app at: `https://your-app-name.onrender.com`

6. **Enable Persistent Disk** (Important!)
   - Go to your service settings
   - Add a disk at path: `/home/user/RobC06/data`
   - Size: 1GB (free tier)
   - This ensures your contacts aren't lost when the service restarts

**Note:** Free tier services sleep after 15 minutes of inactivity and take 30-60 seconds to wake up.

---

### Option 2: Railway

**Free Tier:** $5 credit/month (usually enough for small apps)

**Steps:**

1. **Create Railway account**
   - Go to https://railway.app
   - Sign up with GitHub

2. **Deploy from GitHub**
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository
   - Railway auto-detects Node.js

3. **Add Environment Variables**
   - Go to Variables tab
   - Add:
     - `NODE_ENV`: `production`
     - `SESSION_SECRET`: `your-random-secret-key-here`

4. **Access your app**
   - Railway provides a URL automatically
   - Or add a custom domain

5. **Add Persistent Volume**
   - In project settings, add a volume
   - Mount path: `/home/user/RobC06/data`
   - Size: 1GB

---

### Option 3: Fly.io

**Free Tier:** Good free tier with persistent volumes

**Steps:**

1. **Install Fly CLI**
   ```bash
   # Windows (PowerShell)
   iwr https://fly.io/install.ps1 -useb | iex

   # Mac/Linux
   curl -L https://fly.io/install.sh | sh
   ```

2. **Login and Launch**
   ```bash
   fly auth login
   cd /path/to/RobC06
   fly launch
   ```

3. **Configure during launch**
   - Accept suggested app name or provide your own
   - Choose a region close to you
   - Don't deploy yet (answer 'no')

4. **Edit fly.toml** (auto-generated file)
   ```toml
   [env]
     NODE_ENV = "production"

   [[mounts]]
     source = "data"
     destination = "/home/user/RobC06/data"
   ```

5. **Set secrets**
   ```bash
   fly secrets set SESSION_SECRET=your-random-secret-key-here
   ```

6. **Deploy**
   ```bash
   fly deploy
   ```

7. **Create volume** (for persistent data)
   ```bash
   fly volumes create data --size 1
   ```

---

## Post-Deployment Setup

1. **First Access:**
   - Visit your deployed URL
   - You'll see the setup page
   - Create your password (min 6 characters)
   - You're ready to use the app!

2. **Configure Email Notifications** (Optional)
   - Login to your app
   - Click Settings
   - Enable email notifications
   - Add your SMTP details (Gmail App Password recommended)

3. **Bookmark Your URL**
   - Save your deployment URL for easy access

---

## Using a Custom Domain (Optional)

All three platforms support custom domains:

**Render:**
- Settings → Custom Domain → Add your domain
- Update DNS records as instructed

**Railway:**
- Settings → Domains → Add custom domain
- Update DNS records

**Fly.io:**
```bash
fly certs add yourdomain.com
```

---

## Data Backup

Your contacts are stored in `/data/contacts.json`. To backup:

**Render/Railway/Fly:**
- Use their CLI tools to access the volume
- Or, add a backup feature to the app (export contacts as JSON)

**Simple Backup Method:**
1. Login to your app
2. Open browser DevTools (F12)
3. Console tab, run:
   ```javascript
   fetch('/api/contacts')
     .then(r => r.json())
     .then(data => {
       const a = document.createElement('a');
       a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)]));
       a.download = 'contacts-backup.json';
       a.click();
     });
   ```
4. This downloads all your contacts as JSON

---

## Troubleshooting

### App won't start
- Check build logs in platform dashboard
- Ensure `npm install` completed successfully
- Verify `PORT` environment variable (should be set automatically)

### Can't login after deployment
- Clear browser cookies
- Check that persistent volume is mounted correctly
- Config file may need to be recreated

### Email notifications not working
- Verify SMTP settings in Settings page
- For Gmail, ensure you're using an App Password
- Check application logs for errors

### Data lost after restart
- Ensure persistent volume/disk is configured
- Path must be: `/home/user/RobC06/data`
- Restart the service after adding volume

---

## Security Best Practices

1. **Use a Strong Password**
   - At least 12 characters
   - Mix of letters, numbers, symbols

2. **Change SESSION_SECRET**
   - Never use the default
   - Generate random 32+ character string

3. **Enable HTTPS**
   - All recommended platforms provide free HTTPS
   - Never disable it

4. **Regular Backups**
   - Export your contacts monthly
   - Store backups securely

5. **Monitor Access**
   - Only share your URL with people you trust
   - Change password if compromised

---

## Cost Estimates

**Free Tier Limits:**
- **Render:** 750 hrs/month, 1GB disk - **$0/month**
- **Railway:** $5 credit/month - **$0-5/month**
- **Fly.io:** 3 VMs, 3GB volume - **$0/month**

For most solo users, free tiers are sufficient!

**If you outgrow free tier:**
- Render: ~$7/month
- Railway: ~$5-10/month
- Fly.io: ~$5-10/month

---

## Getting Help

If you encounter issues:
1. Check platform documentation
2. Check application logs in dashboard
3. Verify environment variables are set
4. Ensure persistent storage is configured

---

**You're all set!** Choose a platform above and follow the steps to deploy your Contact Outreach Manager to the web.
