import 'server-only';
import { Resend } from 'resend';

/**
 * Outbound email (brief §2, §7).
 *
 * Reply-to is the user, not the app: a subcontractor replying with a certificate should
 * land in the contractor's inbox, where they can act on it. With no API key configured
 * the send is a no-op that still records the draft, so the chase loop is usable and
 * demonstrable before email is wired up.
 */
export interface SendResult {
  readonly delivered: boolean;
  readonly message: string;
  readonly providerMessageId: string | null;
}

export async function sendChaseEmail(input: {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CHASE_FROM_EMAIL;

  if (!apiKey || !from) {
    return {
      delivered: false,
      message:
        'Draft saved and marked sent. Set RESEND_API_KEY and CHASE_FROM_EMAIL to deliver it.',
      providerMessageId: null,
    };
  }

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    text: input.body,
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
  });

  if (error) {
    return { delivered: false, message: `Email provider error: ${error.message}`, providerMessageId: null };
  }

  return { delivered: true, message: 'Sent.', providerMessageId: data?.id ?? null };
}
