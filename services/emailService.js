import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Create reusable transporter using SMTP credentials from environment
const createTransporter = () => {
  // Debug SMTP configuration
  const smtpConfig = {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS ? '***' : undefined, // Hide password in logs
    },
  };

  console.log('📧 [SMTP DEBUG] SMTP Configuration:', {
    host: smtpConfig.host || 'NOT SET',
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    user: smtpConfig.auth.user || 'NOT SET',
    hasPassword: !!process.env.SMTP_PASS,
    allConfigPresent: !!(smtpConfig.host && smtpConfig.auth.user && process.env.SMTP_PASS)
  });

  // Check if SMTP is properly configured
  if (!smtpConfig.host || !smtpConfig.auth.user || !process.env.SMTP_PASS) {
    console.error('❌ [SMTP DEBUG] SMTP configuration is incomplete:', {
      missingHost: !smtpConfig.host,
      missingUser: !smtpConfig.auth.user,
      missingPassword: !process.env.SMTP_PASS
    });
  }

  return nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: {
      user: smtpConfig.auth.user,
      pass: process.env.SMTP_PASS,
    },
    debug: true, // Enable debug mode
    logger: true // Enable logging
  });
};

/**
 * Send email notification to driver when assigned to a load
 * @param {Object} options - Email options
 * @param {String} options.driverEmail - Driver's email address
 * @param {String} options.driverName - Driver's name
 * @param {String} options.loadId - Load ID
 * @param {String} options.loadInternalId - Load internal ID (optional)
 * @param {Object} options.loadDetails - Load details (pickup, dropoff, customer, etc.)
 * @returns {Promise<Object>} Email sending result
 */
export const sendLoadAssignmentEmail = async ({
  driverEmail,
  driverName,
  loadId,
  loadInternalId,
  loadDetails = {},
}) => {
  try {
    console.log('📧 [EMAIL DEBUG] Starting email send process:', {
      driverEmail,
      driverName,
      loadId,
      loadInternalId,
      timestamp: new Date().toISOString()
    });

    // Validate email
    if (!driverEmail) {
      console.warn('⚠️ [EMAIL DEBUG] No driver email provided, skipping email notification');
      return { success: false, message: 'No driver email provided' };
    }

    // Validate SMTP configuration before creating transporter
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.error('❌ [EMAIL DEBUG] SMTP configuration missing:', {
        hasHost: !!process.env.SMTP_HOST,
        hasUser: !!process.env.SMTP_USER,
        hasPass: !!process.env.SMTP_PASS
      });
      return {
        success: false,
        message: 'SMTP configuration is incomplete. Please check SMTP_HOST, SMTP_USER, and SMTP_PASS environment variables.',
        error: 'SMTP_NOT_CONFIGURED'
      };
    }

    // Create transporter
    console.log('📧 [EMAIL DEBUG] Creating SMTP transporter...');
    const transporter = createTransporter();

    // Verify SMTP connection
    try {
      console.log('📧 [EMAIL DEBUG] Verifying SMTP connection...');
      await transporter.verify();
      console.log('✅ [EMAIL DEBUG] SMTP server connection verified successfully');
    } catch (verifyError) {
      console.error('❌ [EMAIL DEBUG] SMTP connection verification failed:', {
        error: verifyError.message,
        code: verifyError.code,
        command: verifyError.command
      });
      return {
        success: false,
        message: `SMTP connection failed: ${verifyError.message}`,
        error: verifyError.message
      };
    }

    // Extract load information
    const pickupAddress = loadDetails.pickupAddress || 
                         loadDetails.route?.selectPickup?.place || 
                         loadDetails.route?.selectPickup?.address || 
                         'Not specified';
    const dropoffAddress = loadDetails.dropoffAddress || 
                          loadDetails.route?.selectDropOff?.place || 
                          loadDetails.route?.selectDropOff?.address || 
                          'Not specified';
    const customerName = loadDetails.customerName || 
                        loadDetails.customer?.name || 
                        'Customer';
    const vehiclePlate = loadDetails.vehiclePlate || 
                        loadDetails.vehicle?.plateNumber || 
                        'Not assigned';
    const planDate = loadDetails.assignedAt 
      ? new Date(loadDetails.assignedAt).toLocaleString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      : 'As soon as possible';

    // Email content
    const subject = `🚚 New Load Assignment - ${loadInternalId || loadId}`;
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Load Assignment Notification</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f4f4f4;
          }
          .container {
            background-color: #ffffff;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 8px 8px 0 0;
            margin: -30px -30px 30px -30px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
          }
          .content {
            margin-bottom: 20px;
          }
          .info-box {
            background-color: #f8f9fa;
            border-left: 4px solid #667eea;
            padding: 15px;
            margin: 15px 0;
            border-radius: 4px;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e9ecef;
          }
          .info-row:last-child {
            border-bottom: none;
          }
          .info-label {
            font-weight: bold;
            color: #495057;
          }
          .info-value {
            color: #212529;
          }
          .button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #667eea;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin-top: 20px;
            text-align: center;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e9ecef;
            text-align: center;
            color: #6c757d;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚚 New Load Assignment</h1>
          </div>
          
          <div class="content">
            <p>Hello <strong>${driverName}</strong>,</p>
            
            <p>You have been assigned a new load. Please review the details below:</p>
            
            <div class="info-box">
              <div class="info-row">
                <span class="info-label">Load ID:</span>
                <span class="info-value">${loadInternalId || loadId}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Customer:</span>
                <span class="info-value">${customerName}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Vehicle:</span>
                <span class="info-value">${vehiclePlate}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Scheduled Date:</span>
                <span class="info-value">${planDate}</span>
              </div>
            </div>
            
            <div class="info-box">
              <div class="info-row">
                <span class="info-label">📍 Pickup Location:</span>
                <span class="info-value"></span>
              </div>
              <p style="margin: 10px 0; padding-left: 15px;">${pickupAddress}</p>
            </div>
            
            <div class="info-box">
              <div class="info-row">
                <span class="info-label">📍 Dropoff Location:</span>
                <span class="info-value"></span>
              </div>
              <p style="margin: 10px 0; padding-left: 15px;">${dropoffAddress}</p>
            </div>
            
            <p style="margin-top: 20px;">
              <strong>Please prepare for this assignment and ensure you're ready at the scheduled time.</strong>
            </p>
            
            <p>If you have any questions or concerns, please contact your dispatcher.</p>
          </div>
          
          <div class="footer">
            <p>This is an automated notification from the Fleet Management System.</p>
            <p>&copy; ${new Date().getFullYear()} All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
New Load Assignment

Hello ${driverName},

You have been assigned a new load. Please review the details below:

Load ID: ${loadInternalId || loadId}
Customer: ${customerName}
Vehicle: ${vehiclePlate}
Scheduled Date: ${planDate}

Pickup Location:
${pickupAddress}

Dropoff Location:
${dropoffAddress}

Please prepare for this assignment and ensure you're ready at the scheduled time.

If you have any questions or concerns, please contact your dispatcher.

---
This is an automated notification from the Fleet Management System.
    `;

    // Send email
    const mailOptions = {
      from: `"Fleet Management System" <${process.env.SMTP_USER}>`,
      to: driverEmail,
      subject: subject,
      text: textContent,
      html: htmlContent,
    };

    console.log('📧 [EMAIL DEBUG] Sending email with options:', {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject,
      hasText: !!mailOptions.text,
      hasHtml: !!mailOptions.html
    });

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ [EMAIL DEBUG] Load assignment email sent successfully:', {
      to: driverEmail,
      messageId: info.messageId,
      response: info.response,
      accepted: info.accepted,
      rejected: info.rejected,
      loadId: loadId,
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      messageId: info.messageId,
      message: 'Email sent successfully',
      response: info.response
    };
  } catch (error) {
    console.error('❌ [EMAIL DEBUG] Error sending load assignment email:', {
      error: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    return {
      success: false,
      error: error.message,
      code: error.code,
      message: 'Failed to send email notification',
      details: error.response || error.command
    };
  }
};

/**
 * Send trip cancellation email to driver when they are replaced
 * @param {Object} options - Email options
 * @param {String} options.driverEmail - Driver's email address
 * @param {String} options.driverName - Driver's name
 * @param {String} options.orderId - Order ID
 * @param {String} options.orderNumber - Order number (customer order no)
 * @param {Object} options.orderDetails - Order details (pickup, dropoff, customer, etc.)
 * @returns {Promise<Object>} Email sending result
 */
export const sendLoadCancellationEmail = async ({
  driverEmail,
  driverName,
  orderId,
  orderNumber,
  orderDetails = {},
}) => {
  try {
    console.log('📧 [EMAIL DEBUG] Starting cancellation email send process:', {
      driverEmail,
      driverName,
      orderId,
      orderNumber,
      timestamp: new Date().toISOString()
    });

    // Validate email
    if (!driverEmail) {
      console.warn('⚠️ [EMAIL DEBUG] No driver email provided, skipping cancellation email notification');
      return { success: false, message: 'No driver email provided' };
    }

    // Validate SMTP configuration
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.error('❌ [EMAIL DEBUG] SMTP configuration missing for cancellation email');
      return {
        success: false,
        message: 'SMTP configuration is incomplete',
        error: 'SMTP_NOT_CONFIGURED'
      };
    }

    // Create transporter
    console.log('📧 [EMAIL DEBUG] Creating SMTP transporter for cancellation email...');
    const transporter = createTransporter();

    // Verify SMTP connection
    try {
      await transporter.verify();
      console.log('✅ [EMAIL DEBUG] SMTP server connection verified for cancellation email');
    } catch (verifyError) {
      console.error('❌ [EMAIL DEBUG] SMTP connection verification failed for cancellation email:', verifyError.message);
      return {
        success: false,
        message: `SMTP connection failed: ${verifyError.message}`,
        error: verifyError.message
      };
    }

    // Extract order information
    const pickupAddress = orderDetails.pickupAddress || 
                         orderDetails.pickupLocation?.place || 
                         'Not specified';
    const dropoffAddress = orderDetails.dropoffAddress || 
                          orderDetails.deliveryLocation?.place || 
                          'Not specified';
    const customerName = orderDetails.customerName || 
                        orderDetails.customer?.name || 
                        'Customer';
    const vehiclePlate = orderDetails.vehiclePlate || 
                        orderDetails.truck?.plateNumber || 
                        'Not assigned';

    // Email content
    const subject = `🚫 Trip Assignment Cancelled - ${orderNumber || orderId}`;
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Trip Cancellation Notification</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f4f4f4;
          }
          .container {
            background-color: #ffffff;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header {
            background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
            color: white;
            padding: 20px;
            border-radius: 8px 8px 0 0;
            margin: -30px -30px 30px -30px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
          }
          .content {
            margin-bottom: 20px;
          }
          .warning-box {
            background-color: #fef2f2;
            border-left: 4px solid #dc2626;
            padding: 15px;
            margin: 15px 0;
            border-radius: 4px;
          }
          .info-box {
            background-color: #f8f9fa;
            border-left: 4px solid #6b7280;
            padding: 15px;
            margin: 15px 0;
            border-radius: 4px;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e9ecef;
          }
          .info-row:last-child {
            border-bottom: none;
          }
          .info-label {
            font-weight: bold;
            color: #495057;
          }
          .info-value {
            color: #212529;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e9ecef;
            text-align: center;
            color: #6c757d;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚫 Trip Assignment Cancelled</h1>
          </div>
          
          <div class="content">
            <p>Hello <strong>${driverName}</strong>,</p>
            
            <div class="warning-box">
              <p style="margin: 0; font-weight: bold; color: #991b1b;">
                ⚠️ Your trip assignment has been cancelled.
              </p>
            </div>
            
            <p>We regret to inform you that your assignment for the following trip has been cancelled:</p>
            
            <div class="info-box">
              <div class="info-row">
                <span class="info-label">Order Number:</span>
                <span class="info-value">${orderNumber || orderId}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Customer:</span>
                <span class="info-value">${customerName}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Vehicle:</span>
                <span class="info-value">${vehiclePlate}</span>
              </div>
            </div>
            
            <div class="info-box">
              <div class="info-row">
                <span class="info-label">📍 Pickup Location:</span>
                <span class="info-value"></span>
              </div>
              <p style="margin: 10px 0; padding-left: 15px;">${pickupAddress}</p>
            </div>
            
            <div class="info-box">
              <div class="info-row">
                <span class="info-label">📍 Dropoff Location:</span>
                <span class="info-value"></span>
              </div>
              <p style="margin: 10px 0; padding-left: 15px;">${dropoffAddress}</p>
            </div>
            
            <p style="margin-top: 20px;">
              <strong>Please note that you are no longer assigned to this trip.</strong>
            </p>
            
            <p>If you have any questions or concerns about this cancellation, please contact your dispatcher.</p>
          </div>
          
          <div class="footer">
            <p>This is an automated notification from the Fleet Management System.</p>
            <p>&copy; ${new Date().getFullYear()} All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
Trip Assignment Cancelled

Hello ${driverName},

⚠️ Your trip assignment has been cancelled.

We regret to inform you that your assignment for the following trip has been cancelled:

Order Number: ${orderNumber || orderId}
Customer: ${customerName}
Vehicle: ${vehiclePlate}

Pickup Location:
${pickupAddress}

Dropoff Location:
${dropoffAddress}

Please note that you are no longer assigned to this trip.

If you have any questions or concerns about this cancellation, please contact your dispatcher.

---
This is an automated notification from the Fleet Management System.
    `;

    // Send email
    const mailOptions = {
      from: `"Fleet Management System" <${process.env.SMTP_USER}>`,
      to: driverEmail,
      subject: subject,
      text: textContent,
      html: htmlContent,
    };

    console.log('📧 [EMAIL DEBUG] Sending cancellation email with options:', {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject
    });

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ [EMAIL DEBUG] Trip cancellation email sent successfully:', {
      to: driverEmail,
      messageId: info.messageId,
      response: info.response,
      accepted: info.accepted,
      rejected: info.rejected,
      orderId: orderId,
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      messageId: info.messageId,
      message: 'Cancellation email sent successfully',
      response: info.response
    };
  } catch (error) {
    console.error('❌ [EMAIL DEBUG] Error sending trip cancellation email:', {
      error: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode,
      timestamp: new Date().toISOString()
    });
    return {
      success: false,
      error: error.message,
      code: error.code,
      message: 'Failed to send cancellation email notification',
      details: error.response || error.command
    };
  }
};

/**
 * Send email notification when trial period starts
 * @param {Object} options - Email options
 * @param {String} options.adminEmail - Admin's email address
 * @param {String} options.adminName - Admin's name
 * @param {Date} options.trialStartDate - Trial start date
 * @param {Date} options.trialEndDate - Trial end date
 * @returns {Promise<Object>} Email sending result
 */
export const sendTrialStartEmail = async ({
  adminEmail,
  adminName,
  trialStartDate,
  trialEndDate,
}) => {
  try {
    if (!adminEmail) {
      console.warn('⚠️ No admin email provided, skipping trial start email');
      return { success: false, message: 'No admin email provided' };
    }

    const transporter = createTransporter();
    
    const trialStartFormatted = trialStartDate 
      ? new Date(trialStartDate).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      : 'Today';
    
    const trialEndFormatted = trialEndDate 
      ? new Date(trialEndDate).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      : '1 month from now';

    const daysRemaining = trialEndDate
      ? Math.ceil((new Date(trialEndDate) - new Date()) / (1000 * 60 * 60 * 24))
      : 30;

    const trialLengthDays = (trialStartDate && trialEndDate)
      ? Math.round((new Date(trialEndDate) - new Date(trialStartDate)) / (1000 * 60 * 60 * 24))
      : daysRemaining;

    const subject = `🎉 Your ${trialLengthDays}-Day Free Trial Has Started!`;
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Trial Started</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f4f4f4;
          }
          .container {
            background-color: #ffffff;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            padding: 20px;
            border-radius: 8px 8px 0 0;
            margin: -30px -30px 30px -30px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
          }
          .content {
            margin-bottom: 20px;
          }
          .info-box {
            background-color: #f0fdf4;
            border-left: 4px solid #10b981;
            padding: 15px;
            margin: 15px 0;
            border-radius: 4px;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #d1fae5;
          }
          .info-row:last-child {
            border-bottom: none;
          }
          .info-label {
            font-weight: bold;
            color: #065f46;
          }
          .info-value {
            color: #047857;
          }
          .button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #10b981;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin-top: 20px;
            text-align: center;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e9ecef;
            text-align: center;
            color: #6c757d;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Your Free Trial Has Started!</h1>
          </div>
          
          <div class="content">
            <p>Hello <strong>${adminName}</strong>,</p>
            
            <p>Congratulations! Your ${trialLengthDays}-day free trial period has officially started. You now have full access to all features of our platform.</p>
            
            <div class="info-box">
              <div class="info-row">
                <span class="info-label">Trial Start Date:</span>
                <span class="info-value">${trialStartFormatted}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Trial End Date:</span>
                <span class="info-value">${trialEndFormatted}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Days Remaining:</span>
                <span class="info-value"><strong>${daysRemaining} days</strong></span>
              </div>
            </div>
            
            <p><strong>What's Next?</strong></p>
            <ul>
              <li>Explore all features and capabilities of the platform</li>
              <li>Set up your account and customize your settings</li>
              <li>Add your team members and start managing your operations</li>
              <li>Subscribe to a plan before your trial expires to continue using the service</li>
            </ul>
            
            <p style="margin-top: 20px;">
              <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/admin/subscription" class="button">
                View Subscription Plans
              </a>
            </p>
            
            <p style="margin-top: 20px; color: #dc2626; font-weight: bold;">
              ⚠️ Important: Your trial will expire on ${trialEndFormatted}. Make sure to subscribe before then to avoid service interruption.
            </p>
          </div>
          
          <div class="footer">
            <p>This is an automated notification from the Logistics Platform.</p>
            <p>&copy; ${new Date().getFullYear()} All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
Your Free Trial Has Started!

Hello ${adminName},

Congratulations! Your ${trialLengthDays}-day free trial period has officially started. You now have full access to all features of our platform.

Trial Start Date: ${trialStartFormatted}
Trial End Date: ${trialEndFormatted}
Days Remaining: ${daysRemaining} days

What's Next?
- Explore all features and capabilities of the platform
- Set up your account and customize your settings
- Add your team members and start managing your operations
- Subscribe to a plan before your trial expires to continue using the service

View Subscription Plans: ${process.env.CLIENT_URL || 'http://localhost:5173'}/admin/subscription

⚠️ Important: Your trial will expire on ${trialEndFormatted}. Make sure to subscribe before then to avoid service interruption.

---
This is an automated notification from the Logistics Platform.
© ${new Date().getFullYear()} All rights reserved.
    `;

    const mailOptions = {
      from: `"Logistics Platform" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: adminEmail,
      subject: subject,
      text: textContent,
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Trial start email sent successfully:', {
      to: adminEmail,
      messageId: info.messageId,
    });

    return {
      success: true,
      messageId: info.messageId,
      message: 'Trial start email sent successfully'
    };
  } catch (error) {
    console.error('❌ Error sending trial start email:', error);
    return {
      success: false,
      error: error.message,
      message: 'Failed to send trial start email'
    };
  }
};

/**
 * Send email notification when trial period expires
 * @param {Object} options - Email options
 * @param {String} options.adminEmail - Admin's email address
 * @param {String} options.adminName - Admin's name
 * @param {Date} options.trialEndDate - Trial end date
 * @returns {Promise<Object>} Email sending result
 */
export const sendTrialExpiredEmail = async ({
  adminEmail,
  adminName,
  trialEndDate,
}) => {
  try {
    if (!adminEmail) {
      console.warn('⚠️ No admin email provided, skipping trial expired email');
      return { success: false, message: 'No admin email provided' };
    }

    const transporter = createTransporter();
    
    const trialEndFormatted = trialEndDate 
      ? new Date(trialEndDate).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      : 'Today';

    const subject = `⏰ Your Free Trial Has Expired - Subscribe Now!`;
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Trial Expired</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f4f4f4;
          }
          .container {
            background-color: #ffffff;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header {
            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
            color: white;
            padding: 20px;
            border-radius: 8px 8px 0 0;
            margin: -30px -30px 30px -30px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
          }
          .content {
            margin-bottom: 20px;
          }
          .warning-box {
            background-color: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 15px;
            margin: 15px 0;
            border-radius: 4px;
          }
          .button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #f59e0b;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin-top: 20px;
            text-align: center;
            font-weight: bold;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e9ecef;
            text-align: center;
            color: #6c757d;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⏰ Your Free Trial Has Expired</h1>
          </div>
          
          <div class="content">
            <p>Hello <strong>${adminName}</strong>,</p>
            
            <p>Your free trial period has expired on <strong>${trialEndFormatted}</strong>.</p>
            
            <div class="warning-box">
              <p style="margin: 0; font-weight: bold; color: #92400e;">
                ⚠️ Your access to the platform has been restricted. To continue using all features, please subscribe to a plan.
              </p>
            </div>
            
            <p><strong>What Happens Now?</strong></p>
            <ul>
              <li>Your account is still active, but access to premium features is limited</li>
              <li>You need to subscribe to a plan to regain full access</li>
              <li>Choose from our flexible subscription plans that suit your needs</li>
              <li>Your data and settings are safe and will be restored once you subscribe</li>
            </ul>
            
            <p style="margin-top: 20px; text-align: center;">
              <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/admin/subscription" class="button">
                Subscribe Now - Choose Your Plan
              </a>
            </p>
            
            <p style="margin-top: 20px;">
              If you have any questions or need assistance choosing the right plan, please don't hesitate to contact our support team.
            </p>
          </div>
          
          <div class="footer">
            <p>This is an automated notification from the Logistics Platform.</p>
            <p>&copy; ${new Date().getFullYear()} All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
Your Free Trial Has Expired

Hello ${adminName},

Your free trial period has expired on ${trialEndFormatted}.

⚠️ Your access to the platform has been restricted. To continue using all features, please subscribe to a plan.

What Happens Now?
- Your account is still active, but access to premium features is limited
- You need to subscribe to a plan to regain full access
- Choose from our flexible subscription plans that suit your needs
- Your data and settings are safe and will be restored once you subscribe

Subscribe Now: ${process.env.CLIENT_URL || 'http://localhost:5173'}/admin/subscription

If you have any questions or need assistance choosing the right plan, please don't hesitate to contact our support team.

---
This is an automated notification from the Logistics Platform.
© ${new Date().getFullYear()} All rights reserved.
    `;

    const mailOptions = {
      from: `"Logistics Platform" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: adminEmail,
      subject: subject,
      text: textContent,
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Trial expired email sent successfully:', {
      to: adminEmail,
      messageId: info.messageId,
    });

    return {
      success: true,
      messageId: info.messageId,
      message: 'Trial expired email sent successfully'
    };
  } catch (error) {
    console.error('❌ Error sending trial expired email:', error);
    return {
      success: false,
      error: error.message,
      message: 'Failed to send trial expired email'
    };
  }
};

/**
 * Send invoice email to customer
 * @param {Object} options - Email options
 * @param {String} options.customerEmail - Customer's email address
 * @param {String} options.customerName - Customer's name
 * @param {String} options.invoiceId - Invoice ID
 * @param {String} options.invoiceNumber - Invoice number
 * @param {String} options.amount - Invoice amount
 * @param {String} options.currency - Currency code
 * @param {Date} options.dueDate - Invoice due date
 * @param {String} options.paymentTerms - Payment terms (e.g., "Net 30")
 * @param {String} options.invoiceUrl - Invoice URL for payment
 * @param {Boolean} options.includePaymentLink - If false, omits "View & Pay Invoice" button and link (default: true)
 * @param {Object} options.tripData - Optional trip data to include in email
 * @param {Object} options.companyData - Optional company data to include in email
 * @param {Object} options.invoiceDetails - Optional full price breakdown (items, labour, subtotal, tax, total)
 * @returns {Promise<Object>} Email sending result
 */
export const sendInvoiceEmail = async ({
  customerEmail,
  customerName,
  invoiceId,
  invoiceNumber,
  amount,
  currency,
  dueDate,
  paymentTerms = null,
  invoiceUrl,
  includePaymentLink = true,
  tripData = null,
  companyData = null,
  invoiceDetails = null,
  pdfBase64 = null,
  pdfFileName = null,
}) => {
  try {
    if (!customerEmail) {
      console.warn('⚠️ No customer email provided, skipping invoice email');
      return { success: false, message: 'No customer email provided' };
    }

    // Validate SMTP configuration
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.error('❌ SMTP configuration is missing. Please set SMTP_HOST, SMTP_USER, and SMTP_PASS environment variables.');
      return {
        success: false,
        error: 'SMTP configuration is missing',
        message: 'Email service is not configured. Please check SMTP settings.'
      };
    }

    const transporter = createTransporter();
    
    const dueDateFormatted = dueDate 
      ? new Date(dueDate).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      : 'N/A';

    // Format trip information if available
    let tripInfoHTML = '';
    if (tripData) {
      const tripDetails = [];
      if (tripData.tripNumber) tripDetails.push(`<div class="info-row"><span class="info-label">Trip Number:</span><span class="info-value">${tripData.tripNumber}</span></div>`);
      if (tripData.truck) {
        const vehicleInfo = [
          tripData.truck.licensePlate || tripData.truck.plateNumber,
          tripData.truck.makeModel,
          tripData.truck.unitType ? `(${tripData.truck.unitType})` : ''
        ].filter(Boolean).join(' ');
        if (vehicleInfo) tripDetails.push(`<div class="info-row"><span class="info-label">Truck:</span><span class="info-value">${vehicleInfo}</span></div>`);
      }
      if (tripData.trailer) {
        const trailerTypeMap = {
          'dry_van': 'Dry Van',
          'refrigerated': 'Reefer',
          'flatbed': 'Flatbed',
          'tanker': 'Tanker',
          'container': 'Container'
        };
        const trailerType = tripData.trailer.type ? (trailerTypeMap[tripData.trailer.type] || tripData.trailer.type) : '';
        const trailerInfo = [
          tripData.trailer.licensePlate || tripData.trailer.plateNumber,
          trailerType,
          tripData.trailer.capacity ? `(${tripData.trailer.capacity})` : ''
        ].filter(Boolean).join(' ');
        if (trailerInfo) tripDetails.push(`<div class="info-row"><span class="info-label">Trailer:</span><span class="info-value">${trailerInfo}</span></div>`);
      }
      if (tripData.startLocation?.place) tripDetails.push(`<div class="info-row"><span class="info-label">Origin:</span><span class="info-value">${tripData.startLocation.place}</span></div>`);
      if (tripData.endLocation?.place) tripDetails.push(`<div class="info-row"><span class="info-label">Destination:</span><span class="info-value">${tripData.endLocation.place}</span></div>`);
      if (tripData.route?.totalDistance) {
        const distanceKm = tripData.route.totalDistance.toFixed(2);
        const distanceMiles = (tripData.route.totalDistance * 0.621371).toFixed(2);
        tripDetails.push(`<div class="info-row"><span class="info-label">Miles Covered:</span><span class="info-value">${distanceMiles} miles (${distanceKm} km)</span></div>`);
      }
      
      // Load Details
      if (tripData.orders && tripData.orders.length > 0) {
        let totalWeight = 0;
        const weightUnits = [];
        const commodities = [];
        const orderTypes = [];
        const equipmentList = [];
        let hasTemperature = false;
        let temperatureValue = null;
        const specialFlags = [];
        
        tripData.orders.forEach((order) => {
          if (order.weight) {
            totalWeight += order.weight;
            if (order.weightUnit && !weightUnits.includes(order.weightUnit)) {
              weightUnits.push(order.weightUnit);
            }
          }
          if (order.commodity && !commodities.includes(order.commodity)) {
            commodities.push(order.commodity);
          }
          if (order.orderType && !orderTypes.includes(order.orderType)) {
            orderTypes.push(order.orderType);
          }
          if (order.equipment && Array.isArray(order.equipment)) {
            order.equipment.forEach((eq) => {
              if (!equipmentList.includes(eq)) {
                equipmentList.push(eq);
              }
            });
          }
          if (order.temperature !== null && order.temperature !== undefined) {
            hasTemperature = true;
            temperatureValue = order.temperature;
          }
          if (order.additionalInfo) {
            if (order.additionalInfo.HAZMAT) specialFlags.push('HAZMAT');
            if (order.additionalInfo.TARP) specialFlags.push('TARP');
            if (order.additionalInfo.OverDimension) specialFlags.push('Over Dimension');
            if (order.additionalInfo.CSA) specialFlags.push('CSA');
          }
        });
        
        if (commodities.length > 0) {
          tripDetails.push(`<div class="info-row"><span class="info-label">Product/Load Type:</span><span class="info-value">${commodities.join(', ')}</span></div>`);
        }
        if (orderTypes.length > 0) {
          tripDetails.push(`<div class="info-row"><span class="info-label">Order Type:</span><span class="info-value">${orderTypes.join(', ')}</span></div>`);
        }
        if (totalWeight > 0) {
          const weightUnit = weightUnits.length > 0 ? weightUnits[0] : 'kg';
          tripDetails.push(`<div class="info-row"><span class="info-label">Total Load Weight:</span><span class="info-value">${totalWeight.toFixed(2)} ${weightUnit}</span></div>`);
        }
        if (equipmentList.length > 0) {
          tripDetails.push(`<div class="info-row"><span class="info-label">Equipment:</span><span class="info-value">${equipmentList.join(', ')}</span></div>`);
        }
        if (hasTemperature && temperatureValue !== null) {
          tripDetails.push(`<div class="info-row"><span class="info-label">Temperature:</span><span class="info-value">${temperatureValue}°C</span></div>`);
        }
        if (specialFlags.length > 0) {
          tripDetails.push(`<div class="info-row"><span class="info-label">Special Requirements:</span><span class="info-value">${specialFlags.join(', ')}</span></div>`);
        }
      }
      
      if (tripData.actualStartDate) {
        const startDate = new Date(tripData.actualStartDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        tripDetails.push(`<div class="info-row"><span class="info-label">Start Date:</span><span class="info-value">${startDate}</span></div>`);
      }
      if (tripData.actualEndDate) {
        const endDate = new Date(tripData.actualEndDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        tripDetails.push(`<div class="info-row"><span class="info-label">End Date:</span><span class="info-value">${endDate}</span></div>`);
      }
      
      if (tripDetails.length > 0) {
        tripInfoHTML = `
            <div class="info-box" style="margin-top: 20px;">
              <h3 style="margin-top: 0; margin-bottom: 10px; color: #667eea; font-size: 16px;">Trip & Load Information</h3>
              ${tripDetails.join('')}
            </div>
        `;
      }
    }

    const subject = `📄 Invoice ${invoiceNumber} - Payment Required`;
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invoice Notification</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f4f4f4;
          }
          .container {
            background-color: #ffffff;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 8px 8px 0 0;
            margin: -30px -30px 30px -30px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
          }
          .content {
            margin-bottom: 20px;
          }
          .info-box {
            background-color: #f8f9fa;
            border-left: 4px solid #667eea;
            padding: 15px;
            margin: 15px 0;
            border-radius: 4px;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e9ecef;
          }
          .info-row:last-child {
            border-bottom: none;
          }
          .info-label {
            font-weight: bold;
            color: #495057;
          }
          .info-value {
            color: #212529;
          }
          .amount-box {
            background-color: #e7f3ff;
            border: 2px solid #667eea;
            padding: 20px;
            margin: 20px 0;
            border-radius: 8px;
            text-align: center;
          }
          .amount {
            font-size: 32px;
            font-weight: bold;
            color: #667eea;
            margin: 10px 0;
          }
          .button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #667eea;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin-top: 20px;
            text-align: center;
            font-weight: bold;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e9ecef;
            text-align: center;
            color: #6c757d;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📄 Invoice ${invoiceNumber}</h1>
          </div>
          
          <div class="content">
            <p>Hello <strong>${customerName}</strong>,</p>
            
            <p>A new invoice has been generated for your account. Please review the details below:</p>
            
            ${companyData ? `
            <div class="info-box" style="margin-bottom: 20px;">
              <h3 style="margin-top: 0; margin-bottom: 10px; color: #667eea; font-size: 16px;">From</h3>
              <div style="margin-bottom: 5px;"><strong>${companyData.companyName || 'Company'}</strong></div>
              ${companyData.address ? `<div style="margin-bottom: 5px;">${companyData.address}</div>` : ''}
              ${companyData.contactPhone ? `<div style="margin-bottom: 5px;">Phone: ${companyData.contactPhone}</div>` : ''}
              ${companyData.contactEmail ? `<div style="margin-bottom: 5px;">Email: ${companyData.contactEmail}</div>` : ''}
              ${companyData.taxNumber ? `<div style="margin-bottom: 5px;">Tax #: ${companyData.taxNumber}</div>` : ''}
            </div>
            ` : ''}
            
            <div class="info-box">
              <div class="info-row">
                <span class="info-label">Invoice Number:</span>
                <span class="info-value">${invoiceNumber}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Due Date:</span>
                <span class="info-value">${dueDateFormatted}</span>
              </div>
              ${paymentTerms ? `<div class="info-row"><span class="info-label">Payment Terms:</span><span class="info-value">${paymentTerms}</span></div>` : ''}
            </div>
            
            ${tripInfoHTML}
            
            ${invoiceDetails ? (() => {
              const items = invoiceDetails.items || [];
              const itemsSubtotal = Number(invoiceDetails.itemsSubtotal) || 0;
              const labourHours = Number(invoiceDetails.labourHours) || 0;
              const labourRate = Number(invoiceDetails.labourRate) || 0;
              const labourAmount = Number(invoiceDetails.labourAmount) || 0;
              const labourTaxName = invoiceDetails.labourTaxName || '';
              const labourTaxPercent = Number(invoiceDetails.labourTaxPercent) || 0;
              const subtotal = Number(invoiceDetails.subtotal) || 0;
              const taxAmount = Number(invoiceDetails.taxAmount) || 0;
              const total = Number(invoiceDetails.total) || parseFloat(amount);
              const currencySym = currency === 'CAD' ? '$' : (currency === 'USD' ? '$' : currency + ' ');
              
              let rows = '';
              if (items.length > 0) {
                rows += '<tr><td colspan="4" style="padding: 8px 0 4px 0; font-weight: bold; color: #495057;">Line Items</td></tr>';
                items.forEach((item) => {
                  const desc = (item.description || '—').toString();
                  const qty = Number(item.quantity) || 1;
                  const rate = Number(item.unitPrice) || 0;
                  const amt = Number(item.totalPrice) || (qty * rate);
                  rows += `<tr><td style="padding: 6px 0; border-bottom: 1px solid #e9ecef;">${desc}</td><td style="text-align: center;">${qty}</td><td style="text-align: right;">${currencySym}${rate.toFixed(2)}</td><td style="text-align: right;">${currencySym}${amt.toFixed(2)}</td></tr>`;
                });
              }
              if (labourAmount > 0) {
                rows += `<tr><td colspan="4" style="padding: 12px 0 4px 0; font-weight: bold; color: #495057;">Labour Charges</td></tr>`;
                rows += `<tr><td style="padding: 6px 0; border-bottom: 1px solid #e9ecef;">Labour (${labourHours} hrs × ${currencySym}${labourRate.toFixed(2)}/hr)${labourTaxName ? ` (${labourTaxName} ${labourTaxPercent}%)` : ''}</td><td style="text-align: center;">—</td><td style="text-align: right;">—</td><td style="text-align: right;">${currencySym}${labourAmount.toFixed(2)}</td></tr>`;
              }
              
              return `
            <div class="info-box" style="margin: 20px 0;">
              <h3 style="margin-top: 0; margin-bottom: 12px; color: #667eea; font-size: 16px;">Invoice Details</h3>
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <thead>
                  <tr style="border-bottom: 2px solid #667eea;">
                    <th style="text-align: left; padding: 8px 0;">Description</th>
                    <th style="text-align: center; padding: 8px 0; width: 60px;">Qty</th>
                    <th style="text-align: right; padding: 8px 0; width: 80px;">Rate</th>
                    <th style="text-align: right; padding: 8px 0; width: 90px;">Amount</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
              <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #e9ecef;">
                ${itemsSubtotal > 0 && labourAmount > 0 ? `<div class="info-row"><span class="info-label">Items Subtotal</span><span class="info-value">${currencySym}${itemsSubtotal.toFixed(2)}</span></div>` : ''}
                ${labourAmount > 0 ? `<div class="info-row"><span class="info-label">Labour Charges</span><span class="info-value">${currencySym}${labourAmount.toFixed(2)}</span></div>` : ''}
                <div class="info-row"><span class="info-label">Subtotal</span><span class="info-value">${currencySym}${subtotal.toFixed(2)}</span></div>
                <div class="info-row"><span class="info-label">Tax</span><span class="info-value">${currencySym}${taxAmount.toFixed(2)}</span></div>
                <div class="info-row" style="font-weight: bold; font-size: 16px; padding-top: 10px; margin-top: 8px; border-top: 2px solid #667eea;"><span class="info-label">Total Balance Due</span><span class="info-value" style="color: #667eea;">${currencySym}${total.toFixed(2)}</span></div>
              </div>
            </div>
            `;
            })() : `
            <div class="amount-box">
              <div style="color: #6c757d; font-size: 14px; margin-bottom: 5px;">Amount Due</div>
              <div class="amount">${currency} ${parseFloat(amount).toFixed(2)}</div>
            </div>
            `}
            
            ${includePaymentLink ? `
            <p style="margin-top: 20px;">
              <a href="${invoiceUrl}" class="button">
                View & Pay Invoice
              </a>
            </p>
            
            <p style="margin-top: 20px;">
              You can view and pay this invoice by clicking the button above or visiting the following link:
            </p>
            <p style="word-break: break-all; color: #667eea; font-size: 12px;">
              ${invoiceUrl}
            </p>
            ` : ''}
            
            <p style="margin-top: 20px;">
              If you have any questions about this invoice, please don't hesitate to contact us.
            </p>
          </div>
          
          <div class="footer">
            <p>This is an automated notification from the Logistics Platform.</p>
            <p>&copy; ${new Date().getFullYear()} All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Format trip information for text email
    let tripInfoText = '';
    if (tripData) {
      const tripDetails = [];
      if (tripData.tripNumber) tripDetails.push(`Trip Number: ${tripData.tripNumber}`);
      if (tripData.truck) {
        const vehicleInfo = [
          tripData.truck.licensePlate || tripData.truck.plateNumber,
          tripData.truck.makeModel,
          tripData.truck.unitType ? `(${tripData.truck.unitType})` : ''
        ].filter(Boolean).join(' ');
        if (vehicleInfo) tripDetails.push(`Truck: ${vehicleInfo}`);
      }
      if (tripData.trailer) {
        const trailerTypeMap = {
          'dry_van': 'Dry Van',
          'refrigerated': 'Reefer',
          'flatbed': 'Flatbed',
          'tanker': 'Tanker',
          'container': 'Container'
        };
        const trailerType = tripData.trailer.type ? (trailerTypeMap[tripData.trailer.type] || tripData.trailer.type) : '';
        const trailerInfo = [
          tripData.trailer.licensePlate || tripData.trailer.plateNumber,
          trailerType,
          tripData.trailer.capacity ? `(${tripData.trailer.capacity})` : ''
        ].filter(Boolean).join(' ');
        if (trailerInfo) tripDetails.push(`Trailer: ${trailerInfo}`);
      }
      if (tripData.startLocation?.place) tripDetails.push(`Origin: ${tripData.startLocation.place}`);
      if (tripData.endLocation?.place) tripDetails.push(`Destination: ${tripData.endLocation.place}`);
      if (tripData.route?.totalDistance) {
        const distanceKm = tripData.route.totalDistance.toFixed(2);
        const distanceMiles = (tripData.route.totalDistance * 0.621371).toFixed(2);
        tripDetails.push(`Miles Covered: ${distanceMiles} miles (${distanceKm} km)`);
      }
      
      // Load Details
      if (tripData.orders && tripData.orders.length > 0) {
        let totalWeight = 0;
        const weightUnits = [];
        const commodities = [];
        const orderTypes = [];
        const equipmentList = [];
        let hasTemperature = false;
        let temperatureValue = null;
        const specialFlags = [];
        
        tripData.orders.forEach((order) => {
          if (order.weight) {
            totalWeight += order.weight;
            if (order.weightUnit && !weightUnits.includes(order.weightUnit)) {
              weightUnits.push(order.weightUnit);
            }
          }
          if (order.commodity && !commodities.includes(order.commodity)) {
            commodities.push(order.commodity);
          }
          if (order.orderType && !orderTypes.includes(order.orderType)) {
            orderTypes.push(order.orderType);
          }
          if (order.equipment && Array.isArray(order.equipment)) {
            order.equipment.forEach((eq) => {
              if (!equipmentList.includes(eq)) {
                equipmentList.push(eq);
              }
            });
          }
          if (order.temperature !== null && order.temperature !== undefined) {
            hasTemperature = true;
            temperatureValue = order.temperature;
          }
          if (order.additionalInfo) {
            if (order.additionalInfo.HAZMAT) specialFlags.push('HAZMAT');
            if (order.additionalInfo.TARP) specialFlags.push('TARP');
            if (order.additionalInfo.OverDimension) specialFlags.push('Over Dimension');
            if (order.additionalInfo.CSA) specialFlags.push('CSA');
          }
        });
        
        if (commodities.length > 0) {
          tripDetails.push(`Product/Load Type: ${commodities.join(', ')}`);
        }
        if (orderTypes.length > 0) {
          tripDetails.push(`Order Type: ${orderTypes.join(', ')}`);
        }
        if (totalWeight > 0) {
          const weightUnit = weightUnits.length > 0 ? weightUnits[0] : 'kg';
          tripDetails.push(`Total Load Weight: ${totalWeight.toFixed(2)} ${weightUnit}`);
        }
        if (equipmentList.length > 0) {
          tripDetails.push(`Equipment: ${equipmentList.join(', ')}`);
        }
        if (hasTemperature && temperatureValue !== null) {
          tripDetails.push(`Temperature: ${temperatureValue}°C`);
        }
        if (specialFlags.length > 0) {
          tripDetails.push(`Special Requirements: ${specialFlags.join(', ')}`);
        }
      }
      
      if (tripData.actualStartDate) {
        const startDate = new Date(tripData.actualStartDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        tripDetails.push(`Start Date: ${startDate}`);
      }
      if (tripData.actualEndDate) {
        const endDate = new Date(tripData.actualEndDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        tripDetails.push(`End Date: ${endDate}`);
      }
      
      if (tripDetails.length > 0) {
        tripInfoText = `\n\nTrip & Load Information:\n${tripDetails.join('\n')}\n`;
      }
    }

    // Build text version of invoice details if provided
    let invoiceDetailsText = '';
    if (invoiceDetails) {
      const items = invoiceDetails.items || [];
      const itemsSubtotal = Number(invoiceDetails.itemsSubtotal) || 0;
      const labourAmount = Number(invoiceDetails.labourAmount) || 0;
      const subtotal = Number(invoiceDetails.subtotal) || 0;
      const taxAmount = Number(invoiceDetails.taxAmount) || 0;
      const total = Number(invoiceDetails.total) || parseFloat(amount);
      const curr = currency === 'CAD' || currency === 'USD' ? '$' : currency + ' ';
      invoiceDetailsText = '\n\n--- Invoice Details ---\n';
      if (items.length > 0) {
        items.forEach((item) => {
          const desc = (item.description || '—').toString();
          const qty = Number(item.quantity) || 1;
          const rate = Number(item.unitPrice) || 0;
          const amt = Number(item.totalPrice) || (qty * rate);
          invoiceDetailsText += `${desc}\n  Qty: ${qty}  Rate: ${curr}${rate.toFixed(2)}  Amount: ${curr}${amt.toFixed(2)}\n`;
        });
      }
      if (labourAmount > 0) {
        invoiceDetailsText += `Labour Charges: ${curr}${labourAmount.toFixed(2)}\n`;
      }
      if (itemsSubtotal > 0 && labourAmount > 0) {
        invoiceDetailsText += `Items Subtotal: ${curr}${itemsSubtotal.toFixed(2)}\n`;
      }
      invoiceDetailsText += `Subtotal: ${curr}${subtotal.toFixed(2)}\n`;
      invoiceDetailsText += `Tax: ${curr}${taxAmount.toFixed(2)}\n`;
      invoiceDetailsText += `Total Balance Due: ${curr}${total.toFixed(2)}\n`;
    }

    const textContent = `
Invoice ${invoiceNumber}

Hello ${customerName},

A new invoice has been generated for your account. Please review the details below:

${companyData ? `
From:
${companyData.companyName || 'Company'}
${companyData.address || ''}
${companyData.contactPhone ? `Phone: ${companyData.contactPhone}` : ''}
${companyData.contactEmail ? `Email: ${companyData.contactEmail}` : ''}
${companyData.taxNumber ? `Tax #: ${companyData.taxNumber}` : ''}

` : ''}
Invoice Number: ${invoiceNumber}
Due Date: ${dueDateFormatted}
${invoiceDetails ? invoiceDetailsText : `Amount Due: ${currency} ${parseFloat(amount).toFixed(2)}`}${tripInfoText}
${includePaymentLink ? `\nView & Pay Invoice: ${invoiceUrl}\n` : ''}

If you have any questions about this invoice, please don't hesitate to contact us.

---
This is an automated notification from the Logistics Platform.
© ${new Date().getFullYear()} All rights reserved.
    `;

    const mailOptions = {
      from: `"Logistics Platform" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: customerEmail,
      subject: subject,
      text: textContent,
      html: htmlContent,
      attachments: pdfBase64
        ? [
            {
              filename: pdfFileName || `Invoice_${invoiceNumber}.pdf`,
              content: pdfBase64,
              encoding: 'base64',
              contentType: 'application/pdf',
            },
          ]
        : [],
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Invoice email sent successfully:', {
      to: customerEmail,
      messageId: info.messageId,
      invoiceId: invoiceId,
      pdfAttached: !!pdfBase64,
    });

    return {
      success: true,
      messageId: info.messageId,
      message: 'Invoice email sent successfully'
    };
  } catch (error) {
    console.error('❌ Error sending invoice email:', error);
    return {
      success: false,
      error: error.message,
      message: 'Failed to send invoice email'
    };
  }
};

/**
 * Test email configuration with detailed debugging
 * @returns {Promise<Object>} Test result
 */
/**
 * Send invoice email for general repair
 * @param {Object} options - Email options
 * @param {String} options.customerEmail - Customer's email address
 * @param {String} options.customerName - Customer's name
 * @param {String} options.invoiceNumber - Invoice number
 * @param {Number} options.amount - Base amount
 * @param {Number} options.totalAmount - Total amount including taxes
 * @param {Array} options.taxes - Array of tax objects with name and percentage
 * @param {String} options.serviceDate - Service date
 * @param {String} options.unitNumber - Unit number
 * @param {String} options.description - Service description
 * @param {String} options.serviceProvider - Service provider name
 * @param {Array} options.parts - Array of parts used
 * @param {String} options.notes - Additional notes
 * @param {Object} options.companyData - Company information (optional, may include logoUrl)
 * @param {Object} [options.billingTo] - Bill-to address: { street, city, province, postalCode, country }
 * @param {String} [options.invoiceDate] - Invoice date (defaults to serviceDate)
 * @param {String} [options.dueDate] - Due date
 * @param {String} [options.terms] - Payment terms (e.g. "Net 30")
 * @param {String} [options.vin] - VIN for payment notes
 * @param {String} [options.currentKmHours] - Current KM/Hours for payment notes
 * @returns {Promise<Object>} Email sending result
 */
export const sendGeneralRepairInvoiceEmail = async ({
  customerEmail,
  customerName,
  invoiceNumber,
  amount,
  totalAmount,
  taxes = [],
  serviceDate,
  unitNumber,
  description,
  serviceProvider,
  parts = [],
  notes,
  companyData = null,
  billingTo = null,
  invoiceDate = null,
  dueDate = null,
  terms = null,
  vin = null,
  currentKmHours = null
}) => {
  try {
    if (!customerEmail) {
      console.warn('⚠️ No customer email provided, skipping general repair invoice email');
      return { success: false, message: 'No customer email provided' };
    }

    // Validate SMTP configuration
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.error('❌ SMTP configuration is missing. Please set SMTP_HOST, SMTP_USER, and SMTP_PASS environment variables.');
      return {
        success: false,
        error: 'SMTP configuration is missing',
        message: 'Email service is not configured. Please check SMTP settings.'
      };
    }

    const transporter = createTransporter();
    
    const serviceDateFormatted = serviceDate
      ? new Date(serviceDate).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      : 'N/A';

    const invoiceDateFormatted = (invoiceDate || serviceDate)
      ? new Date(invoiceDate || serviceDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : '—';
    const dueDateFormatted = dueDate
      ? new Date(dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : '—';

    // Parts list and totals for line items and subtotal
    const partsList = (parts && parts.length > 0)
      ? parts.map((part) => {
          const partName = part.partName || part.name || part.partNumber || 'Part';
          const quantity = part.quantity || 1;
          const cost = part.cost || 0;
          const rate = quantity > 0 ? cost / quantity : 0;
          return { name: partName, quantity: quantity, cost: cost, rate };
        })
      : [];
    const totalPartsCost = partsList.reduce((sum, part) => sum + (part.cost || 0), 0);
    const subtotal = amount + totalPartsCost;

    // Line items table rows: main service row + part rows
    const lineItemRows = [
      `<tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e9ecef;">${serviceDateFormatted}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e9ecef;">${description || 'Repair Service'}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e9ecef;">${description || '—'}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e9ecef; text-align: center;">1</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e9ecef; text-align: right;">$${Number(amount).toFixed(2)}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e9ecef; text-align: right;">$${Number(amount).toFixed(2)}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e9ecef;">${taxes && taxes.length > 0 ? (taxes.map(t => (t.name || 'Tax') + ' ' + (t.percentage || 0) + '%').join(', ')) : '—'}</td>
      </tr>`
    ];
    partsList.forEach((part) => {
      lineItemRows.push(`
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e9ecef;">${serviceDateFormatted}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e9ecef;">${part.name}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e9ecef;">—</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e9ecef; text-align: center;">${part.quantity}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e9ecef; text-align: right;">$${part.rate.toFixed(2)}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e9ecef; text-align: right;">$${part.cost.toFixed(2)}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e9ecef;">—</td>
      </tr>`);
    });
    const lineItemsTableHTML = lineItemRows.join('');

    // Tax summary rows for financial summary
    const taxSummaryRows = (taxes && taxes.length > 0)
      ? taxes.map((tax) => {
          const taxAmount = amount * ((tax.percentage || 0) / 100);
          return `<tr>
            <td style="padding: 8px 12px; color: #495057;">${tax.name || 'Tax'} @ ${tax.percentage}%</td>
            <td style="padding: 8px 12px; text-align: right;">$${amount.toFixed(2)}</td>
            <td style="padding: 8px 12px; text-align: right;">$${taxAmount.toFixed(2)}</td>
          </tr>`;
        }).join('')
      : '';

    // Company logo (from companyData.logoUrl) or placeholder
    const companyLogoUrl = (companyData && companyData.logoUrl) ? companyData.logoUrl : '';
    const companyLogoHTML = companyLogoUrl
      ? `<img src="${companyLogoUrl}" alt="Company Logo" style="max-height: 56px; max-width: 160px; object-fit: contain; display: block;" />`
      : `<div style="width: 56px; height: 56px; border-radius: 8px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; font-size: 20px; font-weight: bold; display: flex; align-items: center; justify-content: center;">${(companyData && companyData.companyName) ? companyData.companyName.charAt(0).toUpperCase() : 'C'}</div>`;

    // Bill To address block
    const billingToHTML = billingTo && (billingTo.street || billingTo.city || billingTo.province || billingTo.postalCode || billingTo.country)
      ? `<div style="margin-top: 8px; color: #495057; font-size: 14px; line-height: 1.5;">
          ${billingTo.street ? `<div>${billingTo.street}</div>` : ''}
          ${(billingTo.city || billingTo.province || billingTo.postalCode) ? `<div>${[billingTo.city, billingTo.province, billingTo.postalCode].filter(Boolean).join(', ')}</div>` : ''}
          ${billingTo.country ? `<div>${billingTo.country}</div>` : ''}
        </div>`
      : '';

    // Plain text fallbacks for parts and taxes
    let partsText = '';
    let taxesText = '';
    if (partsList.length > 0) {
      partsText = `\n\nParts Used:\n${partsList.map(part => `- ${part.name} (Qty: ${part.quantity}) - $${part.cost.toFixed(2)}`).join('\n')}\nTotal Parts: $${totalPartsCost.toFixed(2)}`;
    }
    if (taxes && taxes.length > 0) {
      taxesText = `\n\nTax Breakdown:\nSubtotal: $${amount.toFixed(2)}${taxes.map(tax => {
        const taxAmount = amount * ((tax.percentage || 0) / 100);
        return `\n${tax.name || 'Tax'} @ ${tax.percentage}%: $${taxAmount.toFixed(2)}`;
      }).join('')}\nTotal: $${totalAmount.toFixed(2)}`;
    } else {
      taxesText = `\n\nTotal: $${totalAmount.toFixed(2)}`;
    }

    const subject = `📄 Repair Invoice ${invoiceNumber} - Payment Required`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Repair Invoice ${invoiceNumber}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.5; color: #333; max-width: 720px; margin: 0 auto; padding: 24px; background-color: #f4f4f4; }
          .container { background-color: #ffffff; border-radius: 10px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
          .invoice-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 2px solid #667eea; }
          .invoice-title { font-size: 22px; font-weight: 700; color: #1a1a2e; margin: 0; }
          .invoice-id { font-size: 14px; color: #6c757d; margin-top: 4px; }
          .from-to-grid { display: table; width: 100%; margin-bottom: 24px; }
          .from-to-col { display: table-cell; width: 50%; vertical-align: top; padding-right: 24px; }
          .from-to-col:last-child { padding-right: 0; padding-left: 24px; }
          .from-to-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #667eea; font-weight: 700; margin-bottom: 8px; }
          .from-to-name { font-size: 16px; font-weight: 700; color: #212529; margin-bottom: 6px; }
          .from-to-details { font-size: 14px; color: #495057; line-height: 1.5; }
          .dates-row { margin-bottom: 20px; }
          .dates-table { width: 100%; max-width: 320px; border-collapse: collapse; }
          .dates-table td { padding: 6px 0; font-size: 14px; color: #495057; }
          .dates-table .dates-label { font-weight: 600; color: #212529; width: 100px; }
          .table-wrap { overflow-x: auto; margin: 20px 0; border: 1px solid #e9ecef; border-radius: 8px; }
          table.line-items { width: 100%; border-collapse: collapse; font-size: 13px; }
          table.line-items th { background: #f8f9fa; padding: 12px; text-align: left; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6; }
          table.line-items th:nth-child(4), table.line-items th:nth-child(5), table.line-items th:nth-child(6) { text-align: right; }
          .summary-box { background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 8px; padding: 16px 20px; margin-top: 20px; max-width: 340px; margin-left: auto; }
          .summary-box table { width: 100%; border-collapse: collapse; font-size: 14px; }
          .summary-box td { padding: 6px 0; color: #495057; }
          .summary-box td:last-child { text-align: right; font-weight: 500; }
          .summary-total td { border-top: 2px solid #667eea; padding-top: 12px; margin-top: 10px; font-size: 18px; font-weight: 700; color: #667eea; }
          .amount-due { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; padding: 20px; border-radius: 8px; text-align: center; margin: 24px 0; }
          .amount-due-label { font-size: 12px; opacity: 0.9; margin-bottom: 4px; }
          .amount-due-value { font-size: 28px; font-weight: 700; }
          .payment-notes { background: #fff9e6; border-left: 4px solid #f0b429; padding: 14px 16px; margin: 20px 0; border-radius: 4px; font-size: 13px; color: #495057; }
          .payment-notes strong { color: #212529; }
          .footer { margin-top: 28px; padding-top: 20px; border-top: 1px solid #e9ecef; text-align: center; color: #6c757d; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="invoice-header">
            <div>
              ${companyData ? companyLogoHTML : '<div style="width: 56px; height: 56px; border-radius: 8px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; font-size: 20px; font-weight: bold; display: flex; align-items: center; justify-content: center;">C</div>'}
              <p class="invoice-id" style="margin-top: 12px;">Invoice # ${invoiceNumber}</p>
            </div>
            <div style="text-align: right;">
              <h1 class="invoice-title">Repair Invoice</h1>
              <p class="invoice-id">${invoiceNumber}</p>
            </div>
          </div>

          <div class="from-to-grid">
            <div class="from-to-col">
              <div class="from-to-label">From</div>
              ${companyData ? `
              <div class="from-to-name">${companyData.companyName || 'Company'}</div>
              <div class="from-to-details">
                ${companyData.address ? `<div>${companyData.address}</div>` : ''}
                ${companyData.contactPhone ? `<div>Phone: ${companyData.contactPhone}</div>` : ''}
                ${companyData.contactEmail ? `<div>Email: ${companyData.contactEmail}</div>` : ''}
                ${companyData.taxNumber ? `<div>Tax #: ${companyData.taxNumber}</div>` : ''}
              </div>
              ` : '<div class="from-to-details">—</div>'}
            </div>
            <div class="from-to-col">
              <div class="from-to-label">Bill To</div>
              <div class="from-to-name">${customerName || 'Customer'}</div>
              <div class="from-to-details">
                <div>${customerEmail || '—'}</div>
                ${billingToHTML}
              </div>
            </div>
          </div>

          <div class="dates-row">
            <table class="dates-table">
              <tr><td class="dates-label">Invoice Date</td><td>${invoiceDateFormatted}</td></tr>
              <tr><td class="dates-label">Due Date</td><td>${dueDateFormatted}</td></tr>
              <tr><td class="dates-label">Service Provider</td><td>${serviceProvider || 'N/A'}</td></tr>
            </table>
          </div>

          <div class="table-wrap">
            <table class="line-items">
              <thead>
                <tr>
                  <th>Service Date</th>
                  <th>Product / Service</th>
                  <th>Description</th>
                  <th>QTY</th>
                  <th>Rate</th>
                  <th>Amount</th>
                  <th>Sales Tax</th>
                </tr>
              </thead>
              <tbody>
                ${lineItemsTableHTML}
              </tbody>
            </table>
          </div>

          <div class="summary-box">
            <table>
              <tr><td>Subtotal</td><td>$${subtotal.toFixed(2)}</td></tr>
              ${taxSummaryRows}
              <tr class="summary-total"><td>Total</td><td>$${totalAmount.toFixed(2)}</td></tr>
            </table>
          </div>

          <div class="amount-due">
            <div class="amount-due-label">Balance Due</div>
            <div class="amount-due-value">$${totalAmount.toFixed(2)}</div>
          </div>

          ${(unitNumber || vin || currentKmHours) ? `
          <div class="payment-notes">
            <strong>Payment / Reference Notes</strong><br/>
            ${unitNumber ? `Unit #: ${unitNumber}<br/>` : ''}${vin ? `VIN: ${vin}<br/>` : ''}${currentKmHours ? `KM/Hours: ${currentKmHours}` : ''}
          </div>
          ` : ''}

          ${notes ? `<p style="font-size: 14px; color: #495057; margin: 16px 0;"><strong>Notes:</strong> ${notes}</p>` : ''}

          <p style="font-size: 14px; color: #495057; margin-top: 20px;">
            If you have any questions about this invoice, please contact us.
          </p>

          <div class="footer">
            <p>This is an automated notification from the Fleet Management System.</p>
            <p>&copy; ${new Date().getFullYear()} All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
Repair Invoice ${invoiceNumber}

From: ${companyData ? (companyData.companyName || 'Company') : '—'}
${companyData && companyData.address ? companyData.address : ''}
${companyData && companyData.contactPhone ? `Phone: ${companyData.contactPhone}` : ''}
${companyData && companyData.contactEmail ? `Email: ${companyData.contactEmail}` : ''}

Bill To: ${customerName || 'Customer'}
${customerEmail || '—'}
${billingTo && (billingTo.street || billingTo.city) ? [billingTo.street, [billingTo.city, billingTo.province, billingTo.postalCode].filter(Boolean).join(', '), billingTo.country].filter(Boolean).join('\n') : ''}

Invoice Date: ${invoiceDateFormatted}  |  Due Date: ${dueDateFormatted}

Service Details:
Invoice #: ${invoiceNumber}
Service Date: ${serviceDateFormatted}
Unit Number: ${unitNumber || 'N/A'}
Service Provider: ${serviceProvider || 'N/A'}
Description: ${description || 'N/A'}
${notes ? `Notes: ${notes}` : ''}${partsText}${taxesText}

Balance Due: $${totalAmount.toFixed(2)}
${(unitNumber || vin || currentKmHours) ? `\nPayment Notes: ${[unitNumber && `Unit #: ${unitNumber}`, vin && `VIN: ${vin}`, currentKmHours && `KM/Hours: ${currentKmHours}`].filter(Boolean).join(' | ')}` : ''}

If you have any questions about this invoice, please contact us.

---
This is an automated notification from the Fleet Management System.
© ${new Date().getFullYear()} All rights reserved.
    `;

    const mailOptions = {
      from: `"Fleet Management System" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: customerEmail,
      subject: subject,
      text: textContent,
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ General repair invoice email sent successfully:', {
      to: customerEmail,
      messageId: info.messageId,
      invoiceNumber: invoiceNumber
    });

    return {
      success: true,
      messageId: info.messageId,
      message: 'General repair invoice email sent successfully'
    };
  } catch (error) {
    console.error('❌ Error sending general repair invoice email:', error);
    return {
      success: false,
      error: error.message,
      message: 'Failed to send general repair invoice email'
    };
  }
};

export const testEmailConnection = async () => {
  try {
    console.log('🧪 [SMTP TEST] Starting SMTP connection test...');
    
    // Check environment variables
    const smtpConfig = {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || '587',
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER,
      hasPassword: !!process.env.SMTP_PASS
    };

    console.log('🧪 [SMTP TEST] SMTP Configuration Check:', {
      host: smtpConfig.host || '❌ NOT SET',
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      user: smtpConfig.user || '❌ NOT SET',
      hasPassword: smtpConfig.hasPassword ? '✅ SET' : '❌ NOT SET',
      allConfigured: !!(smtpConfig.host && smtpConfig.user && smtpConfig.hasPassword)
    });

    if (!smtpConfig.host || !smtpConfig.user || !smtpConfig.hasPassword) {
      return {
        success: false,
        message: 'SMTP configuration is incomplete',
        details: {
          missingHost: !smtpConfig.host,
          missingUser: !smtpConfig.user,
          missingPassword: !smtpConfig.hasPassword
        },
        config: {
          host: smtpConfig.host || null,
          port: smtpConfig.port,
          secure: smtpConfig.secure,
          user: smtpConfig.user || null,
          hasPassword: smtpConfig.hasPassword
        }
      };
    }

    // Create transporter
    console.log('🧪 [SMTP TEST] Creating transporter...');
    const transporter = createTransporter();

    // Verify connection
    console.log('🧪 [SMTP TEST] Verifying SMTP connection...');
    await transporter.verify();
    console.log('✅ [SMTP TEST] SMTP server connection verified successfully');

    // Try sending a test email
    try {
      console.log('🧪 [SMTP TEST] Attempting to send test email...');
      const testMailOptions = {
        from: `"Fleet Management System" <${process.env.SMTP_USER}>`,
        to: process.env.SMTP_USER, // Send to self for testing
        subject: '🧪 SMTP Test Email',
        text: 'This is a test email to verify SMTP configuration is working correctly.',
        html: '<p>This is a test email to verify SMTP configuration is working correctly.</p>'
      };

      const testInfo = await transporter.sendMail(testMailOptions);
      console.log('✅ [SMTP TEST] Test email sent successfully:', {
        messageId: testInfo.messageId,
        response: testInfo.response,
        accepted: testInfo.accepted
      });

      return {
        success: true,
        message: 'SMTP server is ready and test email sent successfully',
        messageId: testInfo.messageId,
        response: testInfo.response,
        config: {
          host: smtpConfig.host,
          port: smtpConfig.port,
          secure: smtpConfig.secure,
          user: smtpConfig.user
        }
      };
    } catch (testSendError) {
      console.error('❌ [SMTP TEST] Failed to send test email:', {
        error: testSendError.message,
        code: testSendError.code,
        command: testSendError.command,
        response: testSendError.response
      });

      return {
        success: false,
        message: 'SMTP connection verified but test email failed',
        error: testSendError.message,
        code: testSendError.code,
        details: testSendError.response || testSendError.command,
        config: {
          host: smtpConfig.host,
          port: smtpConfig.port,
          secure: smtpConfig.secure,
          user: smtpConfig.user
        }
      };
    }
  } catch (error) {
    console.error('❌ [SMTP TEST] SMTP connection error:', {
      error: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode,
      stack: error.stack
    });
    return {
      success: false,
      error: error.message,
      code: error.code,
      message: 'SMTP connection failed',
      details: error.response || error.command || error.stack
    };
  }
};

/**
 * Send password reset email with a secure link
 * @param {Object} options
 * @param {String} options.userEmail - Recipient email address
 * @param {String} options.userName  - Recipient name
 * @param {String} options.resetUrl  - Full reset link (includes raw token)
 */
export const sendPasswordResetEmail = async ({ userEmail, userName, resetUrl }) => {
  try {
    if (!userEmail) return { success: false, message: 'No email provided' };

    const transporter = createTransporter();
    const firstName = userName ? userName.split(' ')[0] : 'User';

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Reset Your Password</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
        <div style="max-width:600px;margin:40px auto;">

          <!-- Header banner -->
          <div style="background-color:#1183e0;border-radius:12px 12px 0 0;padding:36px 40px;text-align:center;">
            <div style="font-size:36px;margin-bottom:10px;">🔐</div>
            <h1 style="color:#ffffff;font-size:26px;font-weight:700;margin:0;letter-spacing:0.3px;">
              Password Reset Request
            </h1>
          </div>

          <!-- White content card -->
          <div style="background-color:#ffffff;padding:40px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">

            <p style="color:#1a202c;font-size:16px;margin:0 0 8px;font-weight:500;">
              Hello <strong>${firstName}</strong>,
            </p>
            <p style="color:#4a5568;font-size:14px;margin:0 0 28px;line-height:1.7;">
              We received a request to reset the password for your <strong>Logistiq Innovation</strong> account.
              Click the button below to choose a new password.
            </p>

            <!-- Expiry highlight box -->
            <div style="border-left:4px solid #1183e0;background-color:#eff6ff;border-radius:0 8px 8px 0;padding:14px 18px;margin:0 0 28px;">
              <p style="color:#1e40af;font-size:13px;margin:0;line-height:1.6;">
                <strong>⏱ This link expires in 1 hour.</strong><br/>
                After that, you'll need to request a new reset link.
              </p>
            </div>

            <!-- CTA Button -->
            <div style="text-align:center;margin:32px 0;">
              <a href="${resetUrl}"
                 style="display:inline-block;background-color:#1183e0;color:#ffffff;text-decoration:none;padding:15px 44px;border-radius:8px;font-size:16px;font-weight:600;letter-spacing:0.3px;box-shadow:0 4px 14px rgba(17,131,224,0.35);">
                Reset My Password
              </a>
            </div>

            <!-- Security note -->
            <div style="background-color:#fafafa;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin:28px 0 0;">
              <p style="color:#718096;font-size:13px;margin:0;line-height:1.7;">
                🔒 <strong style="color:#4a5568;">Didn't request this?</strong><br/>
                If you didn't ask to reset your password, you can safely ignore this email.
                Your password will <strong>not</strong> be changed.
              </p>
            </div>

            <!-- Fallback link -->
            <p style="color:#a0aec0;font-size:11px;margin:24px 0 0;line-height:1.7;">
              If the button doesn't work, paste this link into your browser:<br/>
              <a href="${resetUrl}" style="color:#1183e0;word-break:break-all;">${resetUrl}</a>
            </p>
          </div>

          <!-- Footer -->
          <div style="background-color:#f7fafc;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;padding:20px 40px;text-align:center;">
            <p style="color:#a0aec0;font-size:12px;margin:0;line-height:1.7;">
              This email was sent by <strong style="color:#718096;">Logistiq Innovation</strong> &mdash; Fleet Management Platform.<br/>
              &copy; ${new Date().getFullYear()} Logistiq Innovation. All rights reserved.
            </p>
          </div>

        </div>
      </body>
      </html>
    `;

    const textContent = `
Password Reset Request — Logistiq Innovation

Hello ${firstName},

We received a request to reset the password for your Logistiq Innovation account.

Click the link below to set a new password (expires in 1 hour):
${resetUrl}

If you didn't request this, you can safely ignore this email.

© ${new Date().getFullYear()} Logistiq Innovation. All rights reserved.
    `;

    const info = await transporter.sendMail({
      from: `"Logistiq Innovation" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: userEmail,
      subject: 'Reset Your Logistiq Password',
      text: textContent,
      html: htmlContent,
    });

    console.log('✅ [EMAIL] Password reset email sent:', { to: userEmail, messageId: info.messageId });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ [EMAIL] Failed to send password reset email:', error.message);
    return { success: false, error: error.message };
  }
};

export const sendContactInquiryEmail = async ({ name, email, company, fleetSize, message }) => {
  try {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return { success: false, message: 'SMTP configuration is incomplete.', error: 'SMTP_NOT_CONFIGURED' };
    }

    const transporter = createTransporter();

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
          .header { background: #0f172a; color: #fff; padding: 24px; border-radius: 8px 8px 0 0; }
          .body { background: #f8fafc; padding: 24px; border-radius: 0 0 8px 8px; }
          .field { margin-bottom: 16px; }
          .label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
          .value { font-size: 15px; color: #0f172a; margin-top: 4px; }
          .message-box { background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin-top: 8px; white-space: pre-wrap; }
          .footer { margin-top: 24px; font-size: 12px; color: #94a3b8; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2 style="margin:0">New Contact Inquiry — Logistiq Innovations</h2>
        </div>
        <div class="body">
          <div class="field">
            <div class="label">Full Name</div>
            <div class="value">${name}</div>
          </div>
          <div class="field">
            <div class="label">Email</div>
            <div class="value"><a href="mailto:${email}">${email}</a></div>
          </div>
          <div class="field">
            <div class="label">Company</div>
            <div class="value">${company || '—'}</div>
          </div>
          <div class="field">
            <div class="label">Fleet Size</div>
            <div class="value">${fleetSize || '—'}</div>
          </div>
          <div class="field">
            <div class="label">Message</div>
            <div class="message-box">${message}</div>
          </div>
          <div class="footer">Sent from the Logistiq Innovations website contact form.</div>
        </div>
      </body>
      </html>
    `;

    const info = await transporter.sendMail({
      from: `"Logistiq Website" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: process.env.CONTACT_INQUIRY_EMAIL || process.env.SMTP_USER,
      replyTo: email,
      subject: `Website Inquiry from ${name}${company ? ` — ${company}` : ''}`,
      html: htmlContent,
    });

    console.log('✅ [EMAIL] Contact inquiry email sent:', { from: email, messageId: info.messageId });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ [EMAIL] Failed to send contact inquiry email:', error.message);
    return { success: false, error: error.message };
  }
};

export const sendEmployeeInviteEmail = async ({ employeeEmail, employeeName, inviteUrl, companyName }) => {
  try {
    if (!employeeEmail) return { success: false, message: 'No email provided' };

    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.warn('⚠️ [EMAIL] SMTP not configured — skipping invite email');
      return { success: false, message: 'SMTP not configured' };
    }

    const transporter = createTransporter();
    const firstName = employeeName ? employeeName.split(' ')[0] : 'there';
    const company = companyName || 'Logistiq Innovation';

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>You're Invited to ${company}</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
        <div style="max-width:600px;margin:40px auto;">
          <div style="background-color:#1183e0;border-radius:12px 12px 0 0;padding:36px 40px;text-align:center;">
            <div style="font-size:36px;margin-bottom:10px;">🎉</div>
            <h1 style="color:#ffffff;font-size:26px;font-weight:700;margin:0;letter-spacing:0.3px;">
              You're Invited!
            </h1>
            <p style="color:#bfdbfe;font-size:14px;margin:8px 0 0;">Welcome to ${company}</p>
          </div>
          <div style="background-color:#ffffff;padding:40px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
            <p style="color:#1a202c;font-size:16px;margin:0 0 8px;font-weight:500;">
              Hello <strong>${firstName}</strong>,
            </p>
            <p style="color:#4a5568;font-size:14px;margin:0 0 24px;line-height:1.7;">
              Your account has been created on the <strong>${company}</strong> fleet management portal.
              Click the button below to set your password and activate your account.
            </p>
            <div style="border-left:4px solid #1183e0;background-color:#eff6ff;border-radius:0 8px 8px 0;padding:14px 18px;margin:0 0 28px;">
              <p style="color:#1e40af;font-size:13px;margin:0;line-height:1.6;">
                <strong>⏱ This invite link expires in 72 hours.</strong><br/>
                After that, contact your administrator to resend it.
              </p>
            </div>
            <div style="text-align:center;margin:32px 0;">
              <a href="${inviteUrl}"
                 style="display:inline-block;background-color:#1183e0;color:#ffffff;text-decoration:none;padding:15px 44px;border-radius:8px;font-size:16px;font-weight:600;letter-spacing:0.3px;box-shadow:0 4px 14px rgba(17,131,224,0.35);">
                Accept Invitation &amp; Set Password
              </a>
            </div>
            <p style="color:#a0aec0;font-size:11px;margin:24px 0 0;line-height:1.7;">
              If the button doesn't work, paste this link into your browser:<br/>
              <a href="${inviteUrl}" style="color:#1183e0;word-break:break-all;">${inviteUrl}</a>
            </p>
          </div>
          <div style="background-color:#f7fafc;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;padding:20px 40px;text-align:center;">
            <p style="color:#a0aec0;font-size:12px;margin:0;line-height:1.7;">
              This email was sent by <strong style="color:#718096;">${company}</strong> via Logistiq Innovation Platform.<br/>
              &copy; ${new Date().getFullYear()} Logistiq Innovation. All rights reserved.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    const info = await transporter.sendMail({
      from: `"${company}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: employeeEmail,
      subject: `You're invited to ${company} — Set your password`,
      html: htmlContent,
    });

    console.log('✅ [EMAIL] Invite email sent:', { to: employeeEmail, messageId: info.messageId });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ [EMAIL] Failed to send invite email:', error.message);
    return { success: false, error: error.message };
  }
};
