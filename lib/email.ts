import nodemailer from 'nodemailer';
import { getEnvironmentStatus } from './env';

export interface SendVerificationResult {
  sent: boolean;
  providerConfigured: boolean;
  message: string;
  missingVariables?: string[];
  codeForDev?: string;
}

export async function sendVerificationEmail(
  toEmail: string,
  code: string,
  accountNumber: string
): Promise<SendVerificationResult> {
  const envStatus = getEnvironmentStatus();

  if (!envStatus.smtp.configured) {
    console.info(
      `[Email Service] Missing SMTP environment variables: ${envStatus.smtp.missing.join(', ')}. Verification code for ${toEmail} (${accountNumber}): ${code}`
    );
    return {
      sent: false,
      providerConfigured: false,
      missingVariables: envStatus.smtp.missing,
      message: `Email service is waiting for environment variables: ${envStatus.smtp.missing.join(', ')}.`,
      codeForDev: code,
    };
  }

  const host = process.env.SMTP_HOST!;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER!;
  const pass = process.env.SMTP_PASS!;
  const from = process.env.SMTP_FROM || user;

  const isSecure = port === 465;

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: isSecure,
      auth: {
        user,
        pass,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
    });

    const mailOptions = {
      from: `"G-Squad Terminal" <${from}>`,
      to: toEmail,
      subject: `G-Squad Verification Code: ${code}`,
      text: `Welcome to G-Squad.\n\nYour 6-digit email verification code is: ${code}\nAccount ID: ${accountNumber}\n\nEnter this code on the verification screen to activate your terminal.`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <div style="display: flex; align-items: center; margin-bottom: 20px;">
            <div style="background-color: #2563eb; color: #ffffff; font-weight: bold; padding: 6px 12px; border-radius: 8px; font-size: 16px; letter-spacing: 1px;">
              G-SQUAD
            </div>
            <div style="margin-left: 10px; color: #64748b; font-size: 13px; font-weight: 500;">
              Autonomous Deriv Trader
            </div>
          </div>
          
          <h2 style="color: #0f172a; font-size: 20px; font-weight: 700; margin: 0 0 8px 0;">Verify Your Email Address</h2>
          <p style="color: #475569; font-size: 14px; line-height: 1.5; margin: 0 0 20px 0;">
            Thank you for registering your G-Squad account (<strong style="color: #0f172a;">${accountNumber}</strong>). Use the verification code below to activate your trading terminal:
          </p>

          <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; text-align: center; margin-bottom: 24px;">
            <span style="font-family: monospace; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #2563eb;">
              ${code}
            </span>
            <div style="color: #64748b; font-size: 11px; margin-top: 6px;">
              Valid for 24 hours. Do not share this code.
            </div>
          </div>

          <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin: 0 0 16px 0;">
            After verification, you can securely connect your Deriv Personal Access Token (PAT) with trade scope to start autonomous synthetic trading.
          </p>

          <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 20px 0;" />
          <div style="color: #94a3b8; font-size: 11px; text-align: center;">
            G-Squad Trading Engine · Deriv API Integration · Server-Side Risk Limits
          </div>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email Service] Dispatched verification code to ${toEmail} (Message ID: ${info.messageId})`);

    return {
      sent: true,
      providerConfigured: true,
      message: `Verification code sent to ${toEmail}.`,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Email Service] Failed to deliver email via SMTP: ${errorMsg}`);
    return {
      sent: false,
      providerConfigured: true,
      message: `SMTP delivery failed: ${errorMsg}`,
      codeForDev: code,
    };
  }
}
