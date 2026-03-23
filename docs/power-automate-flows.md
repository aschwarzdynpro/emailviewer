# Power Automate Cloud Flows

Diese Flows verbinden die Dataverse Custom Actions mit dem Custom Connector.

---

## Flow 1: `GetArchivedEmails` (Suche)

### Trigger
**When an action is performed**
- Catalog: `None (Global)`
- Action Name: `dynpro_GetArchivedEmails`

### Schritte

```
1. Trigger: "When an action is performed" (dynpro_GetArchivedEmails)
       │
       ▼
2. Compose: "Offset berechnen"
       Expression: mul(sub(triggerOutputs()?['body/InputParameters/Page'], 1),
                       triggerOutputs()?['body/InputParameters/PageSize'])
       │
       ▼
3. Custom Connector Action: "SearchEmails"
       - query:          @{triggerOutputs()?['body/InputParameters/ReferenceNumber']}
       - offset:         @{outputs('Offset_berechnen')}
       - limit:          @{triggerOutputs()?['body/InputParameters/PageSize']}
       - sortBy:         @{triggerOutputs()?['body/InputParameters/SortBy']}
       - sortDirection:  @{triggerOutputs()?['body/InputParameters/SortDirection']}
       │
       ▼
4. Select: "E-Mails mappen"
       From: @{body('SearchEmails')?['Items']}
       Map:
         Id:              @{item()?['Id']}
         Subject:         @{item()?['Subject']}
         From:            @{item()?['SenderEmail']}
         FromDisplayName: @{item()?['SenderName']}
         To:              @{item()?['Recipients']}
         Date:            @{item()?['ReceivedDate']}
         Direction:       @{if(contains(parameters('OrganizerDomains'),
                              last(split(item()?['SenderEmail'], '@'))),
                              'organizer', 'customer')}
         HasAttachments:  @{greater(item()?['AttachmentCount'], 0)}
         AttachmentCount: @{item()?['AttachmentCount']}
         AttachmentNames: @{item()?['AttachmentNames']}
         SizeInBytes:     @{item()?['SizeBytes']}
       │
       ▼
5. Respond to Dataverse:
       - Emails:        @{string(body('E-Mails_mappen'))}
       - TotalCount:    @{body('SearchEmails')?['TotalCount']}
       - Success:       true
       - ErrorMessage:  ""
```

### Fehlerbehandlung (Scope)

Alle Schritte 2-4 in einen **Scope** wrappen. Bei Fehler:

```
6. Respond to Dataverse (run after: Scope has failed):
       - Emails:        "[]"
       - TotalCount:    0
       - Success:       false
       - ErrorMessage:  @{result('Scope')?[0]?['error']?['message']}
```

### Flow-Parameter

| Name | Typ | Standardwert |
|---|---|---|
| `OrganizerDomains` | String | `@veranstalter1.de,@veranstalter2.com` |

---

## Flow 2: `GetArchivedEmails_Download`

### Trigger
**When an action is performed**
- Catalog: `None (Global)`
- Action Name: `dynpro_GetArchivedEmails_Download`

### Schritte

```
1. Trigger: "When an action is performed" (dynpro_GetArchivedEmails_Download)
       │
       ▼
2. Custom Connector Action: "DownloadEmail"
       - emailId:  @{triggerOutputs()?['body/InputParameters/EmailId']}
       - format:   @{triggerOutputs()?['body/InputParameters/Format']}
       │
       ▼
3. Respond to Dataverse:
       - FileContent:  @{body('DownloadEmail')?['FileContent']}
       - FileName:     @{body('DownloadEmail')?['FileName']}
       - MimeType:     @{body('DownloadEmail')?['MimeType']}
       - Success:      true
       - ErrorMessage: ""
```

### Fehlerbehandlung

```
4. Respond to Dataverse (run after: DownloadEmail has failed):
       - FileContent:  ""
       - FileName:     ""
       - MimeType:     ""
       - Success:      false
       - ErrorMessage: "Fehler beim Herunterladen der E-Mail"
```

---

## Wichtige Hinweise

### Performance
- Power Automate Flows haben eine Latenz von ~2-5 Sekunden
- Für schnellere Antworten ggf. **Child Flows** mit "Run a Child Flow" Action verwenden
- **Concurrency Control** im Trigger auf z.B. 50 setzen, um parallele Ausführungen zu erlauben

### Connection Reference
- Den Custom Connector als **Connection Reference** in der Solution einbinden
- So kann die Verbindung pro Umgebung (Dev/Test/Prod) konfiguriert werden

### Monitoring
- **Flow Run History** für Fehleranalyse nutzen
- Optional: Fehler per Teams/E-Mail-Benachrichtigung melden
