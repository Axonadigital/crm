/**
 * A generic, reusable Fortnox article for contract rows.
 *
 * Regular invoice rows work as free text (Description + AccountNumber, no
 * article) — but Fortnox rejected that same shape on `/3/contracts` with
 * "Feature inte tillgänglig", which live-testing traced to the row missing an
 * ArticleNumber (contracts, unlike one-off invoices, seem to require one).
 * Rather than make the user create an article by hand in Fortnox, this
 * ensures one exists via the API the same way `ensureFortnoxCustomer` does:
 * look up by a fixed, self-assigned number, create it once if missing.
 */
import type { FortnoxClient } from "./client.ts";
import { FortnoxError } from "./errors.ts";
import { DEFAULT_SALES_ACCOUNT } from "./customers.ts";

export const CONTRACT_ARTICLE_NUMBER = "AVTAL";

type FortnoxArticlePayload = {
  ArticleNumber: string;
  Description: string;
  SalesAccount: number;
};

async function articleExists(
  client: FortnoxClient,
  articleNumber: string,
): Promise<boolean> {
  try {
    await client.get(`/3/articles/${encodeURIComponent(articleNumber)}`);
    return true;
  } catch (error) {
    if (error instanceof FortnoxError && error.status === 404) return false;
    throw error;
  }
}

/**
 * Returns the article number to put on a contract row, creating the shared
 * article on first use. Idempotent: a second call just finds it.
 */
export async function ensureContractArticle(
  client: FortnoxClient,
): Promise<string> {
  if (await articleExists(client, CONTRACT_ARTICLE_NUMBER)) {
    return CONTRACT_ARTICLE_NUMBER;
  }

  const payload: FortnoxArticlePayload = {
    ArticleNumber: CONTRACT_ARTICLE_NUMBER,
    Description: "Avtalsfakturering",
    SalesAccount: DEFAULT_SALES_ACCOUNT,
  };

  await client.post("/3/articles", { Article: payload });
  return CONTRACT_ARTICLE_NUMBER;
}
