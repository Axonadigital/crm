/**
 * Quote workflow constants — single source of truth for magic strings used
 * across the quote pipeline edge functions. Imported by orchestrate_proposal,
 * generate_quote_text, send_quote_for_signing, approve_proposal, and the
 * pipelineLogger helper.
 *
 * If you change a value here, check all callsites before committing — these
 * values are cross-checked against DocuSeal template roles and database
 * enum values.
 */

export const QUOTE_STATUS = {
  DRAFT: "draft",
  GENERATED: "generated",
  SENT: "sent",
  VIEWED: "viewed",
  SIGNED: "signed",
  DECLINED: "declined",
  EXPIRED: "expired",
} as const;

export type QuoteStatus = (typeof QUOTE_STATUS)[keyof typeof QUOTE_STATUS];

export const DEAL_STAGE_PROPOSAL_FLOW = {
  OPPORTUNITY: "opportunity",
  GENERATING_PROPOSAL: "generating-proposal",
  PROPOSAL_SENT: "proposal-sent",
  WON: "won",
  LOST: "lost",
} as const;

/**
 * DocuSeal template roles. These strings must match the role names
 * configured in the DocuSeal template dashboard — if you change them here
 * you also need to update the template, otherwise submission creation
 * will silently fail with "role not found".
 */
export const DOCUSEAL_ROLE = {
  AXONA: "Axona Digital AB",
  CLIENT: "First Party",
} as const;

/**
 * Pipeline step names. Used both by pipelineLogger (for quote_pipeline_steps
 * rows) and future UI consumers. Adding a new step? Add it here first.
 */
export const PIPELINE_STEP = {
  VALIDATE_DEAL: "validate_deal",
  CREATE_QUOTE: "create_quote",
  GENERATE_TEXT: "generate_text",
  NORMALIZE_SECTIONS: "normalize_sections",
  GENERATE_PDF: "generate_pdf",
  DISCORD_NOTIFY: "discord_notify",
  APPROVE_PROPOSAL: "approve_proposal",
  DOCUSEAL_SUBMIT: "docuseal_submit",
  SEND_EMAIL: "send_email",
  WEBHOOK_SIGNED: "webhook_signed",
} as const;

export type PipelineStepName =
  (typeof PIPELINE_STEP)[keyof typeof PIPELINE_STEP];
