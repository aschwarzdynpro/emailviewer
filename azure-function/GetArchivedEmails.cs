using System.Net;
using System.Text.Json;
using Azure.Identity;
using Azure.Security.KeyVault.Secrets;
using EmailArchiveProxy.Models;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace EmailArchiveProxy;

/// <summary>
/// Azure Function HTTP Triggers für den Zugriff auf das externe E-Mail-Archiv.
/// Wird von Dataverse Custom Actions aufgerufen.
///
/// Architektur:
///   D365 Custom Action → diese Azure Function → Externes Archivsystem (API/IMAP)
///
/// Authentifizierung:
///   - Eingehend: Azure AD (App Registration) validiert den Aufruf aus Dataverse
///   - Ausgehend: API-Key / Credentials aus Key Vault für das Archivsystem
/// </summary>
public class GetArchivedEmails
{
    private readonly ILogger<GetArchivedEmails> _logger;
    private readonly HttpClient _httpClient;

    public GetArchivedEmails(ILogger<GetArchivedEmails> logger, IHttpClientFactory httpClientFactory)
    {
        _logger = logger;
        _httpClient = httpClientFactory.CreateClient("ArchiveApi");
    }

    /// <summary>
    /// Sucht E-Mails im externen Archiv anhand der Referenznummer.
    /// </summary>
    [Function("GetArchivedEmails")]
    public async Task<HttpResponseData> Search(
        [HttpTrigger(AuthorizationLevel.Function, "post", Route = "emails/search")] HttpRequestData req)
    {
        _logger.LogInformation("GetArchivedEmails: Search request received");

        var request = await JsonSerializer.DeserializeAsync<SearchRequest>(
            req.Body,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (request == null || string.IsNullOrWhiteSpace(request.ReferenceNumber))
        {
            return await CreateResponse(req, HttpStatusCode.BadRequest, new SearchResponse
            {
                Success = false,
                ErrorMessage = "ReferenceNumber is required"
            });
        }

        try
        {
            // ── Archiv-API aufrufen ──
            // TODO: Anpassen an die tatsächliche API des Auftraggebers
            //
            // Option A: REST API des Archivsystems
            var archiveApiUrl = Environment.GetEnvironmentVariable("ARCHIVE_API_URL");
            var apiKey = await GetSecretFromKeyVault("archive-api-key");

            var archiveRequest = new HttpRequestMessage(HttpMethod.Post, $"{archiveApiUrl}/search")
            {
                Content = JsonContent.Create(new
                {
                    query = request.ReferenceNumber,
                    offset = (request.Page - 1) * request.PageSize,
                    limit = request.PageSize,
                    sortBy = request.SortBy,
                    sortDirection = request.SortDirection
                })
            };
            archiveRequest.Headers.Add("X-API-Key", apiKey);

            var archiveResponse = await _httpClient.SendAsync(archiveRequest);
            archiveResponse.EnsureSuccessStatusCode();

            var archiveResult = await archiveResponse.Content.ReadFromJsonAsync<ArchiveApiResult>();

            // ── Ergebnis mappen ──
            var response = new SearchResponse
            {
                Success = true,
                TotalCount = archiveResult?.TotalCount ?? 0,
                Emails = (archiveResult?.Items ?? []).Select(item => new ArchivedEmail
                {
                    Id = item.Id,
                    Subject = item.Subject,
                    From = item.SenderEmail,
                    FromDisplayName = item.SenderName,
                    To = item.Recipients ?? new List<string>(),
                    Date = item.ReceivedDate.ToString("o"),
                    Direction = DetermineDirection(item.SenderEmail, item.Recipients),
                    HasAttachments = item.AttachmentCount > 0,
                    AttachmentCount = item.AttachmentCount,
                    AttachmentNames = item.AttachmentNames ?? new List<string>(),
                    SizeInBytes = item.SizeBytes
                }).ToList()
            };

            return await CreateResponse(req, HttpStatusCode.OK, response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error searching archive for reference {ReferenceNumber}", request.ReferenceNumber);
            return await CreateResponse(req, HttpStatusCode.OK, new SearchResponse
            {
                Success = false,
                ErrorMessage = "Fehler beim Zugriff auf das E-Mail-Archiv"
            });
        }
    }

    /// <summary>
    /// Lädt eine einzelne E-Mail aus dem Archiv im gewünschten Format herunter.
    /// </summary>
    [Function("DownloadArchivedEmail")]
    public async Task<HttpResponseData> Download(
        [HttpTrigger(AuthorizationLevel.Function, "post", Route = "emails/download")] HttpRequestData req)
    {
        _logger.LogInformation("GetArchivedEmails: Download request received");

        var request = await JsonSerializer.DeserializeAsync<DownloadRequest>(
            req.Body,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (request == null || string.IsNullOrWhiteSpace(request.EmailId))
        {
            return await CreateResponse(req, HttpStatusCode.BadRequest, new DownloadResponse
            {
                Success = false,
                ErrorMessage = "EmailId is required"
            });
        }

        try
        {
            var archiveApiUrl = Environment.GetEnvironmentVariable("ARCHIVE_API_URL");
            var apiKey = await GetSecretFromKeyVault("archive-api-key");

            // E-Mail im gewünschten Format vom Archiv abrufen
            var downloadUrl = $"{archiveApiUrl}/emails/{request.EmailId}/download?format={request.Format}";
            var archiveRequest = new HttpRequestMessage(HttpMethod.Get, downloadUrl);
            archiveRequest.Headers.Add("X-API-Key", apiKey);

            var archiveResponse = await _httpClient.SendAsync(archiveRequest);
            archiveResponse.EnsureSuccessStatusCode();

            var fileBytes = await archiveResponse.Content.ReadAsByteArrayAsync();
            var fileName = archiveResponse.Content.Headers.ContentDisposition?.FileName?.Trim('"')
                           ?? $"email.{request.Format}";

            var mimeType = request.Format.ToLower() switch
            {
                "msg" => "application/vnd.ms-outlook",
                "eml" => "message/rfc822",
                _ => "application/octet-stream"
            };

            var response = new DownloadResponse
            {
                Success = true,
                FileContent = Convert.ToBase64String(fileBytes),
                FileName = fileName,
                MimeType = mimeType
            };

            return await CreateResponse(req, HttpStatusCode.OK, response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error downloading email {EmailId}", request.EmailId);
            return await CreateResponse(req, HttpStatusCode.OK, new DownloadResponse
            {
                Success = false,
                ErrorMessage = "Fehler beim Herunterladen der E-Mail"
            });
        }
    }

    // ── Hilfsmethoden ──

    private static string DetermineDirection(string senderEmail, List<string>? recipients)
    {
        // TODO: Logik anpassen – z.B. anhand bekannter Veranstalter-Domains
        // oder anhand von Konfiguration in App Settings
        var organizerDomains = (Environment.GetEnvironmentVariable("ORGANIZER_DOMAINS") ?? "")
            .Split(',', StringSplitOptions.RemoveEmptyEntries);

        if (organizerDomains.Any(d => senderEmail.EndsWith(d, StringComparison.OrdinalIgnoreCase)))
            return "organizer";

        return "customer";
    }

    private static async Task<string> GetSecretFromKeyVault(string secretName)
    {
        var keyVaultUrl = Environment.GetEnvironmentVariable("KEY_VAULT_URL")
                          ?? throw new InvalidOperationException("KEY_VAULT_URL not configured");

        var client = new SecretClient(new Uri(keyVaultUrl), new DefaultAzureCredential());
        var secret = await client.GetSecretAsync(secretName);
        return secret.Value.Value;
    }

    private static async Task<HttpResponseData> CreateResponse<T>(
        HttpRequestData req, HttpStatusCode statusCode, T body)
    {
        var response = req.CreateResponse(statusCode);
        await response.WriteAsJsonAsync(body);
        return response;
    }
}

/// <summary>
/// Mapping-Klasse für die Antwort des externen Archivsystems.
/// TODO: An das tatsächliche API-Schema des Auftraggebers anpassen.
/// </summary>
internal class ArchiveApiResult
{
    public int TotalCount { get; set; }
    public List<ArchiveApiItem> Items { get; set; } = new();
}

internal class ArchiveApiItem
{
    public string Id { get; set; } = string.Empty;
    public string Subject { get; set; } = string.Empty;
    public string SenderEmail { get; set; } = string.Empty;
    public string SenderName { get; set; } = string.Empty;
    public List<string>? Recipients { get; set; }
    public DateTime ReceivedDate { get; set; }
    public int AttachmentCount { get; set; }
    public List<string>? AttachmentNames { get; set; }
    public long SizeBytes { get; set; }
}
