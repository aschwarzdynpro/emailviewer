# EmailViewer PCF Control

PCF (PowerApps Component Framework) Control zur Anzeige archivierter Buchungsbestätigungs-E-Mails in Dynamics 365 CE Formularen.

## Architektur

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  PCF Control │────▶│ Dataverse Custom  │────▶│  Azure Function  │────▶│ Externes Archiv │
│ (EmailViewer)│◀────│     Action        │◀────│  HTTP Trigger    │◀────│  (API / IMAP)   │
└──────────────┘     └──────────────────┘     └──────────────────┘     └─────────────────┘
```

**Datenfluss:**
1. PCF Control wird im Reise-/Auftragsformular geladen
2. Referenznummer (Reise-/Auftragsnummer) wird als Eingabeparameter übergeben
3. Control ruft eine Dataverse Custom Action auf
4. Custom Action leitet die Anfrage an eine Azure Function weiter
5. Azure Function fragt das externe Archivsystem ab (API/IMAP)
6. Ergebnisse werden als Liste im Control angezeigt
7. Einzelne E-Mails können als MSG/EML heruntergeladen werden

## Funktionen

- Auflistung archivierter E-Mails mit Datum, Richtung (Kunde/Veranstalter), Absender und Betreff
- Sortierung nach allen Spalten
- Paginierung für große Ergebnismengen
- Download einzelner E-Mails als .eml oder .msg (inkl. Anhänge)
- Anzeige von Anhang-Informationen
- Deutsche und englische Lokalisierung
- Fluent UI Design (Dynamics 365 Designsprache)

## Voraussetzungen

- Node.js >= 18
- Power Platform CLI (`pac`)
- npm

## Setup & Entwicklung

```bash
# Abhängigkeiten installieren
npm install

# Entwicklungsserver starten (PCF Test Harness)
npm start

# Mit Watch-Mode
npm run start:watch

# Build
npm run build
```

## Konfiguration im Formular

Das Control wird an ein Textfeld mit der Reise-/Auftragsnummer gebunden:

| Eigenschaft | Beschreibung | Pflicht |
|---|---|---|
| `referenceNumber` | Feld mit der Reise-/Auftragsnummer | Ja |
| `entityLogicalName` | Logischer Name der Entität | Nein |
| `customActionName` | Name der Custom Action (Standard: `dynpro_GetArchivedEmails`) | Nein |
| `pageSize` | Einträge pro Seite (Standard: 25) | Nein |

## Azure-Ressourcen

Folgende Azure-Ressourcen werden benötigt:

| Ressource | Zweck |
|---|---|
| **Azure Function** | HTTP Trigger als Proxy zum Archivsystem |
| **Key Vault** | Sichere Speicherung von API-Keys/Zugangsdaten |
| **App Registration** | Authentifizierung zwischen D365 und Azure Function |
| **Log Analytics** | Monitoring und Fehlerprotokollierung |
| **Blob Storage** | Optional: Caching von häufig abgerufenen E-Mails |

## Custom Actions

### `dynpro_GetArchivedEmails` (Suche)

**Input-Parameter:**
- `ReferenceNumber` (String) - Reise-/Auftragsnummer
- `Page` (Int32) - Seitennummer
- `PageSize` (Int32) - Einträge pro Seite
- `SortBy` (String) - Sortierfeld (date, subject, from, direction)
- `SortDirection` (String) - Sortierrichtung (asc, desc)

**Output-Parameter:**
- `Emails` (String/JSON) - Liste der gefundenen E-Mails
- `TotalCount` (Int32) - Gesamtanzahl der Ergebnisse

### `dynpro_GetArchivedEmails_Download` (Download)

**Input-Parameter:**
- `EmailId` (String) - ID der E-Mail im Archiv
- `Format` (String) - Gewünschtes Format (eml, msg)

**Output-Parameter:**
- `FileContent` (String) - Base64-kodierter Dateiinhalt
- `FileName` (String) - Dateiname
- `MimeType` (String) - MIME-Typ

## Projektstruktur

```
EmailViewerControl/
├── ControlManifest.Input.xml   # PCF Manifest
├── index.ts                    # PCF Entry Point (ReactControl)
├── types.ts                    # TypeScript Interfaces & Enums
├── EmailViewerApp.tsx          # Haupt-React-Komponente (State Management)
├── components/
│   ├── EmailList.tsx           # Tabellen-Layout mit Sortierung & Paginierung
│   └── EmailRow.tsx            # Einzelne E-Mail-Zeile mit Download
├── services/
│   └── ArchiveService.ts       # Kommunikation mit Dataverse Custom Action
├── css/
│   └── EmailViewer.css         # Styles (Fluent UI Design)
└── strings/
    ├── EmailViewer.1031.resx   # Deutsche Lokalisierung
    └── EmailViewer.1033.resx   # Englische Lokalisierung
```

## Deployment

```bash
# Solution-Projekt erstellen
pac solution init --publisher-name DynPro --publisher-prefix dynpro

# PCF-Referenz hinzufügen
pac solution add-reference --path .

# Solution bauen
msbuild /t:build /restore

# Solution in D365 importieren
pac solution import --path bin/Debug/EmailViewerSolution.zip
```
