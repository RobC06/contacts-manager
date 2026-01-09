# Contact Outreach Manager

A secure web application for managing contact outreach with email follow-up reminders. Track your communications, manage follow-ups, and never miss an important contact again. Access from any computer with password protection.

## Features

- **🔐 Password Protected**: Secure login system protects your contacts
- **🌐 Web Accessible**: Run locally or deploy to the web (Render, Railway, Fly.io)
- **📇 Contact Management**: Store and manage contacts with name, company, title, and tags
- **📝 Communication History**: Track all your emails, phone calls, and meetings with dates and descriptions
- **⏰ Follow-up Reminders**: Automated email notifications on follow-up dates
- **🔍 Sortable & Searchable**: Sort and search by any column
- **🏷️ Tag System**:
  - Follow Up
  - Waiting for Response
  - No Action
- **💻 Desktop-Optimized**: Clean interface designed for computer use

## Prerequisites

- [Node.js](https://nodejs.org/) (version 14 or higher)
- npm (comes with Node.js)

## Installation

1. Clone or download this repository

2. Navigate to the project directory:
   ```bash
   cd RobC06
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

## Running the Application

1. Start the server:
   ```bash
   npm start
   ```

2. Open your web browser and navigate to:
   ```
   http://localhost:3000
   ```

3. **First-Time Setup:**
   - On first visit, you'll see a setup page
   - Create a password (minimum 6 characters)
   - This password will be required to access your contacts

4. **Login:**
   - After setup, you'll be asked to login with your password
   - You can logout anytime using the "Logout" button

## Deploying to the Web

Want to access your contacts from anywhere? See **[DEPLOYMENT.md](DEPLOYMENT.md)** for complete instructions on deploying to:
- **Render** (easiest, recommended)
- **Railway**
- **Fly.io**

All platforms offer free tiers suitable for personal use!

## Setting Up Email Notifications

To receive automated follow-up reminders via email:

1. Click the **Settings** button in the top right corner

2. Enable email notifications by checking the checkbox

3. Enter your email address where you want to receive notifications

4. Configure SMTP settings:
   - **For Gmail:**
     - SMTP Host: `smtp.gmail.com`
     - SMTP Port: `587`
     - SMTP Username: Your Gmail address
     - SMTP Password: Use an [App Password](https://support.google.com/accounts/answer/185833) (not your regular Gmail password)
       - Go to Google Account > Security > 2-Step Verification > App passwords
       - Generate a new app password and use it here

   - **For Other Email Providers:**
     - Find your provider's SMTP settings (usually available in their support docs)
     - Common ports: 587 (TLS) or 465 (SSL)

5. Click **Save Settings**

6. The system will check for follow-ups daily at 9:00 AM and send email reminders for any contacts with follow-up dates matching that day

## How to Use

### Adding a Contact

1. Click **Add New Contact** button on the home screen
2. Fill in the contact information:
   - Name (required)
   - Company (optional)
   - Title (optional)
   - Tag (default: No Action)
   - Follow-up Date (optional)
3. Click **Save Contact**

### Viewing and Editing Contact Details

1. Click on any contact row in the table (or click the **View** button)
2. On the detail screen, you can:
   - Edit contact information
   - Change tags
   - Set/update follow-up dates
   - View communication history
   - Add new communications
   - Delete the contact

### Adding Communications

1. Open a contact's detail page
2. Click **Add Communication**
3. Select the type (Email, Phone Call, Meeting, Other)
4. Enter the date
5. Add a description
6. Click **Add Communication**

The "Date of Last Contact" will automatically update based on your most recent communication.

### Sorting Contacts

Click on any column header to sort by that column. Click again to reverse the sort order.

### Searching Contacts

Use the search box at the top to filter contacts by name, company, title, or tag.

### Deleting Contacts

- From the home screen: Click the **Delete** button next to a contact
- From the detail screen: Click the **Delete Contact** button

## Data Storage

All contact data is stored locally in the `data/contacts.json` file. Your data never leaves your computer unless you enable email notifications (which only sends reminder emails, not your contact data).

## Development Mode

For development with auto-restart on file changes:

```bash
npm run dev
```

(Requires nodemon, which is included in devDependencies)

## Security

- **Password Protection**: All access requires password authentication
- **Session Management**: Secure sessions with 24-hour expiration
- **Password Hashing**: Passwords are hashed using bcrypt (never stored in plain text)
- **Data Privacy**: All data stored locally or on your chosen hosting platform
- **No Third-Party Access**: Your contact data never leaves your control

**Security Tips:**
- Use a strong password (12+ characters recommended)
- Change your password regularly
- Logout when using shared computers
- Keep regular backups of your data

## Troubleshooting

### Can't login / Forgot password

If you're running locally:
- Stop the server
- Delete `data/config.json`
- Restart the server - you'll see the setup page again
- Create a new password

If deployed: Access your hosting platform's file system or redeploy

### Email notifications not working

- Verify your SMTP settings are correct
- For Gmail, ensure you're using an App Password, not your regular password
- Check that 2-Step Verification is enabled on your Google account
- Verify your firewall allows outbound connections on port 587

### Cannot connect to the application

- Ensure the server is running (`npm start`)
- Check that port 3000 is not being used by another application
- Try accessing `http://127.0.0.1:3000` instead of `localhost`

### Lost data

- Check the `data/contacts.json` file - your contacts are stored there
- Make regular backups of the `data` folder
- When deploying, ensure persistent storage is configured

## Tech Stack

- **Backend**: Node.js with Express
- **Authentication**: express-session, bcryptjs
- **Frontend**: HTML, CSS, vanilla JavaScript
- **Data Storage**: JSON file
- **Email**: Nodemailer with node-cron for scheduling
- **Security**: Password hashing, secure sessions, HTTPS ready

## License

MIT

## Support

For issues or questions, please open an issue on the GitHub repository.
