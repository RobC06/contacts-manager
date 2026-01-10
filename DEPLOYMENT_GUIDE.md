# Contact Outreach Manager - Deployment Guide

This guide will walk you through deploying your Contact Outreach Manager to the web using MongoDB Atlas (FREE) and Railway ($5/month).

## Why This Setup?

- **MongoDB Atlas**: Free forever tier, stores all your data in the cloud
- **Railway**: $5/month, reliable hosting with automatic deployments
- **Result**: Access your contacts from any computer, phone, or tablet with internet

---

## Part 1: Set Up MongoDB Atlas (5 minutes)

### Step 1: Create MongoDB Atlas Account

1. Go to [https://www.mongodb.com/cloud/atlas/register](https://www.mongodb.com/cloud/atlas/register)
2. Click "Sign up" and create a free account
3. Choose "Create a deployment" or "Build a Database"
4. Select the **FREE** tier (M0 Sandbox)
5. Choose a cloud provider and region (pick the one closest to you)
6. Click "Create Deployment"

### Step 2: Create Database User

1. You'll see a "Security Quickstart" screen
2. Create a database user:
   - **Username**: `contact_admin` (or your choice)
   - **Password**: Click "Autogenerate Secure Password" and **SAVE THIS PASSWORD**
3. Click "Create User"

### Step 3: Set Up Network Access

1. Click "Add My Current IP Address" (this allows your computer to connect)
2. **IMPORTANT**: Also add `0.0.0.0/0` to allow Railway to connect
   - Click "Add IP Address"
   - Enter `0.0.0.0/0`
   - Description: "Allow Railway Access"
   - Click "Add Entry"
3. Click "Finish and Close"

### Step 4: Get Your Connection String

1. Click "Connect" on your cluster
2. Choose "Connect your application"
3. Select "Driver: Node.js" and "Version: 5.5 or later"
4. Copy the connection string - it looks like:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
5. **Replace `<password>` with your actual database password** (the one you saved earlier)
6. **Save this connection string** - you'll need it for Railway

---

## Part 2: Deploy to Railway (10 minutes)

### Step 1: Create Railway Account

1. Go to [https://railway.app](https://railway.app)
2. Click "Start a New Project"
3. Sign up using your **GitHub account** (this connects your code)

### Step 2: Create New Project

1. After logging in, click "New Project"
2. Select "Deploy from GitHub repo"
3. If asked, authorize Railway to access your GitHub
4. Select your repository: **RobC06/RobC06**
5. Choose branch: **claude/contact-outreach-manager-wch38**

### Step 3: Configure Environment Variables

1. Once the project is created, click on your service
2. Go to the "Variables" tab
3. Add these environment variables by clicking "New Variable":

   | Variable Name | Value |
   |--------------|-------|
   | `MONGODB_URI` | Your MongoDB connection string from Part 1, Step 4 |
   | `SESSION_SECRET` | Any random string (example: `my-super-secret-key-12345`) |
   | `NODE_ENV` | `production` |

4. Click "Add" for each variable

### Step 4: Deploy

1. Railway will automatically start deploying your app
2. Wait 2-3 minutes for the deployment to complete
3. Look for "Success" or "Active" status

### Step 5: Get Your App URL

1. Go to the "Settings" tab
2. Scroll down to "Domains"
3. Click "Generate Domain"
4. Railway will give you a URL like: `your-app.up.railway.app`
5. **Save this URL** - this is your web address!

### Step 6: Access Your App

1. Open your Railway app URL in a browser
2. You'll see the setup page (since it's the first time)
3. Create your password
4. Start using your app from anywhere!

---

## Part 3: Update Your Local App (Optional)

If you want to test the MongoDB connection locally before deploying:

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Create .env File

Create a file named `.env` in your project root with this content:

```
MONGODB_URI=your_mongodb_connection_string_here
SESSION_SECRET=your_random_secret_key_here
NODE_ENV=development
PORT=3000
```

Replace `your_mongodb_connection_string_here` with your MongoDB Atlas connection string.

### Step 3: Run Locally

```bash
npm start
```

Or use your `start.bat` file as usual.

---

## Costs

- **MongoDB Atlas**: FREE forever (512MB storage)
- **Railway**: $5/month (includes everything you need)
- **Total**: $5/month

---

## Important Notes

### Data Migration

Your existing contacts in the JSON files will NOT automatically transfer. You have two options:

1. **Export and Re-import**: Export your current contacts to CSV, then import them into the new web app
2. **Fresh Start**: Just start fresh (recommended if you have very few contacts)

### Custom Domain (Optional)

If you want a custom domain like `contacts.yourname.com`:

1. Buy a domain from any registrar (Namecheap, Google Domains, etc.)
2. In Railway, go to Settings → Domains
3. Click "Add Custom Domain"
4. Follow Railway's instructions to point your domain to Railway

### Automatic Deployments

Railway is now connected to your GitHub branch. Whenever you push changes to your branch, Railway will automatically redeploy your app!

---

## Troubleshooting

### App Won't Start

- Check that your `MONGODB_URI` is correct in Railway variables
- Make sure you replaced `<password>` with your actual password
- Check Railway logs for error messages

### Can't Connect to Database

- Verify you added `0.0.0.0/0` to MongoDB Atlas Network Access
- Double-check the connection string has the right password

### Lost Password

- Go to MongoDB Atlas → Database Access
- Edit your user and reset the password
- Update the `MONGODB_URI` in Railway with the new password

---

## Questions?

If you run into issues, check:
1. Railway deployment logs (in Railway dashboard)
2. MongoDB Atlas monitoring (in Atlas dashboard)
3. Make sure all environment variables are set correctly

---

## Success!

Once deployed, you can:
- Access your contacts from any device with internet
- Share the URL with team members (if needed)
- Your data is automatically backed up by MongoDB Atlas
- No more losing data when restarting!

Enjoy your Contact Outreach Manager on the web! 🎉
