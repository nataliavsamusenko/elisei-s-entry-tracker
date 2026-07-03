// Data adapter layer. Позже можно заменить getApplications() на fetch() к Google Apps Script.

export type Basis = "Бюджет" | "Платное";
export type Status = "На рассмотрении" | "Участвуете в конкурсе";

export interface Application {
  id: number;
  university: string;
  basis: Basis;
  group: string;
  priority: number;
  score: number;
  scoreBreakdown: string; // "70/60/61 + 1 ИД"
  position: number;
  status: Status;
  consent: string; // "согласие —" / "договор —"
  snapshot: string;
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

const DEMO_APPLICATIONS: Application[] = [
  { id: 1, university: "УрФУ", basis: "Бюджет", group: "Международный и корпоративный менеджмент", priority: 1, score: 192, scoreBreakdown: "70/60/61 + 1 ИД", position: 533, status: "На рассмотрении", consent: "согласие —", snapshot: "03.07.2026 12:11" },
  { id: 2, university: "УрФУ", basis: "Бюджет", group: "Мировая экономика и международный бизнес", priority: 4, score: 192, scoreBreakdown: "70/60/61 + 1 ИД", position: 467, status: "На рассмотрении", consent: "согласие —", snapshot: "03.07.2026 12:20" },
  { id: 3, university: "УрФУ", basis: "Платное", group: "Мировая экономика и международный бизнес", priority: 3, score: 192, scoreBreakdown: "70/60/61 + 1 ИД", position: 271, status: "На рассмотрении", consent: "договор —", snapshot: "03.07.2026 12:18" },
  { id: 4, university: "УрФУ", basis: "Платное", group: "Управление персоналом", priority: 6, score: 192, scoreBreakdown: "70/60/61 + 1 ИД", position: 115, status: "На рассмотрении", consent: "договор —", snapshot: "03.07.2026 12:16" },
  { id: 5, university: "СПбГУПТД", basis: "Платное", group: "Экономика предприятий и организаций", priority: 3, score: 191, scoreBreakdown: "70/60/61 + 0 ИД", position: 79, status: "На рассмотрении", consent: "договор —", snapshot: "03.07.2026 12:52" },
  { id: 6, university: "СПбГУПТД", basis: "Платное", group: "Бизнес-аналитика; Экономика и анализ данных", priority: 4, score: 191, scoreBreakdown: "70/60/61 + 0 ИД", position: 76, status: "Участвуете в конкурсе", consent: "договор —", snapshot: "03.07.2026 12:52" },
  { id: 7, university: "СПбГУПТД", basis: "Платное", group: "Бухгалтерский учёт, аудит и финансовый консалтинг", priority: 6, score: 191, scoreBreakdown: "70/60/61 + 0 ИД", position: 43, status: "На рассмотрении", consent: "договор —", snapshot: "03.07.2026 12:52" },
  { id: 8, university: "СПбГУПТД", basis: "Платное", group: "Маркетинг", priority: 7, score: 191, scoreBreakdown: "70/60/61 + 0 ИД", position: 83, status: "На рассмотрении", consent: "договор —", snapshot: "03.07.2026 12:52" },
  { id: 9, university: "СПбГЭУ", basis: "Платное", group: "Группа «Экономика»", priority: 1, score: 194, scoreBreakdown: "70/61/60 + 3 ИД", position: 697, status: "Участвуете в конкурсе", consent: "договор —", snapshot: "03.07.2026 13:11" },
  { id: 10, university: "СПбГЭУ", basis: "Платное", group: "Группа «Менеджмент»", priority: 2, score: 194, scoreBreakdown: "70/61/60 + 3 ИД", position: 795, status: "Участвуете в конкурсе", consent: "договор —", snapshot: "03.07.2026 13:11" },
  { id: 11, university: "СПбГЭУ", basis: "Платное", group: "Кадровый менеджмент", priority: 8, score: 194, scoreBreakdown: "70/61/60 + 3 ИД", position: 228, status: "Участвуете в конкурсе", consent: "договор —", snapshot: "03.07.2026 13:11" },
  { id: 12, university: "СПбГЭУ", basis: "Платное", group: "Экономика предприятия с углублённым изучением китайского языка", priority: 9, score: 194, scoreBreakdown: "70/61/60 + 3 ИД", position: 244, status: "Участвуете в конкурсе", consent: "договор —", snapshot: "03.07.2026 13:11" },
  { id: 13, university: "СПбПУ", basis: "Бюджет", group: "Торговое дело", priority: 2, score: 191, scoreBreakdown: "70/60/61 + 0 ИД", position: 562, status: "Участвуете в конкурсе", consent: "согласие —", snapshot: "03.07.2026 12:12" },
  { id: 14, university: "СПбПУ", basis: "Бюджет", group: "Экономика", priority: 3, score: 191, scoreBreakdown: "70/60/61 + 0 ИД", position: 1059, status: "Участвуете в конкурсе", consent: "согласие —", snapshot: "03.07.2026 12:17" },
  { id: 15, university: "СПбПУ", basis: "Бюджет", group: "Интеллектуальные системы в гуманитарной сфере", priority: 5, score: 191, scoreBreakdown: "70/60/61 + 0 ИД", position: 213, status: "Участвуете в конкурсе", consent: "согласие —", snapshot: "03.07.2026 12:12" },
  { id: 16, university: "СПбПУ", basis: "Бюджет", group: "Экономика цифрового предприятия", priority: 6, score: 191, scoreBreakdown: "70/60/61 + 0 ИД", position: 287, status: "Участвуете в конкурсе", consent: "согласие —", snapshot: "03.07.2026 12:10" },
  { id: 17, university: "СПбГМТУ", basis: "Бюджет", group: "Группа «Экономика»", priority: 1, score: 191, scoreBreakdown: "70/60/61 + 0 ИД", position: 298, status: "На рассмотрении", consent: "согласие —", snapshot: "03.07.2026" },
  { id: 18, university: "СПбГМТУ", basis: "Бюджет", group: "Группа «Менеджмент»", priority: 2, score: 191, scoreBreakdown: "70/60/61 + 0 ИД", position: 270, status: "На рассмотрении", consent: "согласие —", snapshot: "03.07.2026 12:50" },
  { id: 19, university: "СПбГМТУ", basis: "Платное", group: "Группа «Экономика»", priority: 1, score: 191, scoreBreakdown: "70/60/61 + 0 ИД", position: 147, status: "На рассмотрении", consent: "договор —", snapshot: "03.07.2026" },
  { id: 20, university: "СПбГМТУ", basis: "Платное", group: "Группа «Менеджмент»", priority: 2, score: 191, scoreBreakdown: "70/60/61 + 0 ИД", position: 135, status: "На рассмотрении", consent: "договор —", snapshot: "03.07.2026 12:51" },
];

const DEMO_COVERAGE: CoverageEntry[] = [
  { university: "УрФУ", received: 4, total: 14 },
  { university: "СПбГЭУ", received: 4, total: 15 },
  { university: "СПбПУ", received: 4, total: 15 },
  { university: "СПбГУПТД", received: 4, total: 12 },
  { university: "СПбГМТУ", received: 4, total: 4 },
];

const DEMO_META: DashboardMeta = {
  candidateId: "1431604",
  candidateName: "Елисей",
  lastUpdate: "03.07.2026 13:11",
  totalGroups: 60,
  budgetTotal: 24,
  paidTotal: 36,
  receivedTotal: 20,
  budgetReceived: 8,
  paidReceived: 12,
  stage: "Ранний этап конкурса",
};

// ---- Adapter API ----
// В будущем: заменить на fetch(GAS_ENDPOINT) и вернуть {applications, coverage, meta}.

export interface DashboardData {
  meta: DashboardMeta;
  applications: Application[];
  coverage: CoverageEntry[];
}

export async function getDashboardData(): Promise<DashboardData> {
  // TODO: заменить на реальный вызов Google Apps Script JSON endpoint.
  // Пример:
  // const res = await fetch(import.meta.env.VITE_GAS_ENDPOINT);
  // return await res.json();
  return {
    meta: DEMO_META,
    applications: DEMO_APPLICATIONS,
    coverage: DEMO_COVERAGE,
  };
}

export function buildAnalyticalPhrase(app: Application): string {
  const above = app.position - 1;
  if (app.basis === "Бюджет") {
    return `Выше ${above} абитуриентов. Это общая позиция; для бюджета нужны план мест и количество абитуриентов выше с согласием и более высоким приоритетом.`;
  }
  return `Выше ${above} абитуриентов. Это общая позиция; для платного нужны число договорных мест и количество договоров, заключённых выше по списку.`;
}
