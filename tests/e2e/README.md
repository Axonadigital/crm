# Playwright E2E

Det här spåret täcker de mest affärskritiska desktop-flödena i demo/fakerest-läget:

- appstart och login
- skapa och visa kontakt
- skapa och visa företag
- skapa och uppdatera deal
- grundläggande navigation mellan Dashboard, Contacts, Companies och Deals

## Körning

Playwright startar demo-appen automatiskt via `webServer` i
[playwright.config.ts](/home/rasmusai/projects/Axona%20Intern/crm/playwright.config.ts).
Under E2E-körning sätts `VITE_E2E_DISABLE_AUTO_LOGIN=true` så att login-vyn går
att testa, men vanligt demo-beteende utanför tester förblir oförändrat.

Kör lokalt:

```bash
npm run test:e2e
```

Kör headed:

```bash
npm run test:e2e:headed
```

CI-vänlig variant:

```bash
npm run test:e2e:ci
```

## Noteringar

- E2E-testerna använder demo/fakerest och verifierar sparade ändringar inom en
  pågående appsession. De förutsätter inte persistent backend mellan fulla
  browser-reloads.
- Befintligt [tests/mobile-layout-check.ts](/home/rasmusai/projects/Axona%20Intern/crm/tests/mobile-layout-check.ts)
  är ett separat mobile-layout-spår och ingår inte i den här affärskritiska
  E2E-sviten.
- Quote/offert-flödet är medvetet exkluderat i v1. Demo-läget blockeras idag av
  att fakerest-provider saknar `expireOverdueQuotes`, vilket gör quotes-sidan
  instabil för E2E innan själva flödet ens kan startas.
