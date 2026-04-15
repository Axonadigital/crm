/**
 * Service endpoints — single source of truth for external API URLs.
 *
 * This file defines where the quote workflow reaches out to Anthropic,
 * DocuSeal, Resend, Discord and the Discord webhook. Each helper returns
 * the default production URL but can be overridden via an environment
 * variable, which allows tests to redirect outbound traffic to a local
 * mock server without touching call sites.
 *
 * Added in Phase 0 of the quote workflow refactor as a test seam. Phase 1
 * migrates existing hardcoded URLs to use these helpers.
 */

/** Anthropic Messages API endpoint used for AI section generation. */
export function getAnthropicApiUrl(): string {
  return (
    Deno.env.get("ANTHROPIC_API_URL") ?? "https://api.anthropic.com/v1/messages"
  );
}

/** DocuSeal REST base URL. Callers append `/api/submissions` etc. */
export function getDocuSealBaseUrl(): string {
  return (
    Deno.env.get("DOCUSEAL_BASE_URL") ?? "https://docuseal.sign.axonadigital.se"
  );
}

/** Resend transactional email API base URL. */
export function getResendApiUrl(): string {
  return Deno.env.get("RESEND_API_URL") ?? "https://api.resend.com";
}

/** Discord bot API base (v10). Used for posting via bot token + channel id. */
export function getDiscordApiUrl(): string {
  return Deno.env.get("DISCORD_API_URL") ?? "https://discord.com/api/v10";
}

/**
 * Discord webhook URL used as fallback when no bot token is configured.
 * Returns null if no webhook URL is set — callers should handle gracefully.
 */
export function getDiscordWebhookUrl(): string | null {
  const override = Deno.env.get("DISCORD_WEBHOOK_URL");
  return override && override.length > 0 ? override : null;
}
