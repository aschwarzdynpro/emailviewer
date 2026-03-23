# Setup-Anleitung: EmailViewer Backend

## Übersicht

```
┌─────────┐    ┌───────────────────┐    ┌────────────────┐    ┌──────────────┐
│ PCF     │───▶│ Custom Action     │───▶│ Azure Function │───▶│ Externes     │
│ Control │◀───│ (Dataverse)       │◀───│ HTTP Trigger   │◀───│ Archiv       │
└─────────┘    └───────────────────┘    └────────────────┘    └──────────────┘
                                              │
                                              ▼
                                        ┌────────────┐
                                        │ Key Vault  │
                                        │ (Secrets)  │
                                        └────────────┘
```

---

## 1. Azure-Ressourcen einrichten

### 1.1 Resource Group

```bash
az group create \
  --name rg-emailarchive \
  --location westeurope
```

### 1.2 App Registration (Azure AD)

Die App Registration authentifiziert die Kommunikation zwischen Dataverse und Azure Function.

```bash
# App Registration erstellen
az ad app create \
  --display-name "EmailArchive-D365-Connector" \
  --sign-in-audience AzureADMyOrg

# App ID notieren (wird in Dataverse benötigt)
APP_ID=$(az ad app list --display-name "EmailArchive-D365-Connector" --query "[0].appId" -o tsv)

# Client Secret erstellen
az ad app credential reset --id $APP_ID --years 2
# → Client Secret notieren!

# Service Principal erstellen
az ad sp create --id $APP_ID
```

**Benötigte API-Berechtigungen:**
- Keine Graph-API-Berechtigungen nötig
- Die Function wird über Function Key + Azure AD abgesichert

### 1.3 Key Vault

```bash
# Key Vault erstellen
az keyvault create \
  --name kv-emailarchive \
  --resource-group rg-emailarchive \
  --location westeurope

# Secrets anlegen
az keyvault secret set \
  --vault-name kv-emailarchive \
  --name "archive-api-key" \
  --value "<API-KEY-VOM-AUFTRAGGEBER>"

# Optional: IMAP-Credentials
az keyvault secret set \
  --vault-name kv-emailarchive \
  --name "archive-imap-password" \
  --value "<IMAP-PASSWORT>"
```

### 1.4 Azure Function App

```bash
# Storage Account für Function
az storage account create \
  --name stemailarchivefunc \
  --resource-group rg-emailarchive \
  --location westeurope \
  --sku Standard_LRS

# Function App erstellen (.NET 8 Isolated)
az functionapp create \
  --name func-emailarchive \
  --resource-group rg-emailarchive \
  --storage-account stemailarchivefunc \
  --consumption-plan-location westeurope \
  --runtime dotnet-isolated \
  --runtime-version 8 \
  --functions-version 4 \
  --os-type Linux

# Managed Identity aktivieren
az functionapp identity assign \
  --name func-emailarchive \
  --resource-group rg-emailarchive

# Managed Identity ID abrufen
IDENTITY_ID=$(az functionapp identity show \
  --name func-emailarchive \
  --resource-group rg-emailarchive \
  --query principalId -o tsv)

# Key Vault-Zugriff für Managed Identity
az keyvault set-policy \
  --name kv-emailarchive \
  --object-id $IDENTITY_ID \
  --secret-permissions get list

# App Settings konfigurieren
az functionapp config appsettings set \
  --name func-emailarchive \
  --resource-group rg-emailarchive \
  --settings \
    "ARCHIVE_API_URL=https://archive.auftraggeber.de/api/v1" \
    "KEY_VAULT_URL=https://kv-emailarchive.vault.azure.net/" \
    "ORGANIZER_DOMAINS=@veranstalter1.de,@veranstalter2.com"
```

### 1.5 Log Analytics (Monitoring)

```bash
# Log Analytics Workspace
az monitor log-analytics workspace create \
  --resource-group rg-emailarchive \
  --workspace-name law-emailarchive \
  --location westeurope

# Application Insights verbinden
az monitor app-insights component create \
  --app ai-emailarchive \
  --location westeurope \
  --resource-group rg-emailarchive \
  --workspace law-emailarchive
```

### 1.6 Azure Function deployen

```bash
cd azure-function
func azure functionapp publish func-emailarchive
```

---

## 2. Dataverse Custom Actions einrichten

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

### 2.3 Custom Action mit Azure Function verbinden

Die Custom Actions rufen die Azure Function per HTTP auf. Dafür gibt es zwei Wege:

#### Option A: Plugin (empfohlen)

Ein Dataverse Plugin registrieren, das auf der Custom Action ausgelöst wird und die Azure Function aufruft:

```csharp
// Plugin: GetArchivedEmailsPlugin.cs
public class GetArchivedEmailsPlugin : IPlugin
{
    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracingService = (ITracingService)serviceProvider.GetService(typeof(ITracingService));

        // Eingabeparameter lesen
        var referenceNumber = (string)context.InputParameters["ReferenceNumber"];
        var page = (int)context.InputParameters["Page"];
        var pageSize = (int)context.InputParameters["PageSize"];
        var sortBy = context.InputParameters.Contains("SortBy")
            ? (string)context.InputParameters["SortBy"] : "date";
        var sortDirection = context.InputParameters.Contains("SortDirection")
            ? (string)context.InputParameters["SortDirection"] : "desc";

        // Azure Function aufrufen
        var functionUrl = "https://func-emailarchive.azurewebsites.net/api/emails/search";
        var functionKey = GetFunctionKey(); // Aus Secure Configuration

        using var client = new HttpClient();
        client.DefaultRequestHeaders.Add("x-functions-key", functionKey);

        var payload = new
        {
            ReferenceNumber = referenceNumber,
            Page = page,
            PageSize = pageSize,
            SortBy = sortBy,
            SortDirection = sortDirection
        };

        var json = JsonSerializer.Serialize(payload);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        var response = client.PostAsync(functionUrl, content).GetAwaiter().GetResult();
        var responseBody = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();

        var result = JsonSerializer.Deserialize<SearchResponse>(responseBody);

        // Ausgabeparameter setzen
        context.OutputParameters["Emails"] = JsonSerializer.Serialize(result.Emails);
        context.OutputParameters["TotalCount"] = result.TotalCount;
        context.OutputParameters["Success"] = result.Success;
        context.OutputParameters["ErrorMessage"] = result.ErrorMessage ?? "";
    }
}
```

Plugin-Registrierung:
1. **Plugin Registration Tool** öffnen
2. Assembly registrieren
3. Step registrieren:
   - **Message**: `dynpro_GetArchivedEmails`
   - **Stage**: PostOperation
   - **Mode**: Synchronous

#### Option B: Power Automate Cloud Flow

Falls kein Plugin gewünscht – einen Cloud Flow als Alternative:

1. Trigger: "When an action is performed" → `dynpro_GetArchivedEmails`
2. HTTP Action → Azure Function URL aufrufen
3. Response Action → Ausgabeparameter zurückgeben

⚠️ **Nachteil**: Höhere Latenz (~2-5s vs. ~0.5-1s beim Plugin)

---

## 3. PCF Control im Formular einbinden

### 3.1 Control zur Solution hinzufügen

```bash
cd EmailViewerControl
npm run build

# Solution erstellen
pac solution init \
  --publisher-name DynPro \
  --publisher-prefix dynpro \
  --outputDirectory ../EmailViewerSolution

cd ../EmailViewerSolution
pac solution add-reference --path ../

# Build
dotnet build
```

### 3.2 Im Formular konfigurieren

1. **Formular-Editor** öffnen (Reise/Auftrag)
2. Feld für die Reise-/Auftragsnummer auswählen (z.B. `dynpro_reisenummer`)
3. **+ Component** → `EmailViewer` auswählen
4. Properties konfigurieren:
   - `referenceNumber` → Feld `dynpro_reisenummer` binden
   - `customActionName` → `dynpro_GetArchivedEmails`
   - `pageSize` → `25`
5. Formular speichern & veröffentlichen

---

## 4. Sicherheit

| Schicht | Maßnahme |
|---|---|
| **PCF → Custom Action** | Dataverse Security Roles (nur autorisierte Benutzer) |
| **Custom Action → Azure Function** | Function Key (im Plugin Secure Config) |
| **Azure Function → Key Vault** | Managed Identity (kein Secret im Code) |
| **Azure Function → Archiv** | API-Key aus Key Vault / OAuth2 |
| **Netzwerk** | Optional: VNET Integration + Private Endpoints |

---

## 5. Monitoring

### Application Insights Queries (KQL)

```kql
// Fehlerhafte Archiv-Anfragen der letzten 24h
requests
| where timestamp > ago(24h)
| where name in ("GetArchivedEmails", "DownloadArchivedEmail")
| where success == false
| project timestamp, name, resultCode, duration, customDimensions
| order by timestamp desc

// Durchschnittliche Antwortzeit
requests
| where timestamp > ago(7d)
| where name == "GetArchivedEmails"
| summarize avg(duration), percentile(duration, 95), count() by bin(timestamp, 1h)
| render timechart
```
