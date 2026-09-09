/**
 * Transactional email, with no extra dependency.
 *
 * - `RESEND_API_KEY` set  → delivers through Resend's REST API over `fetch`.
 * - not set               → logs the message (and any link in it) to the Worker
 *                           console, so the whole verification / reset flow is
 *                           testable locally without signing up for anything.
 *
 * To switch providers, replace the fetch call below — every caller goes through
 * `sendEmail()`, and the auth wiring in `auth.server.ts` never changes.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendEmail(env: Env, message: EmailMessage): Promise<void> {
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM || "onboarding@resend.dev";

  if (!apiKey) {
    console.info(
      `[email] (no RESEND_API_KEY — not sent)\n  to: ${message.to}\n  subject: ${message.subject}\n  ${message.text}`,
    );
    return;
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      // A failed email must not turn a successful signup into an error page.
      console.error(`[email] delivery failed (${response.status})`);
    }
    await response.body?.cancel();
  } catch (error) {
    console.error("[email] delivery failed:", error);
  }
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

/** Plain-text copy and an application-generated URL for a one-action email. */
export function actionEmail(options: {
  heading: string;
  body: string;
  actionLabel: string;
  url: string;
}): string {
  const { heading, body, actionLabel, url } = options;
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1c1c22">
  <table role="presentation" style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e6e7eb">
    <tr><td style="padding:28px">
      <h1 style="margin:0 0 12px;font-size:18px">${escapeHtml(heading)}</h1>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#54555f">${escapeHtml(body)}</p>
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#6d4aff;color:#fff;font-size:14px;text-decoration:none">${escapeHtml(actionLabel)}</a>
      <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#84858f">If the button does not work, paste this link into your browser:<br>${escapeHtml(url)}</p>
    </td></tr>
  </table>
</body></html>`;
}
