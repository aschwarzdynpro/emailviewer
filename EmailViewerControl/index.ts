import * as React from "react";
import * as ReactDOM from "react-dom";
import { IInputs, IOutputs } from "./types";
import { ArchiveService } from "./services/ArchiveService";
import { EmailViewerApp } from "./EmailViewerApp";

/**
 * PCF Control: EmailViewer
 *
 * Displays archived booking confirmation emails from an external archive system
 * within a Dynamics 365 CE form. Emails are retrieved via a Dataverse Custom Action
 * that proxies requests to an Azure Function HTTP Trigger.
 *
 * Architecture:
 *   PCF Control → Dataverse Custom Action → Azure Function → External Archive (API/IMAP)
 */
export class EmailViewerControl
  implements ComponentFramework.ReactControl<IInputs, IOutputs>
{
  private context!: ComponentFramework.Context<IInputs>;
  private archiveService!: ArchiveService;
  private notifyOutputChanged!: () => void;

  public init(
    context: ComponentFramework.Context<IInputs>,
    notifyOutputChanged: () => void
  ): void {
    this.context = context;
    this.notifyOutputChanged = notifyOutputChanged;

    const customActionName =
      context.parameters.customActionName?.raw ?? "dynpro_GetArchivedEmails";

    this.archiveService = new ArchiveService(
      context.webAPI,
      customActionName
    );

    context.mode.trackContainerResize(true);
  }

  public updateView(
    context: ComponentFramework.Context<IInputs>
  ): React.ReactElement {
    this.context = context;

    const referenceNumber = context.parameters.referenceNumber?.raw ?? "";
    const pageSize = context.parameters.pageSize?.raw ?? 25;

    return React.createElement(EmailViewerApp, {
      referenceNumber,
      pageSize,
      archiveService: this.archiveService,
    });
  }

  public getOutputs(): IOutputs {
    return {};
  }

  public destroy(): void {
    // Cleanup handled by React
  }
}
