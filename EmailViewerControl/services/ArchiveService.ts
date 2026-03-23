import {
  ArchiveSearchRequest,
  ArchiveSearchResponse,
  ArchivedEmail,
  DownloadFormat,
  EmailDownloadResponse,
} from "../types";

/**
 * Service for communicating with the external email archive
 * through Dataverse Custom Actions.
 * The Custom Actions trigger Power Automate Cloud Flows which use
 * a Custom Connector to call the external archive API directly.
 *
 * Architecture: PCF → Custom Action → Power Automate → Custom Connector → Archive API
 */
export class ArchiveService {
  private webApi: ComponentFramework.WebApi;
  private customActionName: string;

  constructor(webApi: ComponentFramework.WebApi, customActionName: string) {
    this.webApi = webApi;
    this.customActionName = customActionName;
  }

  /**
   * Search for archived emails by reference number via Dataverse Custom Action.
   * The Custom Action triggers a Power Automate flow that uses the
   * Custom Connector to query the external archive system.
   */
  async searchEmails(
    request: ArchiveSearchRequest
  ): Promise<ArchiveSearchResponse> {
    try {
      const actionRequest: Record<string, unknown> = {
        ReferenceNumber: request.referenceNumber,
        Page: request.page,
        PageSize: request.pageSize,
        SortBy: request.sortBy ?? "date",
        SortDirection: request.sortDirection ?? "desc",

        getMetadata: () => ({
          boundParameter: null,
          parameterTypes: {
            ReferenceNumber: {
              typeName: "Edm.String",
              structuralProperty: 1,
            },
            Page: { typeName: "Edm.Int32", structuralProperty: 1 },
            PageSize: { typeName: "Edm.Int32", structuralProperty: 1 },
            SortBy: { typeName: "Edm.String", structuralProperty: 1 },
            SortDirection: { typeName: "Edm.String", structuralProperty: 1 },
          },
          operationType: 0, // Action
          operationName: this.customActionName,
        }),
      };

      const response = await (
        this.webApi as unknown as {
          execute(
            request: Record<string, unknown>
          ): Promise<{ json(): Promise<Record<string, unknown>> }>;
        }
      ).execute(actionRequest);

      const result = await response.json();

      return {
        success: true,
        emails: this.mapEmailsFromResponse(
          result.Emails as Record<string, unknown>[]
        ),
        totalCount: (result.TotalCount as number) ?? 0,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error(
        `[EmailViewer] Error searching archived emails: ${errorMessage}`
      );
      return {
        success: false,
        emails: [],
        totalCount: 0,
        errorMessage: `Fehler beim Abrufen der E-Mails: ${errorMessage}`,
      };
    }
  }

  /**
   * Download an email from the archive in the specified format.
   */
  async downloadEmail(
    emailId: string,
    format: DownloadFormat
  ): Promise<EmailDownloadResponse> {
    try {
      const actionRequest: Record<string, unknown> = {
        EmailId: emailId,
        Format: format,

        getMetadata: () => ({
          boundParameter: null,
          parameterTypes: {
            EmailId: { typeName: "Edm.String", structuralProperty: 1 },
            Format: { typeName: "Edm.String", structuralProperty: 1 },
          },
          operationType: 0,
          operationName: `${this.customActionName}_Download`,
        }),
      };

      const response = await (
        this.webApi as unknown as {
          execute(
            request: Record<string, unknown>
          ): Promise<{ json(): Promise<Record<string, unknown>> }>;
        }
      ).execute(actionRequest);

      const result = await response.json();

      return {
        success: true,
        fileContent: result.FileContent as string,
        fileName: result.FileName as string,
        mimeType: result.MimeType as string,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error(
        `[EmailViewer] Error downloading email: ${errorMessage}`
      );
      return {
        success: false,
        errorMessage: `Fehler beim Herunterladen der E-Mail: ${errorMessage}`,
      };
    }
  }

  /**
   * Trigger file download in the browser from base64 content.
   */
  static triggerFileDownload(
    base64Content: string,
    fileName: string,
    mimeType: string
  ): void {
    const byteCharacters = atob(base64Content);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private mapEmailsFromResponse(
    rawEmails: Record<string, unknown>[]
  ): ArchivedEmail[] {
    if (!Array.isArray(rawEmails)) return [];

    return rawEmails.map((email) => ({
      id: (email.Id as string) ?? "",
      subject: (email.Subject as string) ?? "(Kein Betreff)",
      from: (email.From as string) ?? "",
      fromDisplayName: (email.FromDisplayName as string) ?? (email.From as string) ?? "",
      to: ((email.To as string[]) ?? []),
      date: (email.Date as string) ?? "",
      direction: (email.Direction as ArchivedEmail["direction"]) ?? "unknown",
      hasAttachments: (email.HasAttachments as boolean) ?? false,
      attachmentCount: (email.AttachmentCount as number) ?? 0,
      attachmentNames: (email.AttachmentNames as string[]) ?? [],
      sizeInBytes: email.SizeInBytes as number | undefined,
    }));
  }
}
