import nodemailer from 'nodemailer';
import { Database } from 'sqlite';
import { getDatabase } from '../../config/database';

interface DigestEmailData {
  emailId: string;
  subject: string;
  sender: string;
  receivedAt: Date;
  similarity: number;
  summary?: string;
}

interface DigestDeliveryOptions {
  windowHours: number;
  emailFilter: 'all' | 'important';
  digestContent: string;
}

export class EmailDeliveryService {
  private transporter: nodemailer.Transporter | null = null;
  private db: Database | null = null;

  constructor() {
    this.initializeTransporter();
  }

  private async getDb(): Promise<Database> {
    if (!this.db) this.db = await getDatabase();
    return this.db;
  }

  private initializeTransporter(): void {
    // Initialize email transporter based on environment variables
    const emailService = process.env.EMAIL_SERVICE || 'gmail';
    const emailUser = process.env.EMAIL_USER;
    const emailPassword = process.env.EMAIL_PASSWORD;
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT || '587');

    if (!emailUser || !emailPassword) {
      console.warn('📧 Email delivery service not configured.');
      console.warn('   To enable digest email delivery, set these environment variables:');
      console.warn('   - EMAIL_USER: Your email address');
      console.warn('   - EMAIL_PASSWORD: Your email password (use App Password for Gmail)');
      console.warn('   - EMAIL_SERVICE: "gmail" or "smtp" (optional, defaults to gmail)');
      console.warn('   ');
      console.warn('   For Gmail setup:');
      console.warn('   1. Enable 2-factor authentication');
      console.warn('   2. Generate App Password: Google Account → Security → 2-Step Verification → App passwords');
      console.warn('   3. Use the generated password as EMAIL_PASSWORD');
      console.warn('   ');
      console.warn('   See env.template for complete configuration example.');
      return;
    }

    try {
      if (emailService === 'gmail') {
        this.transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: emailUser,
            pass: emailPassword, // Use App Password for Gmail
          },
        });
        console.log(`✅ Email delivery configured with Gmail (${emailUser})`);
      } else if (emailService === 'smtp' && smtpHost) {
        this.transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: {
            user: emailUser,
            pass: emailPassword,
          },
        });
        console.log(`✅ Email delivery configured with SMTP (${smtpHost}:${smtpPort})`);
      } else {
        console.warn(`❌ Invalid email service configuration: ${emailService}`);
        console.warn('   EMAIL_SERVICE must be "gmail" or "smtp"');
        if (emailService === 'smtp' && !smtpHost) {
          console.warn('   For SMTP, SMTP_HOST is required');
        }
      }
    } catch (error) {
      console.error('❌ Failed to initialize email transporter:', error);
      this.transporter = null;
    }
  }

  private formatDigestEmail(
    userEmail: string, 
    digestData: DigestEmailData[], 
    options: DigestDeliveryOptions
  ): { subject: string; html: string; text: string } {
    const now = new Date();
    const timeStr = now.toLocaleString('en-US', { 
      timeZone: 'Asia/Kolkata',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const subject = `Your Email Digest - ${digestData.length} Important Thread${digestData.length !== 1 ? 's' : ''} (${timeStr})`;

    const emailFilterText = options.emailFilter === 'important' ? 'Important emails only' : 'All emails';
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Digest</title>
        <style>
          * { font-family: Baskerville, 'Baskerville Old Face', 'Hoefler Text', Garamond, 'Times New Roman', serif !important; }
          body { font-family: Baskerville, 'Baskerville Old Face', 'Hoefler Text', Garamond, 'Times New Roman', serif !important; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background-color: #4a5568; color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 600; font-family: Baskerville, 'Baskerville Old Face', 'Hoefler Text', Garamond, 'Times New Roman', serif !important; }
          .header p { margin: 10px 0 0 0; opacity: 0.9; font-size: 14px; font-family: Baskerville, 'Baskerville Old Face', 'Hoefler Text', Garamond, 'Times New Roman', serif !important; }
          .stats { background-color: #f8f9fa; padding: 15px 20px; border-bottom: 1px solid #e9ecef; }
          .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 15px; }
          .stat-item { text-align: center; }
          .stat-value { font-size: 20px; font-weight: 600; color: #495057; font-family: Baskerville, 'Baskerville Old Face', 'Hoefler Text', Garamond, 'Times New Roman', serif !important; }
          .stat-label { font-size: 12px; color: #6c757d; text-transform: uppercase; margin-top: 4px; font-family: Baskerville, 'Baskerville Old Face', 'Hoefler Text', Garamond, 'Times New Roman', serif !important; }
          .content { padding: 20px; }
          .email-item { border: 1px solid #e9ecef; border-radius: 6px; margin-bottom: 16px; overflow: hidden; }
          .email-header { background-color: #f8f9fa; padding: 12px 16px; border-bottom: 1px solid #e9ecef; }
          .email-subject { font-weight: 600; font-size: 16px; margin: 0; color: #495057; font-family: Baskerville, 'Baskerville Old Face', 'Hoefler Text', Garamond, 'Times New Roman', serif !important; }
          .email-meta { font-size: 12px; color: #6c757d; margin-top: 4px; font-family: Baskerville, 'Baskerville Old Face', 'Hoefler Text', Garamond, 'Times New Roman', serif !important; }
          .email-body { padding: 16px; }
          .email-summary { font-size: 14px; line-height: 1.5; color: #495057; font-family: Baskerville, 'Baskerville Old Face', 'Hoefler Text', Garamond, 'Times New Roman', serif !important; }
          .similarity-badge { display: inline-block; background-color: #e3f2fd; color: #1976d2; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; margin-left: 8px; font-family: Baskerville, 'Baskerville Old Face', 'Hoefler Text', Garamond, 'Times New Roman', serif !important; }
          .footer { background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #6c757d; border-top: 1px solid #e9ecef; font-family: Baskerville, 'Baskerville Old Face', 'Hoefler Text', Garamond, 'Times New Roman', serif !important; }
          .footer a { color: #667eea; text-decoration: none; font-family: Baskerville, 'Baskerville Old Face', 'Hoefler Text', Garamond, 'Times New Roman', serif !important; }
          .no-emails { text-align: center; padding: 40px 20px; color:rgb(28, 28, 29); font-family: Baskerville, 'Baskerville Old Face', 'Hoefler Text', Garamond, 'Times New Roman', serif !important; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📧 Email Digest</h1>
            <p>Generated on ${timeStr}</p>
          </div>
          
          <div class="stats">
            <div class="stats-grid">
              <div class="stat-item">
                <div class="stat-value">${digestData.length}</div>
                <div class="stat-label">Threads</div>
              </div>
              <div class="stat-item">
                <div class="stat-value">${options.windowHours}h</div>
                <div class="stat-label">Window</div>
              </div>
              <div class="stat-item">
                <div class="stat-value">${emailFilterText}</div>
                <div class="stat-label">Filter</div>
              </div>
            </div>
          </div>

          <div class="content">
            ${digestData.length === 0 ? `
              <div class="no-emails">
                <h3>No new emails in this digest</h3>
                <p>You're all caught up! No important emails found in the last ${options.windowHours} hours.</p>
              </div>
            ` : digestData.map(email => `
              <div class="email-item">
                <div class="email-header">
                  <h3 class="email-subject">${email.subject || '(No Subject)'}</h3>
                  <div class="email-meta">
                    From: ${email.sender} • ${email.receivedAt.toLocaleString('en-US', { 
                      timeZone: 'Asia/Kolkata',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                    <span class="similarity-badge">${(email.similarity * 100).toFixed(1)}% relevant</span>
                  </div>
                </div>
                ${email.summary ? `
                  <div class="email-body">
                    <div class="email-summary">${email.summary}</div>
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>

          <div class="footer">
            <p>I'm so goated dawg istg. hardiksrivastava.com</p>
            <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3001'}/digest/settings">Manage digest settings</a> | <a href="${process.env.FRONTEND_URL || 'http://localhost:3001'}/digest">View digest history</a></p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
EMAIL DIGEST - ${timeStr}

${digestData.length} Important Thread${digestData.length !== 1 ? 's' : ''} (${emailFilterText}, ${options.windowHours}h window)

${digestData.length === 0 ? 
  `No new emails in this digest. You're all caught up!` : 
  digestData.map(email => `
• ${email.subject || '(No Subject)'}
  From: ${email.sender}
  Received: ${email.receivedAt.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}
  Relevance: ${(email.similarity * 100).toFixed(1)}%
  ${email.summary ? `Summary: ${email.summary}` : ''}
  `).join('\n')
}

---
Manage your digest settings: ${process.env.FRONTEND_URL || 'http://localhost:3001'}/digest/settings
View digest history: ${process.env.FRONTEND_URL || 'http://localhost:3001'}/digest
    `;

    return { subject, html: htmlContent, text: textContent };
  }

  async sendDigestEmail(
    userId: string,
    userEmail: string,
    digestData: DigestEmailData[],
    options: DigestDeliveryOptions
  ): Promise<boolean> {
    if (!this.transporter) {
      console.warn('📧 Email transporter not configured. Skipping email delivery.');
      console.warn('   Configure EMAIL_USER and EMAIL_PASSWORD environment variables to enable email delivery.');
      console.warn('   See the startup logs above for detailed configuration instructions.');
      return false;
    }

    try {
      const { subject, html, text } = this.formatDigestEmail(userEmail, digestData, options);

      const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: userEmail,
        subject,
        text,
        html,
        headers: {
          'X-Email-Filter-Digest': 'true',
          'X-User-ID': userId,
        },
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Digest email sent to ${userEmail} (Message ID: ${result.messageId})`);
      return true;

    } catch (error) {
      console.error(`❌ Failed to send digest email to ${userEmail}:`, error);
      return false;
    }
  }

  async testEmailConfiguration(): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      console.log('✅ Email configuration is valid');
      return true;
    } catch (error) {
      console.error('❌ Email configuration test failed:', error);
      return false;
    }
  }
}
