import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

export interface MatchedEmailSend {
  id: number;
  contact_id: number | null;
  sales_id: number | null;
}

/** How far back to look for an outbound send this inbound message could be replying to. */
const REPLY_LOOKBACK_DAYS = 180;

/**
 * Best-effort reply detection: when an inbound email arrives from an address
 * we don't recognize as a sales rep, check whether it's the most recent
 * unanswered CRM-sent email to that address and mark it replied.
 *
 * There's no shared Message-ID between Resend (outbound) and Postmark
 * (inbound) to thread on, so this matches by recipient address + recency
 * instead — the same heuristic tradeoff the existing forwarding detection
 * in this webhook already makes.
 */
export async function findAndMarkRepliedEmailSend(
  fromEmail: string,
): Promise<MatchedEmailSend | null> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - REPLY_LOOKBACK_DAYS);

  const { data, error } = await supabaseAdmin
    .from("email_sends")
    .select("id, contact_id, sales_id")
    .ilike("to_email", fromEmail)
    .in("status", ["sent", "delivered", "opened", "clicked"])
    .gte("sent_at", since.toISOString())
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const { error: updateError } = await supabaseAdmin
    .from("email_sends")
    .update({ status: "replied", replied_at: new Date().toISOString() })
    .eq("id", data.id);

  if (updateError) {
    console.warn("findAndMarkRepliedEmailSend: update failed:", updateError);
    return null;
  }

  return data;
}
