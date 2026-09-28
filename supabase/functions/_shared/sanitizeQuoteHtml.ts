/**
 * Sanitization helpers for quote HTML artifacts.
 *
 * The quote pipeline stores rendered HTML in two roles:
 *  1. Editable HTML — lives in `quotes.html_content`, MAY contain a real
 *     `window.QUOTE_WRITE_TOKEN` value so the internal WYSIWYG editor
 *     can authenticate against `save_quote_edits`.
 *  2. Public HTML — uploaded to Supabase Storage and exposed via
 *     `quotes.pdf_url`, also served by `serve_quote`. Must NEVER contain
 *     a real editor token. Customers (and anyone with the URL) get this
 *     variant, and it must be safe to share.
 *
 * `generate_quote_pdf` builds the editable HTML first, then derives the
 * public variant by running it through `stripWriteTokenFromHtml`. The
 * two variants are written to different storage locations so the security
 * domains stay separated at the artifact level, not only at the request
 * boundary.
 *
 * `serve_quote` also runs the strip on read as defense in depth — legacy
 * quotes written before this helper existed may still carry raw tokens
 * in the stored HTML and we want the response path to be safe even if
 * the storage path is not.
 */

/**
 * Replace every `window.QUOTE_WRITE_TOKEN = "..."` assignment with an
 * empty-string assignment. Matches both single- and double-quoted
 * literals so it is robust against either injection format used by
 * `generate_quote_pdf` now or historically.
 *
 * The replacement preserves the assignment so the editor script that
 * reads `window.QUOTE_WRITE_TOKEN` gets an empty string rather than
 * undefined — that keeps the script's early-return guard simple.
 *
 * Non-destructive: does not touch any other JS or HTML in the input.
 */
export function stripWriteTokenFromHtml(html: string): string {
  return html.replace(
    /window\.QUOTE_WRITE_TOKEN\s*=\s*["'][^"']*["'];?/g,
    'window.QUOTE_WRITE_TOKEN = "";',
  );
}
