import * as React from "react";
import { EmailList } from "./components/EmailList";
import { ArchiveService } from "./services/ArchiveService";
import {
  ArchivedEmail,
  DownloadFormat,
  SortField,
  SortDirection,
} from "./types";

export interface EmailViewerAppProps {
  referenceNumber: string;
  pageSize: number;
  archiveService: ArchiveService;
}

export const EmailViewerApp: React.FC<EmailViewerAppProps> = ({
  referenceNumber,
  pageSize,
  archiveService,
}) => {
  const [emails, setEmails] = React.useState<ArchivedEmail[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | undefined>();
  const [totalCount, setTotalCount] = React.useState(0);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [sortBy, setSortBy] = React.useState<SortField>(SortField.Date);
  const [sortDirection, setSortDirection] = React.useState<SortDirection>(
    SortDirection.Descending
  );
  const [downloadingIds, setDownloadingIds] = React.useState<Set<string>>(
    new Set()
  );

  const loadEmails = React.useCallback(
    async (page: number, sort: SortField, direction: SortDirection) => {
      if (!referenceNumber) {
        setEmails([]);
        setTotalCount(0);
        setErrorMessage(undefined);
        return;
      }

      setIsLoading(true);
      setErrorMessage(undefined);

      const response = await archiveService.searchEmails({
        referenceNumber,
        page,
        pageSize,
        sortBy: sort,
        sortDirection: direction,
      });

      setIsLoading(false);

      if (response.success) {
        setEmails(response.emails);
        setTotalCount(response.totalCount);
      } else {
        setEmails([]);
        setTotalCount(0);
        setErrorMessage(response.errorMessage);
      }
    },
    [referenceNumber, pageSize, archiveService]
  );

  React.useEffect(() => {
    setCurrentPage(1);
    loadEmails(1, sortBy, sortDirection);
  }, [referenceNumber, loadEmails, sortBy, sortDirection]);

  const handleSort = (field: SortField) => {
    if (field === sortBy) {
      const newDirection =
        sortDirection === SortDirection.Ascending
          ? SortDirection.Descending
          : SortDirection.Ascending;
      setSortDirection(newDirection);
    } else {
      setSortBy(field);
      setSortDirection(SortDirection.Ascending);
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    loadEmails(page, sortBy, sortDirection);
  };

  const handleDownload = async (emailId: string, format: DownloadFormat) => {
    setDownloadingIds((prev) => new Set(prev).add(emailId));

    try {
      const response = await archiveService.downloadEmail(emailId, format);

      if (response.success && response.fileContent && response.fileName && response.mimeType) {
        ArchiveService.triggerFileDownload(
          response.fileContent,
          response.fileName,
          response.mimeType
        );
      } else {
        setErrorMessage(
          response.errorMessage ?? "Fehler beim Herunterladen der E-Mail."
        );
      }
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(emailId);
        return next;
      });
    }
  };

  return (
    <EmailList
      emails={emails}
      isLoading={isLoading}
      errorMessage={errorMessage}
      totalCount={totalCount}
      currentPage={currentPage}
      pageSize={pageSize}
      sortBy={sortBy}
      sortDirection={sortDirection}
      onSort={handleSort}
      onPageChange={handlePageChange}
      onDownload={handleDownload}
      downloadingIds={downloadingIds}
    />
  );
};
