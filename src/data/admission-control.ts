import type { AdmissionControlData, Application } from "@/data/applications";

export type DecisionKind = "within" | "reserve" | "unknown";
export type AdmissionControl = AdmissionControlData;

export function getAdmissionControl(app: Application): AdmissionControl {
  return app.control;
}

export function getActiveRank(app: Application, control: AdmissionControl): number | null {
  return app.basis === "Бюджет"
    ? control.consentRank ?? app.position
    : control.contractRank ?? app.position;
}

export function getDecision(app: Application, control: AdmissionControl): {
  kind: DecisionKind;
  label: string;
  detail: string;
} {
  const rank = getActiveRank(app, control);

  if (control.seats === null || rank === null) {
    return {
      kind: "unknown",
      label: "Места не сопоставлены",
      detail: control.sourceNote,
    };
  }

  const isConfirmed = app.basis === "Бюджет"
    ? control.consentRank !== null
    : control.contractRank !== null;

  const source = isConfirmed
    ? app.basis === "Бюджет" ? "по согласиям" : "по договорам"
    : "предварительно по общей позиции";

  if (rank <= control.seats) {
    return {
      kind: "within",
      label: `В пределах квоты · запас ${control.seats - rank + 1}`,
      detail: source,
    };
  }

  return {
    kind: "reserve",
    label: `Резерв · разрыв ${rank - control.seats}`,
    detail: source,
  };
}

export function formatKnown(value: number | null, suffix = ""): string {
  return value === null ? "нет данных в выгрузке" : `${value}${suffix}`;
}
