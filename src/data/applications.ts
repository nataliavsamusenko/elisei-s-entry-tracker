export type Basis = "Бюджет" | "Платное";
export type Status = string;

export interface AdmissionControlData {
  seats: number | null;
  semesterFeeText: string | null;
  contractsCount: number | null;
  contractsAbove: number | null;
  consentsCount: number | null;
  consentsAbove: number | null;
  contractRank: number | null;
  consentRank: number | null;
  sourceNote: string;
}

export interface Application {
  id: string;
  university: string;
  basis: Basis;
  group: string;
  priority: number;
  score: number;
  scoreBreakdown: string;
  position: number;
  status: Status;
  consent: string;
  snapshot: string;
  control: AdmissionControlData;
  generalChange: string;
  activeChange: string;
}

export interface CoverageEntry {
  university: string;
  received: number;
  total: number;
}

export interface DashboardMeta {
  candidateId: string;
  candidateName: string;
  lastUpdate: string;
  totalGroups: number;
  budgetTotal: number;
  paidTotal: number;
  receivedTotal: number;
  budgetReceived: number;
  paidReceived: number;
  stage: string;
}

export interface DashboardData {
  meta: DashboardMeta;
  applications: Application[];
  coverage: CoverageEntry[];
}

type ApiNumber = number | null | undefined;

type ApiApplication = {
  id: string;
  university: string;
  basis: string;
  group: string;
  priority: ApiNumber;
  score: ApiNumber;
  generalPosition: ApiNumber;
  status?: string;
  snapshot?: string;
  consent?: string;
  contract?: string;
  seats?: ApiNumber;
  contractsCount?: ApiNumber;
  contractsAbove?: ApiNumber;
  consentsCount?: ApiNumber;
  consentsAbove?: ApiNumber;
  contractRank?: ApiNumber;
  consentRank?: ApiNumber;
  activeSource?: string;
  semesterFeeText?: string | null;
  generalChange?: string;
  activeChange?: string;
  hasList?: boolean;
};

type ApiPayload = {
  meta: Omit<DashboardMeta, "candidateName">;
  applications: ApiApplication[];
  coverage: CoverageEntry[];
};

function toNumber(value: ApiNumber, field: string, app: ApiApplication): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(`В API нет числового поля «${field}» для группы «${app.group}» (${app.id}).`);
}

function toNullableNumber(value: ApiNumber): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toBasis(value: string): Basis {
  if (value === "Бюджет" || value === "Платное") return value;
  throw new Error(`Неизвестная основа поступления в API: «${value}».`);
}

function mapApplication(app: ApiApplication): Application {
  const basis = toBasis(app.basis);
  const confirmation = basis === "Бюджет"
    ? `Согласие: ${app.consent || "—"}`
    : `Договор: ${app.contract || "—"}`;

  return {
    id: String(app.id),
    university: app.university,
    basis,
    group: app.group,
    priority: toNumber(app.priority, "Приоритет", app),
    score: toNumber(app.score, "Балл Елисея", app),
    scoreBreakdown: "",
    position: toNumber(app.generalPosition, "Позиция общая", app),
    status: app.status || "Нет данных",
    consent: confirmation,
    snapshot: app.snapshot || "Нет даты списка",
    control: {
      seats: toNullableNumber(app.seats),
      semesterFeeText: app.semesterFeeText ?? null,
      contractsCount: toNullableNumber(app.contractsCount),
      contractsAbove: toNullableNumber(app.contractsAbove),
      consentsCount: toNullableNumber(app.consentsCount),
      consentsAbove: toNullableNumber(app.consentsAbove),
      contractRank: toNullableNumber(app.contractRank),
      consentRank: toNullableNumber(app.consentRank),
      sourceNote: app.activeSource || "Предварительно по общей позиции",
    },
    generalChange: app.generalChange || "Нет предыдущего списка",
    activeChange: app.activeChange || "Нет сопоставимой активной позиции",
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  const endpoint = import.meta.env.VITE_GAS_ENDPOINT;

  if (!endpoint) {
    throw new Error("Не задан адрес read-only API. Добавьте VITE_GAS_ENDPOINT в настройки проекта.");
  }

  const response = await fetch(endpoint, {
    cache: "no-store",
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`API вернул ошибку ${response.status}.`);
  }

  const payload = await response.json() as ApiPayload;

  if (!payload?.meta || !Array.isArray(payload.applications) || !Array.isArray(payload.coverage)) {
    throw new Error("API вернул ответ в неожиданном формате.");
  }

  return {
    meta: { ...payload.meta, candidateName: "Елисей" },
    applications: payload.applications.filter((app) => app.hasList).map(mapApplication),
    coverage: payload.coverage,
  };
}

export function buildAnalyticalPhrase(app: Application): string {
  const above = app.position - 1;
  return app.basis === "Бюджет"
    ? `Выше ${above} абитуриентов. Для точной оценки нужны квота и число абитуриентов выше с подтверждённым согласием.`
    : `Выше ${above} абитуриентов. Для точной оценки нужны договорные места и количество договоров выше по списку.`;
}
