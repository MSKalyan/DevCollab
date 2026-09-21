// Transactional email for auth flows.
//
// SMTP is optional: when SMTP_HOST is unset (local development, tests) the
// message is captured in an in-process outbox and logged instead of being sent,
// so the reset flow stays usable without an email provider. Production MUST set
// the SMTP_* variables — see .env.example.
import nodemailer from "nodemailer";

let cachedTransporter;

// Local outbox, only reachable while SMTP is unconfigured. The service-layer
// entry point (services/mailer.js) is what reads it, so it cannot leak links in
// production.
const devOutbox = [];

export function getDevOutbox() {
  return devOutbox;
}

function getTransporter() {
  if (cachedTransporter !== undefined) return cachedTransporter;

  if (!process.env.SMTP_HOST) {
    cachedTransporter = null;
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return cachedTransporter;
}

function mailFrom() {
  return process.env.MAIL_FROM || "DevCollab <no-reply@devcollab.local>";
}

// Emailed one-time code. The code itself is short-lived and attempt-capped;
// the email never contains a session or a link that logs the user in.
export async function sendVerificationCodeEmail(to, code) {
  const transporter = getTransporter();
  if (!transporter) {
    devOutbox.push({ to, code, sentAt: new Date() });
    console.warn(`[mail] SMTP_HOST is not set; not sending mail. Verification code for ${to}: ${code}`);
    return { delivered: false };
  }

  await transporter.sendMail({
    from: mailFrom(),
    to,
    subject: "Your DevCollab verification code",
    text: [
      "Confirm your email address to finish creating your DevCollab account.",
      "",
      `Your verification code is: ${code}`,
      "",
      "It expires in 10 minutes. If you did not sign up, ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.6;color:#111">
        <p>Confirm your email address to finish creating your DevCollab account.</p>
        <p style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:28px;font-weight:600;letter-spacing:0.24em;margin:18px 0">
          ${code}
        </p>
        <p>This code expires in 10 minutes.</p>
        <p style="color:#555">If you did not sign up, ignore this email.</p>
      </div>
    `,
  });

  return { delivered: true };
}

export async function sendPasswordResetEmail(to, resetUrl) {
  const transporter = getTransporter();
  if (!transporter) {
    devOutbox.push({ to, resetUrl, sentAt: new Date() });
    console.warn(
      `[mail] SMTP_HOST is not set; not sending mail. Password reset link for ${to}: ${resetUrl}`
    );
    return { delivered: false };
  }

  await transporter.sendMail({
    from: mailFrom(),
    to,
    subject: "Reset your DevCollab password",
    text: [
      "We received a request to reset your DevCollab password.",
      "",
      "Reset it here (the link expires in 60 minutes):",
      resetUrl,
      "",
      "If you did not request this, ignore this email — your password will not change.",
    ].join("\n"),
    html: `
      <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.6;color:#111">
        <p>We received a request to reset your DevCollab password.</p>
        <p>
          <a href="${resetUrl}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#4ade80;color:#06120a;font-weight:600;text-decoration:none">
            Reset password
          </a>
        </p>
        <p>This link expires in 60 minutes and can only be used once.</p>
        <p style="color:#555">
          If you did not request this, ignore this email — your password will not change.
        </p>
      </div>
    `,
  });

  return { delivered: true };
}
