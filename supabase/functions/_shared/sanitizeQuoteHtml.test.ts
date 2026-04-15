import { describe, expect, it } from "vitest";
import { stripWriteTokenFromHtml } from "./sanitizeQuoteHtml.ts";

describe("stripWriteTokenFromHtml", () => {
  it("strips a double-quoted assignment", () => {
    const input = '<script>window.QUOTE_WRITE_TOKEN="abc-123";</script>';
    expect(stripWriteTokenFromHtml(input)).toBe(
      '<script>window.QUOTE_WRITE_TOKEN = "";</script>',
    );
  });

  it("strips a single-quoted assignment", () => {
    const input = "<script>window.QUOTE_WRITE_TOKEN='abc-123';</script>";
    expect(stripWriteTokenFromHtml(input)).toBe(
      '<script>window.QUOTE_WRITE_TOKEN = "";</script>',
    );
  });

  it("strips a UUID-shaped token value", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    const input = `window.QUOTE_WRITE_TOKEN="${uuid}";`;
    const result = stripWriteTokenFromHtml(input);
    expect(result).toBe('window.QUOTE_WRITE_TOKEN = "";');
    expect(result).not.toContain(uuid);
  });

  it("strips every occurrence when the token is assigned more than once", () => {
    const input = [
      'window.QUOTE_WRITE_TOKEN="first-token";',
      'window.QUOTE_WRITE_TOKEN="second-token";',
    ].join("\n");

    const result = stripWriteTokenFromHtml(input);

    expect(result).not.toContain("first-token");
    expect(result).not.toContain("second-token");
    expect(result.match(/window\.QUOTE_WRITE_TOKEN = "";/g)?.length ?? 0).toBe(
      2,
    );
  });

  it("handles an already-empty assignment idempotently", () => {
    const input = 'window.QUOTE_WRITE_TOKEN="";';
    expect(stripWriteTokenFromHtml(input)).toBe(
      'window.QUOTE_WRITE_TOKEN = "";',
    );
  });

  it("tolerates whitespace around the equals sign", () => {
    const input = 'window.QUOTE_WRITE_TOKEN   =   "padded-token";';
    expect(stripWriteTokenFromHtml(input)).toBe(
      'window.QUOTE_WRITE_TOKEN = "";',
    );
  });

  it("tolerates a missing trailing semicolon (normalizes to semicolon form)", () => {
    const input = 'window.QUOTE_WRITE_TOKEN="no-semi"';
    // The replacement always emits the safer `... = "";` form regardless of
    // whether the input had a trailing semicolon. The critical guarantee is
    // that the real token value is gone.
    const result = stripWriteTokenFromHtml(input);
    expect(result).not.toContain("no-semi");
    expect(result).toContain('window.QUOTE_WRITE_TOKEN = "";');
  });

  it("does not touch other JavaScript in the document", () => {
    const input = `
      const otherVar = "keep-me";
      window.QUOTE_WRITE_TOKEN="secret";
      console.log(otherVar);
      function myFunc() { return "hello"; }
    `;
    const result = stripWriteTokenFromHtml(input);

    expect(result).toContain('const otherVar = "keep-me"');
    expect(result).toContain("console.log(otherVar)");
    expect(result).toContain('function myFunc() { return "hello"; }');
    expect(result).not.toContain("secret");
  });

  it("does not touch other window.* assignments", () => {
    const input = [
      'window.QUOTE_ID = "42";',
      'window.QUOTE_WRITE_TOKEN="secret";',
      'window.SOMETHING_ELSE = "keep";',
    ].join("\n");

    const result = stripWriteTokenFromHtml(input);

    expect(result).toContain('window.QUOTE_ID = "42";');
    expect(result).toContain('window.SOMETHING_ELSE = "keep";');
    expect(result).not.toContain("secret");
  });

  it("preserves HTML structure around the assignment", () => {
    const input = `<!DOCTYPE html>
<html>
  <head><title>Quote 42</title></head>
  <body>
    <h1>Offert</h1>
    <script>
      window.QUOTE_WRITE_TOKEN="leaked-token";
      initEditor();
    </script>
  </body>
</html>`;

    const result = stripWriteTokenFromHtml(input);

    expect(result).toContain("<!DOCTYPE html>");
    expect(result).toContain("<h1>Offert</h1>");
    expect(result).toContain("initEditor()");
    expect(result).not.toContain("leaked-token");
    expect(result).toContain('window.QUOTE_WRITE_TOKEN = "";');
  });

  it("returns input unchanged when the token assignment is absent", () => {
    const input = "<script>console.log('no token here');</script>";
    expect(stripWriteTokenFromHtml(input)).toBe(input);
  });
});
