# Kundspecifik outreach v4

Sex nya valbara mallar: hemsida, egen hemsida och arbetsflöde, med en uppföljning vardera. Befintliga mallar och sekvensinställningar behålls. Ingen utskicksvolym eller aktivering ändras.

## Vad personaliseringen använder

- Företagets namn och domän.
- Faktiska rankade scan-fynd för hemsidemejlen. Observationen tillskrivs uttryckligen det automatiska testet; den är inte bevis för tappade kunder eller omsättning.
- Bransch för relevant kontaktväg, sidupplägg och exempel på arbetsflöde.
- Saknas scan-fynd eller domän får hemsidemallen ingen observationsvariabel och stoppas av den befintliga renderingskontrollen.
- Saknas känt segment blockeras systemmallen. Hemsidemallarna använder då ett neutralt erbjudande.
- Uppföljningen fungerar med endast ett fynd och hittar inte på ett andra.

Bransch är en hypotes om vad som kan vara relevant. Vi vet ännu inte vilka system kunden använder eller var deras arbete tar tid. Systemmejlet frågar därför om det och föreslår ett möjligt upplägg. Lägg inte in påståenden om manuellt arbete, personalstorlek, tjänster eller besparingar utan kontrollerad källa.

## Införande

1. Deploya `process_sequences` med den nya hjälpfunktionen före migrationen används i utskick.
2. Kör migration `20260911160000_personalized_outreach_templates.sql`. Den skapar sex mallar med namn som börjar med `Personlig v4:` och kopplar inte om sekvenser.
3. Granska hela renderade mejl för ett urval verkliga leads från varje segment. Kontrollera företagsidentitet, domän, relevansen i fyndet och erbjudandet. Den befintliga torrlägesloggen visar bara en del av brödtexten och kan återanvända en gammal preview.
4. Välj båda v4-mallarna i rätt sekvens inför en ny kohort. Blanda inte nya första mejl med gamla uppföljningar mitt i en aktiv kohort.
5. För varje positivt svar: utse ansvarig som faktiskt tar fram det kostnadsfria ändringsförslaget eller upplägget. Boka möte efter att kunden sett värdet eller när mer information behövs.

## Mätning

Behandla detta som en hypotes om bättre relevans, inte ett löfte om högre konvertering. Jämför liknande kundgrupper och ändra en huvudvinkel åt gången. Mät positiva svar per unik kontakt, kvalificerade genomförda möten, affärer och tiden det tar att leverera gratisunderlaget. Separera autosvar, avböjanden och avregistreringar från positiva svar. Håll uppföljningsfönstret lika mellan grupperna.

## Exempel med påhittad kund och testdata

Ämne: En sak på hemsidan för Exempelbygg AB

Hej!

I vårt automatiska test av exempelbygg.se flaggades: "En kontaktlänk fungerar inte".

Jag kan skicka ett konkret ändringsförslag med fokus på att göra det enkelt att se tidigare projekt och be om en offert. Då har ni något att bedöma eller lämna vidare till er webbleverantör.

Vill du att jag skickar det? Det kostar inget.

Säg till om du inte vill ha fler mejl från mig.
