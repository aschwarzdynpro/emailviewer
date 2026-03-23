# Setup-Anleitung: EmailViewer Backend

## Übersicht

```
┌─────────┐    ┌──────────────────┐    ┌──────────────────┐    ┌────────────────┐    ┌──────────────┐
│ PCF     │───▶│ Custom Action    │───▶│ Power Automate   │───▶│ Custom         │───▶│ Externes     │
│ Control │◀───│ (Dataverse)      │◀───│ Cloud Flow       │◀───│ Connector      │◀───│ Archiv       │
└─────────┘    └──────────────────┘    └──────────────────┘    └────────────────┘    └──────────────┘
```

**Keine Azure Function nötig** – der Custom Connector kommuniziert direkt mit der Archiv-API.

---

## 1. Custom Connector erstellen

Der Custom Connector kapselt die Archiv-API und verwaltet Authentifizierung (API-Key).

### 1.1 Per Power Platform UI

1. **Power Apps** → Verbindungen → Benutzerdefinierte Connectors → **+ Neuer benutzerdefinierter Connector**
2. **„OpenAPI-Datei importieren"** auswählen
3. Datei `custom-connector/apiDefinition.swagger.json` hochladen
4. **Allgemein**:
   - Name: `E-Mail Archiv`
   - Host: `archive.auftraggeber.de` (tatsächliche URL des Archivsystems)
   - Basis-URL: `/api/v1`
5. **Sicherheit**:
   - Authentifizierungstyp: **API-Key**
   - Parameter-Label: `API-Key`
   - Parameter-Name: `X-API-Key`
   - Parameter-Speicherort: `Header`
6. **Definition**: Die Operationen `SearchEmails` und `DownloadEmail` werden automatisch aus der Swagger-Datei geladen
7. **Testen**: Verbindung erstellen und `SearchEmails` mit einer Test-Referenznummer ausprobieren

### 1.2 Per CLI (paconn)

```bash
# Power Platform Connectors CLI installieren
pip install paconn

# Anmelden
paconn login

# Connector erstellen
paconn create \
  --api-def custom-connector/apiDefinition.swagger.json \
  --api-prop custom-connector/apiProperties.json \
  --environment <ENVIRONMENT_ID>
```

### 1.3 Authentifizierungs-Alternativen

Je nach Archiv-API kann der Custom Connector auch mit anderen Auth-Methoden konfiguriert werden:

| Methode | Wann verwenden |
|---|---|
| **API-Key** (Standard) | Archiv stellt einen statischen API-Key bereit |
| **OAuth 2.0** | Archiv unterstützt OAuth (z.B. Azure AD, eigener IdP) |
| **Basic Auth** | Archiv verwendet Benutzername/Passwort (z.B. IMAP) |

---

## 2. Dataverse Custom Actions erstellen

### 2.1 Custom Action: `dynpro_GetArchivedEmails` (Suche)

In der **Power Platform Solution** erstellen:

1. **Lösung öffnen** → Neues Element → Prozess → Action
2. Konfiguration:

| Feld | Wert |
|---|---|
| **Name** | `GetArchivedEmails` |
| **Eindeutiger Name** | `dynpro_GetArchivedEmails` |
| **Kategorie** | Action |
| **Entität** | Keine (global) |
| **Für Workflows aktiviert** | Nein |

**Eingabeparameter:**

| Name | Typ | Pflicht |
|---|---|---|
| `ReferenceNumber` | String | Ja |
| `Page` | Integer | Ja |
| `PageSize` | Integer | Ja |
| `SortBy` | String | Nein |
| `SortDirection` | String | Nein |

**Ausgabeparameter:**

| Name | Typ |
|---|---|
| `Emails` | String (JSON-serialisierte Liste) |
| `TotalCount` | Integer |
| `Success` | Boolean |
| `ErrorMessage` | String |

### 2.2 Custom Action: `dynpro_GetArchivedEmails_Download`

| Feld | Wert |
|---|---|
| **Name** | `GetArchivedEmails_Download` |
| **Eindeutiger Name** | `dynpro_GetArchivedEmails_Download` |
| **Kategorie** | Action |
| **Entität** | Keine (global) |

**Eingabeparameter:**

| Name | Typ | Pflicht |
|---|---|---|
| `EmailId` | String | Ja |
| `Format` | String | Ja |

**Ausgabeparameter:**

| Name | Typ |
|---|---|
| `FileContent` | String (Base64) |
| `FileName` | String |
| `MimeType` | String |
| `Success` | Boolean |
| `ErrorMessage` | String |

---

## 3. Power Automate Cloud Flows erstellen

Die Flows verbinden die Custom Actions mit dem Custom Connector.
Details siehe [power-automate-flows.md](./power-automate-flows.md).

### 3.1 Flow: Suche

```
Trigger: "When an action is performed" (dynpro_GetArchivedEmails)
    │
    ▼
Compose: Offset berechnen ((Page - 1) * PageSize)
    │
    ▼
Custom Connector: SearchEmails (query, offset, limit, sortBy, sortDirection)
    │
    ▼
Select: Ergebnisse mappen (Direction bestimmen: Kunde/Veranstalter)
    │
    ▼
Respond: Emails (JSON), TotalCount, Success=true
```

### 3.2 Flow: Download

```
Trigger: "When an action is performed" (dynpro_GetArchivedEmails_Download)
    │
    ▼
Custom Connector: DownloadEmail (emailId, format)
    │
    ▼
Respond: FileContent (Base64), FileName, MimeType, Success=true
```

### 3.3 Connection Reference einrichten

Damit die Verbindung pro Umgebung konfigurierbar ist:

1. In der Solution eine **Connection Reference** hinzufügen
2. Typ: `E-Mail Archiv` (Custom Connector)
3. In den Flows diese Connection Reference verwenden (nicht direkt die Verbindung)
4. Beim Import der Solution in andere Umgebungen wird die Verbindung abgefragt

---

## 4. PCF Control im Formular einbinden

### 4.1 Control zur Solution hinzufügen

```bash
npm run build

# Solution erstellen (falls noch nicht vorhanden)
pac solution init \
  --publisher-name DynPro \
  --publisher-prefix dynpro \
  --outputDirectory ./EmailViewerSolution

cd EmailViewerSolution
pac solution add-reference --path ../

# Build
dotnet build
```

### 4.2 Im Formular konfigurieren

1. **Formular-Editor** öffnen (Reise/Auftrag)
2. Feld für die Reise-/Auftragsnummer auswählen (z.B. `dynpro_reisenummer`)
3. **+ Component** → `EmailViewer` auswählen
4. Properties konfigurieren:
   - `referenceNumber` → Feld `dynpro_reisenummer` binden
   - `customActionName` → `dynpro_GetArchivedEmails`
   - `pageSize` → `25`
5. Formular speichern & veröffentlichen

---

## 5. Sicherheit

| Schicht | Maßnahme |
|---|---|
| **PCF → Custom Action** | Dataverse Security Roles (nur autorisierte Benutzer) |
| **Custom Action → Flow** | Flow wird automatisch im Kontext des auslösenden Benutzers ausgeführt |
| **Flow → Custom Connector** | API-Key / OAuth im Connector hinterlegt |
| **Custom Connector → Archiv** | HTTPS-Verschlüsselung, API-Key im Header |

### DLP-Policy beachten

Den Custom Connector in die richtige **Data Loss Prevention (DLP) Policy-Gruppe** einordnen:
- Empfehlung: **Business**-Gruppe (zusammen mit Dataverse, Office 365)
- Nicht in die **Non-Business**-Gruppe, da sonst die Flows blockiert werden

---

## 6. Monitoring

### Flow Run History

1. **Power Automate** → Meine Flows → Flow auswählen → Ausführungsverlauf
2. Fehlgeschlagene Ausführungen analysieren
3. Optional: Alerts einrichten bei wiederholten Fehlern

### Optional: Application Insights

Falls zusätzliches Monitoring gewünscht:

```bash
az monitor app-insights component create \
  --app ai-emailarchive \
  --location westeurope \
  --resource-group rg-emailarchive
```

Custom Connector-Aufrufe können via Power Platform Admin Center → Analytics überwacht werden.

---

## Vergleich: Custom Connector vs. Azure Function

| Kriterium | Custom Connector | Azure Function |
|---|---|---|
| **Azure-Ressourcen** | Keine | Function App, Storage, Key Vault, Managed Identity |
| **Deployment** | Solution-Import | CI/CD Pipeline + Solution-Import |
| **Authentifizierung** | Im Connector konfiguriert | Key Vault + Managed Identity |
| **Latenz** | ~2-5s (Flow-Overhead) | ~0.5-1s (Plugin direkt) |
| **Wartung** | Low-Code (Power Automate) | Pro-Code (C# / .NET) |
| **Flexibilität** | Begrenzt auf API-Mapping | Volle Kontrolle (Caching, Transformation) |
| **Kosten** | Power Automate Lizenz (in D365 enthalten) | Azure Consumption-Kosten |
| **Empfehlung** | Standard-Szenario | Hohe Performance / komplexe Logik nötig |
