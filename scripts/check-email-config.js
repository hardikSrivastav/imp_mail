#!/usr/bin/env node

/**
 * Email Configuration Checker
 * 
 * This script checks if the email delivery configuration is properly set up
 * and can successfully send test emails.
 */

require('dotenv').config();
const nodemailer = require('nodemailer');

async function checkEmailConfiguration() {
  console.log('🔍 Checking email delivery configuration...\n');

  // Check environment variables
  const emailService = process.env.EMAIL_SERVICE || 'gmail';
  const emailUser = process.env.EMAIL_USER;
  const emailPassword = process.env.EMAIL_PASSWORD;
  const emailFrom = process.env.EMAIL_FROM || emailUser;
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587');

  console.log('📋 Configuration Status:');
  console.log(`   EMAIL_SERVICE: ${emailService}`);
  console.log(`   EMAIL_USER: ${emailUser ? '✅ Set' : '❌ Missing'}`);
  console.log(`   EMAIL_PASSWORD: ${emailPassword ? '✅ Set' : '❌ Missing'}`);
  console.log(`   EMAIL_FROM: ${emailFrom || 'Not set (will use EMAIL_USER)'}`);
  
  if (emailService === 'smtp') {
    console.log(`   SMTP_HOST: ${smtpHost ? '✅ Set' : '❌ Missing'}`);
    console.log(`   SMTP_PORT: ${smtpPort}`);
  }

  if (!emailUser || !emailPassword) {
    console.log('\n❌ Email configuration is incomplete.');
    console.log('\nRequired environment variables:');
    console.log('   - EMAIL_USER: Your email address');
    console.log('   - EMAIL_PASSWORD: Your email password (use App Password for Gmail)');
    console.log('\nOptional environment variables:');
    console.log('   - EMAIL_SERVICE: "gmail" or "smtp" (defaults to "gmail")');
    console.log('   - EMAIL_FROM: From address (defaults to EMAIL_USER)');
    console.log('\nFor Gmail setup:');
    console.log('   1. Enable 2-factor authentication on your Gmail account');
    console.log('   2. Generate App Password: Google Account → Security → 2-Step Verification → App passwords');
    console.log('   3. Use the generated password as EMAIL_PASSWORD');
    console.log('\nSee env.template for complete configuration example.');
    process.exit(1);
  }

  // Create transporter
  let transporter;
  try {
    if (emailService === 'gmail') {
      transporter = nodemailer.createTransporter({
        service: 'gmail',
        auth: {
          user: emailUser,
          pass: emailPassword,
        },
      });
    } else if (emailService === 'smtp') {
      if (!smtpHost) {
        console.log('\n❌ SMTP_HOST is required when EMAIL_SERVICE=smtp');
        process.exit(1);
      }
      transporter = nodemailer.createTransporter({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: emailUser,
          pass: emailPassword,
        },
      });
    } else {
      console.log(`\n❌ Invalid EMAIL_SERVICE: ${emailService}`);
      console.log('   EMAIL_SERVICE must be "gmail" or "smtp"');
      process.exit(1);
    }

    console.log('\n🔧 Testing email transporter...');
    await transporter.verify();
    console.log('✅ Email transporter verification successful!');

    // Ask if user wants to send a test email
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('\n📧 Would you like to send a test email? (y/N): ', async (answer) => {
      if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        rl.question('Enter recipient email address: ', async (recipient) => {
          try {
            console.log(`\n📤 Sending test email to ${recipient}...`);
            
            const mailOptions = {
              from: emailFrom,
              to: recipient,
              subject: 'Test Email - Intelligent Email Filter',
              text: 'This is a test email from your Intelligent Email Filter system. If you received this, your email configuration is working correctly!',
              html: `
                <h2>✅ Email Configuration Test</h2>
                <p>This is a test email from your <strong>Intelligent Email Filter</strong> system.</p>
                <p>If you received this email, your email delivery configuration is working correctly!</p>
                <hr>
                <p><small>Sent at: ${new Date().toISOString()}</small></p>
              `
            };

            const result = await transporter.sendMail(mailOptions);
            console.log(`✅ Test email sent successfully!`);
            console.log(`   Message ID: ${result.messageId}`);
            console.log(`   Recipient: ${recipient}`);
            
          } catch (error) {
            console.log('❌ Failed to send test email:', error.message);
          }
          rl.close();
        });
      } else {
        console.log('\n✅ Email configuration check complete!');
        rl.close();
      }
    });

  } catch (error) {
    console.log('\n❌ Email transporter verification failed:', error.message);
    console.log('\nCommon issues:');
    console.log('   - Invalid credentials (check EMAIL_USER and EMAIL_PASSWORD)');
    console.log('   - For Gmail: Make sure you\'re using an App Password, not your regular password');
    console.log('   - For Gmail: Ensure 2-factor authentication is enabled');
    console.log('   - Network connectivity issues');
    console.log('   - SMTP server settings (if using custom SMTP)');
    process.exit(1);
  }
}

// Run the check
checkEmailConfiguration().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
