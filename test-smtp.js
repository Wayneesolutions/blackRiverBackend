// test-smtp.js
// Test script to verify SMTP credentials are working
import nodemailer from 'nodemailer';

// Hardcoded SMTP credentials for testing
const SMTP_CONFIG = {
  host: 'smtp.gmail.com', // Note: Changed from email address to actual SMTP server
  // If you need to use the email as host, uncomment below and comment above:
  // host: 'logistiqinnovation@gmail.com',
  port: 587,
  secure: false, // true for 465, false for other ports (587)
  auth: {
    user: 'logistiqinnovation@gmail.com',
    pass: 'fpbf jgwa qjnk ywqq'
  }
};

const FROM_EMAIL = 'logistiqinnovation@gmail.com';
const TO_EMAIL = 'logistiqinnovation@gmail.com'; // Send test email to yourself

console.log('🔍 Testing SMTP Configuration...');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('SMTP Host:', SMTP_CONFIG.host);
console.log('SMTP Port:', SMTP_CONFIG.port);
console.log('SMTP Secure:', SMTP_CONFIG.secure);
console.log('SMTP User:', SMTP_CONFIG.auth.user);
console.log('SMTP From Email:', FROM_EMAIL);
console.log('Test Email To:', TO_EMAIL);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Create transporter
const transporter = nodemailer.createTransport(SMTP_CONFIG);

async function testSMTPConnection() {
  try {
    console.log('📡 Step 1: Verifying SMTP connection...');
    
    // Verify SMTP connection
    const verified = await transporter.verify();
    
    if (verified) {
      console.log('✅ SMTP connection verified successfully!\n');
    } else {
      console.log('⚠️ SMTP verification returned false\n');
      return;
    }
  } catch (error) {
    console.error('❌ SMTP Connection Failed!');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Error Code:', error.code);
    console.error('Error Message:', error.message);
    
    if (error.code === 'EAUTH') {
      console.error('\n💡 Authentication Error - Possible causes:');
      console.error('   - Incorrect username or password');
      console.error('   - For Gmail: You may need to use an "App Password" instead of your regular password');
      console.error('   - Enable "Less secure app access" or use OAuth2');
      console.error('   - Check if 2-factor authentication is enabled (use App Password)');
    } else if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT') {
      console.error('\n💡 Connection Error - Possible causes:');
      console.error('   - Wrong SMTP host or port');
      console.error('   - Firewall blocking the connection');
      console.error('   - SMTP server is down');
    } else if (error.code === 'EDNS') {
      console.error('\n💡 DNS Error - Possible causes:');
      console.error('   - Invalid SMTP host address');
      console.error('   - DNS resolution failed');
    }
    
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    return;
  }

  try {
    console.log('📧 Step 2: Sending test email...');
    
    const mailOptions = {
      from: `"SMTP Test" <${FROM_EMAIL}>`,
      to: TO_EMAIL,
      subject: '✅ SMTP Test Email - ' + new Date().toLocaleString(),
      text: `
Hello!

This is a test email to verify your SMTP configuration is working correctly.

Test Details:
- Sent At: ${new Date().toLocaleString()}
- SMTP Host: ${SMTP_CONFIG.host}
- SMTP Port: ${SMTP_CONFIG.port}
- From: ${FROM_EMAIL}
- To: ${TO_EMAIL}

If you received this email, your SMTP credentials are working perfectly! 🎉

Best regards,
SMTP Test Script
      `,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
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
    .success-icon {
      font-size: 48px;
      text-align: center;
      margin: 20px 0;
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
      <h1>✅ SMTP Test Email</h1>
    </div>
    
    <div class="success-icon">🎉</div>
    
    <p>Hello!</p>
    
    <p>This is a test email to verify your SMTP configuration is working correctly.</p>
    
    <div class="info-box">
      <h3 style="margin-top: 0; margin-bottom: 10px; color: #10b981;">Test Details</h3>
      <div class="info-row">
        <span class="info-label">Sent At:</span>
        <span class="info-value">${new Date().toLocaleString()}</span>
      </div>
      <div class="info-row">
        <span class="info-label">SMTP Host:</span>
        <span class="info-value">${SMTP_CONFIG.host}</span>
      </div>
      <div class="info-row">
        <span class="info-label">SMTP Port:</span>
        <span class="info-value">${SMTP_CONFIG.port}</span>
      </div>
      <div class="info-row">
        <span class="info-label">From:</span>
        <span class="info-value">${FROM_EMAIL}</span>
      </div>
      <div class="info-row">
        <span class="info-label">To:</span>
        <span class="info-value">${TO_EMAIL}</span>
      </div>
    </div>
    
    <p style="margin-top: 20px; font-weight: bold; color: #10b981;">
      ✅ If you received this email, your SMTP credentials are working perfectly!
    </p>
    
    <div class="footer">
      <p>This is an automated test email from the SMTP Test Script.</p>
      <p>&copy; ${new Date().getFullYear()} All rights reserved.</p>
    </div>
  </div>
</body>
</html>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    
    console.log('✅ Test email sent successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Message ID:', info.messageId);
    console.log('Response:', info.response);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📬 Please check your inbox at:', TO_EMAIL);
    console.log('   (Check spam folder if not in inbox)\n');
    console.log('✅ SMTP credentials are working correctly! 🎉\n');
    
  } catch (error) {
    console.error('❌ Failed to send test email!');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Error Code:', error.code);
    console.error('Error Message:', error.message);
    
    if (error.response) {
      console.error('SMTP Response:', error.response);
    }
    
    if (error.code === 'EAUTH') {
      console.error('\n💡 Authentication Error - Possible solutions:');
      console.error('   1. For Gmail users:');
      console.error('      - Enable 2-Factor Authentication');
      console.error('      - Generate an "App Password" at: https://myaccount.google.com/apppasswords');
      console.error('      - Use the App Password instead of your regular password');
      console.error('   2. Check if username and password are correct');
      console.error('   3. Ensure account is not locked or suspended');
    } else if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT') {
      console.error('\n💡 Connection Error - Possible solutions:');
      console.error('   1. Verify SMTP host is correct (should be smtp.gmail.com for Gmail)');
      console.error('   2. Check if port 587 is open in your firewall');
      console.error('   3. Try port 465 with secure: true');
    }
    
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }
}

// Run the test
testSMTPConnection().then(() => {
  console.log('Test completed. Exiting...');
  process.exit(0);
}).catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});

