# Email Notification Setup

This document describes the email notification feature for driver load assignments.

## Overview

When a driver is assigned to a load, an automated email notification is sent to the driver with load details including:
- Load ID and customer information
- Pickup and dropoff locations
- Vehicle assignment
- Scheduled date/time

## Environment Variables Required

Add the following SMTP credentials to your `.env` file:

```env
# SMTP Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### Common SMTP Providers:

#### Gmail
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-specific-password
```
**Note:** For Gmail, you need to generate an "App Password" from your Google Account settings.

#### Outlook/Hotmail
```env
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@outlook.com
SMTP_PASS=your-password
```

#### SendGrid
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
```

#### Custom SMTP Server
```env
SMTP_HOST=mail.yourdomain.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your-password
```

## When Emails Are Sent

Emails are automatically sent to drivers when:
1. **Creating a new load** with a driver assigned
2. **Updating a load** to assign a driver (if driver wasn't previously assigned)
3. **Explicitly assigning** a driver and truck via the `assignDriverTruck` endpoint

## Testing Email Configuration

You can test your SMTP configuration by calling the `testEmailConnection` function:

```javascript
import { testEmailConnection } from './services/emailService.js';

const result = await testEmailConnection();
console.log(result);
```

## Email Template

The email includes:
- Professional HTML design with responsive layout
- Load assignment details in an organized format
- Pickup and dropoff locations clearly displayed
- Customer and vehicle information
- Scheduled date/time

## Error Handling

- Email sending failures do **not** prevent load assignment
- All email errors are logged to the console for debugging
- If a driver doesn't have an email address, the notification is skipped with a warning

## Troubleshooting

### Email Not Sending
1. Check SMTP credentials in `.env` file
2. Verify SMTP server allows connections from your server IP
3. For Gmail, ensure you're using an App Password (not your regular password)
4. Check firewall/network settings

### Email Going to Spam
- Ensure your SMTP server is properly configured
- Consider using a dedicated email service (SendGrid, Mailgun, etc.)
- Add SPF/DKIM records to your domain

### Common Errors
- **ECONNREFUSED**: SMTP server unreachable or wrong host/port
- **Invalid login**: Wrong username/password
- **Authentication failed**: Check SMTP credentials


