import * as React from "react";
import {
  ArchivedEmail,
  DownloadFormat,
  SortField,
  SortDirection,
} from "../types";
import { EmailRow } from "./EmailRow";

export interface EmailListProps {
  emails: ArchivedEmail[];
  isLoading: boolean;
  errorMessage?: string;
  totalCount: number;
  currentPage: number;
  pageSize: number;
  sortBy: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  onPageChange: (page: number) => void;
  onDownload: (emailId: string, format: DownloadFormat) => void;
  downloadingIds: Set<string>;
}

export const EmailList: React.FC<EmailListProps> = ({
  emails,
  isLoading,
  errorMessage,
  totalCount,
  currentPage,
  pageSize,
  sortBy,
  sortDirection,
  onSort,
  onPageChange,
  onDownload,
  downloadingIds,
}) => {
  const totalPages = Math.ceil(totalCount / pageSize);

  const getSortIndicator = (field: SortField): string => {
    if (sortBy !== field) return "";
    return sortDirection === SortDirection.Ascending ? " ▲" : " ▼";
  };

  const renderHeader = () => (
    <div className="ev-table-header">
      <div
        className="ev-header-cell ev-col-date ev-sortable"
        onClick={() => onSort(SortField.Date)}
        title="Nach Datum sortieren"
      >
        Datum{getSortIndicator(SortField.Date)}
      </div>
      <div
        className="ev-header-cell ev-col-direction ev-sortable"
        onClick={() => onSort(SortField.Direction)}
        title="Nach Richtung sortieren"
      >
        Richtung{getSortIndicator(SortField.Direction)}
      </div>
      <div
        className="ev-header-cell ev-col-from ev-sortable"
        onClick={() => onSort(SortField.From)}
        title="Nach Absender sortieren"
      >
        Absender{getSortIndicator(SortField.From)}
      </div>
      <div
        className="ev-header-cell ev-col-subject ev-sortable"
        onClick={() => onSort(SortField.Subject)}
        title="Nach Betreff sortieren"
      >
        Betreff{getSortIndicator(SortField.Subject)}
      </div>
      <div className="ev-header-cell ev-col-attachments">
        Anhänge
      </div>
      <div className="ev-header-cell ev-col-actions">
        Download
      </div>
    </div>
  );

  const renderPagination = () => {
    if (totalPages <= 1) return null;

    return (
      <div className="ev-pagination">
        <button
          className="ev-pagination-btn"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          title="Vorherige Seite"
        >
          ‹ Zurück
        </button>
        <span className="ev-pagination-info">
          Seite {currentPage} von {totalPages} ({totalCount} E-Mails)
        </span>
        <button
          className="ev-pagination-btn"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          title="Nächste Seite"
        >
          Weiter ›
        </button>
      </div>
    );
  };

  if (errorMessage) {
    return (
      <div className="ev-container">
        <div className="ev-error">
          <span className="ev-error-icon">⚠</span>
          <span>{errorMessage}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="ev-container">
      <div className="ev-toolbar">
        <span className="ev-toolbar-title">
          Archivierte E-Mails
        </span>
        {!isLoading && (
          <span className="ev-toolbar-count">
            {totalCount} {totalCount === 1 ? "E-Mail" : "E-Mails"} gefunden
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="ev-loading">
          <div className="ev-spinner" />
          <span>E-Mails werden aus dem Archiv abgerufen...</span>
        </div>
      ) : emails.length === 0 ? (
        <div className="ev-empty">
          <span>Keine archivierten E-Mails für diese Reise gefunden.</span>
        </div>
      ) : (
        <>
          <div className="ev-table">
            {renderHeader()}
            <div className="ev-table-body">
              {emails.map((email) => (
                <EmailRow
                  key={email.id}
                  email={email}
                  onDownload={onDownload}
                  isDownloading={downloadingIds.has(email.id)}
                />
              ))}
            </div>
          </div>
          {renderPagination()}
        </>
      )}
    </div>
  );
};
