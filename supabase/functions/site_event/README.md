# site_event — förfrågningar och samtal från kundsajterna

Resultatkortet i outreach-flödet och månadsrapporten får bara nämna det vi
mätt. Visningar och klick kommer från Search Console. Förfrågningar och
samtal kommer härifrån: sajten postar en händelse när ett formulär skickas
eller någon trycker på ett telefonnummer.

## 1. Skapa en nyckel för kunden

I CRM:ets databas (eller via SQL-editorn):

```sql
insert into site_event_keys (company_id, label) values (123, 'nimoz.se') returning key;
```

Nyckeln är inte hemlig. Den pekar bara ut företaget.

## 2. Lägg in snippeten på sajten

Fungerar på alla sajter vi bygger (Next.js, Vite, Wix-embed). Byt `NYCKEL`.

```html
<script>
(function () {
  var KEY = "NYCKEL";
  var URL = "https://hgyusrlrzdahucljvqsz.supabase.co/functions/v1/site_event";
  function send(kind) {
    try {
      var body = JSON.stringify({ key: KEY, kind: kind, page: location.pathname });
      if (navigator.sendBeacon) navigator.sendBeacon(URL, body);
      else fetch(URL, { method: "POST", body: body, keepalive: true });
    } catch (e) {}
  }
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest && e.target.closest("a[href^='tel:'], a[href^='mailto:']");
    if (a) send(a.getAttribute("href").indexOf("tel:") === 0 ? "call" : "email");
  }, true);
  window.axonaEvent = send; // anropa axonaEvent("form") när formuläret gått iväg
})();
</script>
```

I ett Next.js-formulär: efter lyckat svar från `/api/lead`, kör
`window.axonaEvent?.("form")`. Bara vid lyckat svar — ett fel är ingen
förfrågan.

## 3. Vad som händer sedan

- `site_events` får en rad per händelse (typ, sida, tidpunkt).
- `analyze_website` summerar perioden till `website_snapshots.engagement`
  när företaget har en aktiv nyckel. Saknas nyckel blir kolumnen `null`,
  vilket betyder "omätt", inte "noll".
- Månadsrapportens mått får `inquiries` och `calls` (samtal = tel:-klick på
  sajten + samtalsklick på Google-profilen ur `gbp_actions`).
- Resultatkortet i steg 3 och paketmejlet nämner förfrågningar och samtal
  bara när de finns i referenskundens senaste rapport.

Dygnstak: 500 händelser per företag och dygn (429 därefter).
