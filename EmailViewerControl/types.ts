/**
 * Represents an archived email retrieved from the external archive system.
 */
export interface ArchivedEmail {
  /** Unique identifier of the email in the archive */
  id: string;
  /** Email subject line */
  subject: string;
  /** Sender email address */
  from: string;
  /** Sender display name */
  fromDisplayName: string;
  /** Recipient email addresses */
  to: string[];
  /** Date and time the email was sent/received */
  date: string;
  /** Direction: inbound (from organizer/customer) or outbound */
  direction: EmailDirection;
  /** Whether the email has attachments */
  hasAttachments: boolean;
  /** Number of attachments */
  attachmentCount: number;
  /** List of attachment names */
  attachmentNames: string[];
  /** Email size in bytes */
  sizeInBytes?: number;
}

export enum EmailDirection {
  /** Email from/to the customer (Kunde) */
  Customer = "customer",
  /** Email from/to the tour operator/organizer (Veranstalter) */
  Organizer = "organizer",
  /** Unknown direction */
  Unknown = "unknown",
}

/**
 * Response from the archive search API via Custom Action.
 */
export interface ArchiveSearchResponse {
  /** Whether the search was successful */
  success: boolean;
  /** List of matching emails */
  emails: ArchivedEmail[];
  /** Total number of results */
  totalCount: number;
  /** Error message if unsuccessful */
  errorMessage?: string;
}

/**
 * Request parameters for the archive search.
 */
export interface ArchiveSearchRequest {
  /** Reference/booking number (Reise-/Auftragsnummer) */
  referenceNumber: string;
  /** Page number for pagination (1-based) */
  page: number;
  /** Number of results per page */
  pageSize: number;
  /** Sort field */
  sortBy?: SortField;
  /** Sort direction */
  sortDirection?: SortDirection;
}

/**
 * Response for email download.
 */
export interface EmailDownloadResponse {
  /** Whether the download was successful */
  success: boolean;
  /** Base64-encoded email file content */
  fileContent?: string;
  /** File name */
  fileName?: string;
  /** MIME type */
  mimeType?: string;
  /** Error message if unsuccessful */
  errorMessage?: string;
}

export enum DownloadFormat {
  MSG = "msg",
  EML = "eml",
}

export enum SortField {
  Date = "date",
  Subject = "subject",
  From = "from",
  Direction = "direction",
}

export enum SortDirection {
  Ascending = "asc",
  Descending = "desc",
}

/**
 * PCF input properties as defined in ControlManifest.
 */
export interface IInputs {
  referenceNumber: ComponentFramework.PropertyTypes.StringProperty;
  entityLogicalName: ComponentFramework.PropertyTypes.StringProperty;
  customActionName: ComponentFramework.PropertyTypes.StringProperty;
  pageSize: ComponentFramework.PropertyTypes.WholeNumberProperty;
}

/**
 * PCF output properties.
 */
export interface IOutputs {
  referenceNumber?: string;
}
