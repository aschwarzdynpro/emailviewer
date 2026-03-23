import * as React from "react";
import { ArchivedEmail, DownloadFormat, EmailDirection } from "../types";

export interface EmailRowProps {
  email: ArchivedEmail;
  onDownload: (emailId: string, format: DownloadFormat) => void;
  isDownloading: boolean;
}

export const EmailRow: React.FC<EmailRowProps> = ({
  email,
  onDownload,
  isDownloading,
}) => {
  const [showFormatMenu, setShowFormatMenu] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowFormatMenu(false);
      }
    };
    if (showFormatMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showFormatMenu]);

  const formatDate = (dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const getDirectionLabel = (direction: string): string => {
    switch (direction) {
      case EmailDirection.Customer:
        return "Kunde";
      case EmailDirection.Organizer:
        return "Veranstalter";
      default:
        return "Unbekannt";
    }
  };

  const getDirectionClass = (direction: string): string => {
    switch (direction) {
      case EmailDirection.Customer:
        return "ev-direction-customer";
      case EmailDirection.Organizer:
        return "ev-direction-organizer";
      default:
        return "ev-direction-unknown";
    }
  };

  const handleDownload = (format: DownloadFormat) => {
    setShowFormatMenu(false);
    onDownload(email.id, format);
  };

  return (
    <div className="ev-table-row">
      <div className="ev-cell ev-col-date" title={email.date}>
        {formatDate(email.date)}
      </div>
      <div className="ev-cell ev-col-direction">
        <span className={`ev-direction-badge ${getDirectionClass(email.direction)}`}>
          {getDirectionLabel(email.direction)}
        </span>
      </div>
      <div className="ev-cell ev-col-from" title={email.from}>
        {email.fromDisplayName || email.from}
      </div>
      <div className="ev-cell ev-col-subject" title={email.subject}>
        {email.subject}
      </div>
      <div className="ev-cell ev-col-attachments">
        {email.hasAttachments && (
          <span
            className="ev-attachment-badge"
            title={email.attachmentNames.join(", ")}
          >
            📎 {email.attachmentCount}
          </span>
        )}
      </div>
      <div className="ev-cell ev-col-actions" ref={menuRef}>
        {isDownloading ? (
          <div className="ev-spinner ev-spinner-small" />
        ) : (
          <div className="ev-download-wrapper">
            <button
              className="ev-download-btn"
              onClick={() => setShowFormatMenu(!showFormatMenu)}
              title="E-Mail herunterladen"
            >
              ⬇ Download
            </button>
            {showFormatMenu && (
              <div className="ev-format-menu">
                <button
                  className="ev-format-option"
                  onClick={() => handleDownload(DownloadFormat.EML)}
                >
                  Als .eml
                </button>
                <button
                  className="ev-format-option"
                  onClick={() => handleDownload(DownloadFormat.MSG)}
                >
                  Als .msg
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
