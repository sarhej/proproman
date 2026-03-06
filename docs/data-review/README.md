# Data Review – Co je potřeba doplnit v DrD Hub

## Kontext

Při přípravě seed dat z workshopových dokumentů byly některé informace převzaty přímo z podkladů a jiné byly **odhadnuty AI** nebo **zcela vymyšleny**. Tento dokument jasně rozlišuje, co je reálné a co je potřeba ověřit a doplnit.

> ⚠️ **Důležité:** Dokud se tento review neprovede, aplikace obsahuje směs reálných a simulovaných dat. Číselné hodnoty (ARR, KPI, rozpočty) a datumy **nejsou produkční** – slouží pouze jako placeholder, aby aplikace vypadala živě.

---

## Kompletní přehled dat: Co je reálné vs. simulované

### ✅ Z dokumentů (důvěryhodné)

| Datový bod | Zdroj |
|---|---|
| **Názvy iniciativ** | `Priority.xlsx` + jednotlivé `.docx` |
| **Vlastníci iniciativ** | `Priority.xlsx` (David, Kuba, Nelča, Adéla, Vašek, Ondra, Martina…) |
| **Přiřazení do pilířů/domén** | `Priority.xlsx` – pilíře z workshopu v Kalhově |
| **Popisy iniciativ** | Texty z jednotlivých `.docx` (Popis priority) |
| **Kritéria úspěchu (text)** | `.docx` – sekce "Jak poznáme, že se to povedlo?" |
| **Rizika (text, pravděpodobnost, dopad)** | `.docx` – sekce "Potenciální překážky a rizika" |
| **Akční plány / milníky (text)** | `.docx` – sekce "Akční plán (První 3 kroky)" |
| **Rozhodovatelé (text)** | `.docx` – sekce "Kdo o tom rozhoduje?" |
| **Uživatelé** | Priority.xlsx + dokumenty (jména, přiřazení) |
| **Produkty** | Dr Digital App, B2B Platforma, Integrační platforma |
| **Domény (pilíře)** | Klient, Tržby, Nad rámec obvyklého, B2B, Tech lídr, Compliance, Platforma |
| **Persony** | Pacient, Lékař, Zaměstnavatel, Pojišťovna, B2B Admin, Regulátor |
| **Revenue streamy** | B2B, B2G2C, B2C, Pojištění, B2B2C |
| **Názvy účtů (Accounts)** | Uniqa, OZP, UNION SK, PwC CZ+SK, Magistrát Praha, Znojmo |
| **Názvy partnerů** | Broker Trust, Eurocross, Lesensky.cz, Daktela, Adriana Boďová |
| **Názvy poptávek (Demands)** | Odvozeny z kontextu dokumentů |
| **Názvy rozhodnutí (Decisions)** | Z workshopových zápisů |

### ⚠️ Odhadnuté AI (potřeba ověřit)

| Datový bod | Současný stav | Co je potřeba udělat |
|---|---|---|
| **Priorita (P0–P3)** | AI odhad na základě pořadí v tabulce | Vlastník potvrdí/změní |
| **Horizont (Teď/Další/Později)** | AI odhad na základě tónu dokumentů | Doplnit reálný horizont |
| **Status (Nápad/Plánováno/Probíhá)** | AI odhad | Aktualizovat na reálný stav |
| **Komerční typ** | AI odhad | Ověřit/upravit |
| **Jistota datumu** | AI odhad | Aktualizovat |
| **Fáze obchodu, Strategická úroveň** | AI odhad | Ověřit |
| **RACI alokace (%)** | AI odhad | Doplnit reálné % alokace |
| **Features – detailní requirements** | Rozvedené z obecného popisu | Ověřit a doplnit |
| **Milníky – konkrétní datumy** | AI odhad | Doplnit reálné termíny |
| **Milníky – statusy** | AI odhad | Aktualizovat reálný stav |
| **Stakeholders** | AI odhad rolí a typů | Doplnit reálné stakeholdery |
| **Závislosti (Dependencies)** | Logické odvození | Ověřit |
| **Partneři – některé názvy** | Infermedica, Kardi AI, Vitapharma – odhadnuty | Ověřit, zda jsou reální partneři |

### ❌ Zcela vymyšlené (nutné nahradit reálnými daty)

| Datový bod | Současný stav |
|---|---|
| **Dopad na persony (1–5)** | Kompletně vymyšlené hodnoty |
| **Přiřazení tržeb (%)** | Kompletně vymyšlené procentní rozdělení |
| **Dopad na ARR (Kč)** | Vymyšlené číselné hodnoty |
| **Všechny datumy (start, cíl, milník)** | Vymyšlené – odpovídají logice, ale nejsou z reálného plánu |
| **KPI cílové hodnoty** | Vymyšlené |
| **KPI aktuální hodnoty** | Vymyšlené |
| **KPI cílové datumy** | Vymyšlené – nastaveny na datum cíle iniciativy |

---

## 📊 Kampaně (Campaigns) – POZOR: zcela odvozené

V aplikaci jsou **4 kampaně**. Žádná z nich není přímo z dokumentů. Byly **syntetizovány** z kontextu iniciativ:

| Kampaň | Typ | Rozpočet | Stav |
|---|---|---|---|
| Znojmo, buď zdravější | Event | 15 000 Kč | 🔴 VYMYŠLENÉ |
| PwC Dny zdraví | Partnerský cobranding | 20 000 Kč | 🔴 VYMYŠLENÉ |
| B2B LinkedIn a PR kampaň | Spuštění produktu | 48 000 Kč | 🔴 VYMYŠLENÉ |
| UNIQA Dny pro obchodní partnery | Event | 10 000 Kč | 🔴 VYMYŠLENÉ |

**Co je reálné:** Názvy kampaní vychází z kontextu iniciativ (Znojmo je zmíněno v B2G2C, PwC v B2B, UNIQA v Eurocross).
**Co je vymyšlené:** Rozpočty, datumy, statusy, typy – vše simulované. Také 6 přiřazených **Assetů** (prezentace, landing pages, content kalendář) je vymyšlených.

> **Kdo ověří:** Nelča (marketing) + Adéla (B2G2C, B2B) + Ondra (UNIQA/Eurocross)

---

## 🏢 Účty (Accounts) – názvy reálné, čísla vymyšlená

| Účet | Typ | Segment | ARR | Stav |
|---|---|---|---|---|
| Uniqa pojištění cizinců | Pojistitel | Pojištění cizinců | 500 000 Kč | 🔴 ARR vymyšlené |
| OZP | Pojistitel | ZP CZ | 350 000 Kč | 🔴 ARR vymyšlené |
| UNION pojišťovna SK | Pojistitel | ZP SK | 200 000 Kč | 🔴 ARR vymyšlené |
| PwC Česká republika | Zaměstnavatel | Enterprise | 180 000 Kč | 🔴 ARR vymyšlené |
| PwC Slovensko | Zaměstnavatel | Enterprise SK | 120 000 Kč | 🔴 ARR vymyšlené |
| Magistrát hl. m. Prahy | B2G2C | Státní správa | 400 000 Kč | 🔴 ARR vymyšlené |
| Znojmo (město) | B2G2C | Municipalita | 150 000 Kč | 🔴 ARR vymyšlené |

**Co je reálné:** Názvy, typy, segmenty – z dokumentů.
**Co je vymyšlené:** ARR hodnoty, fáze obchodu (dealStage), strategická úroveň (strategicTier).

> **Kdo ověří:** Ondra (pojišťovny) + Adéla (PwC, B2G2C) + Vašek (potenciální další účty)

---

## 🤝 Partneři (Partners) – většina reálná

| Partner | Druh | Reálný? |
|---|---|---|
| Broker Trust | Makléřská společnost | ✅ Z dokumentů |
| Eurocross | Asistenční služby | ✅ Z dokumentů |
| Lesensky.cz | PR agentura | ✅ Z dokumentů |
| Daktela | Telefonní platforma | ✅ Z dokumentů |
| Adriana Boďová | Grafický design | ✅ Z dokumentů |
| Infermedica | Symptom checker a triáž | ⚠️ Odvozeno – ověřit |
| Kardi AI | Kardiologická AI triáž | ⚠️ Odvozeno – ověřit |
| Vitapharma | Lékové konzultace | ⚠️ Odvozeno – ověřit |

> **Kdo ověří:** Ondra (Eurocross, Daktela) + Vašek (Broker Trust) + David/Kuba (tech partneři – Infermedica, Kardi AI, Vitapharma)

---

## 📋 Poptávky (Demands) – názvy reálné

| Poptávka | Zdroj | Stav |
|---|---|---|
| Uniqa: nahrazení Eurocross | Account | ✅ Z dokumentů |
| OZP: smlouva na internu a dermatologii | Account | ✅ Z dokumentů |
| UNION SK: smlouva na internu a dermatologii | Account | ✅ Z dokumentů |
| Broker Trust: zasmluvnění a distribuce | Partner | ✅ Z dokumentů |
| B2G2C: pozitivní mediální obraz po Znojmu | Interní | ✅ Z dokumentů |
| PwC CZ+SK: reference a case study | Account | ✅ Z dokumentů |

**Co je vymyšlené:** Status, urgence, konkrétní propojení. Žádná čísla v Demands.

> **Kdo ověří:** Ondra (pojišťovny) + Adéla (PwC, B2G2C) + Vašek (Broker Trust)

---

## Jak postupovat

### Krok 1: Iniciativy (hlavní priorita)
1. **Každý vlastník** si přečte svůj úkolový list (`JMÉNO.md` – viz tabulka níže)
2. V DrD Hub (`http://localhost:5173`) otevře své iniciativy
3. Projde **červeně označené** položky a doplní reálná data
4. Nově: zkontrolujte záložky **Milníky**, **KPI** (+ cílové datumy!) a **Stakeholders**

### Krok 2: Společné entity (sekundární priorita)
5. **Ondra + Adéla:** Ověří Accounts – ARR, fáze obchodu, strategie
6. **Ondra + Vašek + David/Kuba:** Ověří Partners – zejména tech partnery
7. **Nelča + Adéla + Ondra:** Ověří Campaigns – rozpočty, datumy, typ, přidají reálné kampaně
8. **Všichni:** Zkontrolují Demands propojené s jejich iniciativami

### Krok 3: Notifikace
9. Po doplnění informujte tým

---

## Persony pro hodnocení dopadu (1–5)

| Skóre | Význam |
|---|---|
| 1 | Minimální / žádný dopad |
| 2 | Nízký dopad |
| 3 | Střední dopad |
| 4 | Vysoký dopad |
| 5 | Kritický dopad |

**6 person k ohodnocení:**
- **Pacient** – koncový uživatel služby
- **Lékař** – poskytovatel péče
- **Zaměstnavatel** – B2B klient kupující službu pro zaměstnance
- **Pojišťovna** – plátce / partner
- **Regulátor** – ČNB, SÚKL, legislativa
- **B2B Admin** – administrátor na straně B2B klienta

## Revenue streamy pro přiřazení tržeb

Součet musí být **100 %** pro každou iniciativu:

- **B2B** – přímý prodej firmám
- **B2G2C** – přes orgány státní správy k občanům
- **B2C** – přímý prodej koncovým uživatelům
- **Pojištění** – úhrady od pojišťoven
- **B2B2C** – přes makléře / zprostředkovatele

---

## Úkolové listy podle vlastníků

| Vlastník | Soubor | Iniciativy | Společné entity k ověření |
|---|---|---|---|
| David | [`DAVID.md`](./DAVID.md) | Webové rozhraní | Tech partneři (Infermedica, Kardi AI, Vitapharma) |
| Jakub Justra (Kuba) | [`KUBA.md`](./KUBA.md) | Skupina Rodina, Checklist, Med. guidelines | Tech partneři |
| Nela Mataseje (Nelča) | [`NELCA.md`](./NELCA.md) | Klinika plná lidí, Za hranice, Marketing B2B | Kampaně (rozpočty, datumy) |
| Adéla Hloušková | [`ADELA.md`](./ADELA.md) | B2G2C (kraje), 20 firem (B2B) | Účty (PwC, B2G2C), Kampaně |
| Václav Černý (Vašek) | [`VASEK.md`](./VASEK.md) | Distribuce přes telco, B2B2C (makléři) | Partner Broker Trust, Účty |
| Ondřej Svoboda (Ondra) | [`ONDRA.md`](./ONDRA.md) | Úhrady z pojišťoven, Nahradit Eurocross | Účty (pojišťovny), Partners (Eurocross, Daktela), Kampaně (UNIQA) |
