/**
 * Resolves once an element matching `selector` exists in the DOM, or after
 * `timeoutMs` (whichever comes first). Used before starting a page-scoped tour
 * so driver.js has a real element to highlight even when the page is still
 * fetching data on first render.
 *
 * Returns the matched element, or `null` if the timeout elapsed first.
 */
export function waitForElement(
  selector: string,
  timeoutMs = 4000,
): Promise<Element | null> {
  const existing = document.querySelector(selector);
  if (existing) {
    return Promise.resolve(existing);
  }

  return new Promise((resolve) => {
    let settled = false;

    const finish = (el: Element | null) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearTimeout(timer);
      resolve(el);
    };

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        finish(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    const timer = setTimeout(
      () => finish(document.querySelector(selector)),
      timeoutMs,
    );
  });
}
