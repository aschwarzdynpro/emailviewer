namespace EmailArchiveProxy.Models;

public class SearchRequest
{
    public string ReferenceNumber { get; set; } = string.Empty;
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 25;
    public string SortBy { get; set; } = "date";
    public string SortDirection { get; set; } = "desc";
}

public class SearchResponse
{
    public bool Success { get; set; }
    public List<ArchivedEmail> Emails { get; set; } = new();
    public int TotalCount { get; set; }
    public string? ErrorMessage { get; set; }
}

public class ArchivedEmail
{
    public string Id { get; set; } = string.Empty;
    public string Subject { get; set; } = string.Empty;
    public string From { get; set; } = string.Empty;
    public string FromDisplayName { get; set; } = string.Empty;
    public List<string> To { get; set; } = new();
    public string Date { get; set; } = string.Empty;
    public string Direction { get; set; } = "unknown";
    public bool HasAttachments { get; set; }
    public int AttachmentCount { get; set; }
    public List<string> AttachmentNames { get; set; } = new();
    public long? SizeInBytes { get; set; }
}

public class DownloadRequest
{
    public string EmailId { get; set; } = string.Empty;
    public string Format { get; set; } = "eml";
}

public class DownloadResponse
{
    public bool Success { get; set; }
    public string? FileContent { get; set; }  // Base64
    public string? FileName { get; set; }
    public string? MimeType { get; set; }
    public string? ErrorMessage { get; set; }
}
