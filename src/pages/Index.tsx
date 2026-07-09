import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Application,
  CoverageEntry,
  DashboardMeta,
  getDashboardData,
} from "@/data/applications";
import {
  AdmissionControl,
  formatKnown,
  getActiveRank,
  getAdmissionControl,
  getDecision,
} from "@/data/admission-control";

type ControlledApplication = {
  app: Application;
  control: AdmissionControl;
};

const Index = () => {
  const [meta, setMeta] = useState<DashboardMeta | null>(null);
  const [apps, setApps] = useState<Application[]>([]);
  const [coverage, setCoverage] = useState<CoverageEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uniFilter, setUniFilter] = useState<string>("all");
  const [basisFilter, setBasisFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    getDashboardData()
      .then((data) => {
        setMeta(data.meta);
        setApps(data.applications);
        setCoverage(data.coverage);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Не удалось получить данные из API.");
      });
  }, []);

  const controlled = useMemo<ControlledApplication[]>(
    () => apps.map((app) => ({ app, control: getAdmissionControl(app) })),
    [apps]
  );

  const universities = useMemo(
    () => Array.from(new Set(apps.map((item) => item.university))),
    [apps]
  );

  const filtered = useMemo(() => controlled.filter(({ app }) => {
    if (uniFilter !== "all" && app.university !== uniFilter) return false;
    if (basisFilter !== "all" && app.basis !== basisFilter) return false;
    return !query || app.group.toLowerCase().includes(query.toLowerCase());
  }), [controlled, uniFilter, basisFilter, query]);

  const budgetApps = controlled.filter(({ app }) => app.basis === "Бюджет");
  const paidApps = controlled.filter(({ app }) => app.basis === "Платное");
  const withinQuota = controlled.filter(({ app, control }) => getDecision(app, control).kind === "within").length;
  const reserve = controlled.filter(({ app, control }) => getDecision(app, control).kind === "reserve").length;
  const missingData = controlled.filter(({ app, control }) => (
    control.seats === null || (app.basis === "Платное" ? control.contractsCount === null : control.consentsCount === null)
  )).length;
  const paidFreeKnown = paidApps
    .filter(({ control }) => control.seats !== null && control.contractsCount !== null)
    .reduce((sum, { control }) => sum + Math.max(0, (control.seats ?? 0) - (control.contractsCount ?? 0)), 0);
  const paidFreeIsKnown = paidApps.some(({ control }) => control.seats !== null && control.contractsCount !== null);

  const rankValue = ({ app, control }: ControlledApplication) => getActiveRank(app, control) ?? Number.MAX_SAFE_INTEGER;
  const topBudget = [...budgetApps].sort((a, b) => rankValue(a) - rankValue(b)).slice(0, 3);
  const topPaid = [...paidApps].sort((a, b) => rankValue(a) - rankValue(b)).slice(0, 3);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-lg p-6 shadow-card">
          <h1 className="font-semibold text-lg">Данные пока не загрузились</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <p className="mt-4 text-xs text-muted-foreground">Проверьте публикацию read-only API и обновите страницу.</p>
        </Card>
      </div>
    );
  }

  if (!meta) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Загрузка данных…</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-header text-primary-foreground">
        <div className="container py-8 md:py-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest opacity-70 mb-2">Приёмная кампания · 2026</p>
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Трекер поступления Елисея</h1>
              <p className="mt-2 text-sm md:text-base opacity-80">Абитуриент №{meta.candidateId} · Актуальность данных: {meta.lastUpdate}</p>
            </div>
            <div className="flex flex-col items-start md:items-end gap-3">
              <Badge className="bg-warning text-warning-foreground hover:bg-warning border-0 text-sm px-3 py-1">{formatDashboardStage(meta.stage)}</Badge>
              <div className="flex flex-col items-start md:items-end gap-1">
                <Link to="/changes" className="text-sm underline underline-offset-4 opacity-90 hover:opacity-100">Изменения списков</Link>
                <Link to="/dynamics" className="text-sm underline underline-offset-4 opacity-90 hover:opacity-100">Полная динамика позиций</Link>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-8 md:py-10 space-y-8">
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
          <KpiCard label="В пределах квоты" value={String(withinQuota)} sub="по доступным квотам" />
          <KpiCard label="В резерве" value={String(reserve)} sub="по доступным позициям" />
          <KpiCard label="Свободных платных мест" value={paidFreeIsKnown ? String(paidFreeKnown) : "—"} sub={paidFreeIsKnown ? "по опубликованным договорам" : "нет данных по договорам"} />
          <KpiCard label="Нужны данные" value={String(missingData)} sub="групп требуют уточнения" />
          <KpiCard label="Списков получено" value={`${meta.receivedTotal} / ${meta.totalGroups}`} sub={`${Math.round((meta.receivedTotal / meta.totalGroups) * 100)}% покрытия`} highlight />
        </section>

        <Card className="p-5 md:p-6 shadow-card border-l-4 border-l-accent">
          <h2 className="text-base md:text-lg font-semibold mb-2">Как читать контроль поступления</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Основная страница показывает текущую позицию и движение к предыдущему снимку. Полная последовательность снимков доступна на странице «Полная динамика позиций».
            Когда согласия или договоры не подтверждены для Елисея, расчёт остаётся ориентиром по общей позиции.
          </p>
        </Card>

        <section>
          <SectionTitle>Лучшие позиции Елисея</SectionTitle>
          <p className="text-sm text-muted-foreground mb-4">Топ-3 по минимальной доступной позиции: по согласиям или договорам, когда они подтверждены; иначе по общей позиции.</p>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <TopPositions title="Лучшие позиции на бюджете" basis="Бюджет" items={topBudget} />
            <TopPositions title="Лучшие позиции на платном" basis="Платное" items={topPaid} />
          </div>
        </section>

        <section>
          <SectionTitle>Контроль поступления</SectionTitle>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <ControlList title="Бюджет: согласия и места" items={budgetApps} />
            <ControlList title="Платное: договоры и стоимость" items={paidApps} />
          </div>
        </section>

        <section>
          <SectionTitle>Все полученные записи</SectionTitle>
          <Card className="p-4 md:p-5 shadow-card">
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="flex-1 min-w-[180px]">
                <Input placeholder="Поиск по названию группы…" value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
              <Select value={uniFilter} onValueChange={setUniFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Вуз" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все вузы</SelectItem>
                  {universities.map((university) => <SelectItem key={university} value={university}>{university}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={basisFilter} onValueChange={setBasisFilter}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Основа" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все основы</SelectItem>
                  <SelectItem value="Бюджет">Бюджет</SelectItem>
                  <SelectItem value="Платное">Платное</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="overflow-x-auto -mx-4 md:mx-0">
              <table className="w-full text-sm min-w-[1250px]">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                    <th className="py-3 px-3">Вуз · основа</th>
                    <th className="py-3 px-3">Конкурсная группа</th>
                    <th className="py-3 px-3 text-center">Приор.</th>
                    <th className="py-3 px-3 text-center">Балл</th>
                    <th className="py-3 px-3 text-center">Общая поз.</th>
                    <th className="py-3 px-3">Движение</th>
                    <th className="py-3 px-3">Квота / активность</th>
                    <th className="py-3 px-3">Стоимость</th>
                    <th className="py-3 px-3">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(({ app, control }) => {
                    const decision = getDecision(app, control);
                    const activity = app.basis === "Бюджет"
                      ? `Согласия: ${formatKnown(control.consentsCount)}`
                      : `Договоры: ${formatKnown(control.contractsCount)}`;
                    return (
                      <tr key={app.id} className="border-b last:border-b-0 hover:bg-secondary/50 transition-colors align-top">
                        <td className="py-3 px-3"><div className="font-medium">{app.university}</div><BasisBadge basis={app.basis} /></td>
                        <td className="py-3 px-3 max-w-[240px]"><div>{app.group}</div><Link to={`/dynamics?groupId=${encodeURIComponent(app.id)}`} className="text-xs text-primary underline underline-offset-2">История</Link></td>
                        <td className="py-3 px-3 text-center tabular-nums">{app.priority}</td>
                        <td className="py-3 px-3 text-center font-semibold tabular-nums">{app.score}</td>
                        <td className="py-3 px-3 text-center"><span className="inline-flex items-center justify-center min-w-[44px] px-2 py-1 rounded-md bg-secondary font-semibold tabular-nums">{app.position}</span></td>
                        <td className="py-3 px-3 text-xs"><MovementText value={app.generalChange} /><div className="text-muted-foreground mt-1">активная: {app.activeChange}</div></td>
                        <td className="py-3 px-3 text-xs"><div>Мест: {control.seats ?? "не сопоставлено"}</div><div className="text-muted-foreground mt-1">{activity}</div></td>
                        <td className="py-3 px-3 text-xs text-muted-foreground">{app.basis === "Платное" ? (control.semesterFeeText ?? "Стоимость уточняется") : "—"}</td>
                        <td className="py-3 px-3"><DecisionBadge kind={decision.kind} label={decision.label} /><div className="text-[11px] text-muted-foreground mt-1">{decision.detail}</div></td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">Ничего не найдено</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section>
            <SectionTitle>Покрытие списками по вузам</SectionTitle>
            <Card className="p-5 md:p-6 shadow-card space-y-4">
              {coverage.map((item) => {
                const percent = (item.received / item.total) * 100;
                return <div key={item.university}>
                  <div className="flex items-baseline justify-between mb-1.5"><span className="font-medium">{item.university}</span><span className="text-sm text-muted-foreground tabular-nums">{item.received} из {item.total}</span></div>
                  <Progress value={percent} className="h-2" />
                </div>;
              })}
            </Card>
          </section>
          <section>
            <SectionTitle>Следующая контрольная точка</SectionTitle>
            <Card className="p-5 md:p-6 shadow-card">
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li>• Новые списки добавят точку в историю выбранной конкурсной группы.</li>
                <li>• Договоры и согласия могут сформировать активную позицию.</li>
                <li>• Квоты и стоимость обновляются из листа «План мест».</li>
                <li>• На главной странице появится сравнение текущей позиции с предыдущей.</li>
              </ul>
            </Card>
          </section>
        </div>

        <footer className="pt-4 pb-4 text-center text-xs text-muted-foreground">
          Текущие списки и история — из трекера поступления. Квоты и стоимость — из листа «План мест».
        </footer>
      </main>
    </div>
  );
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4 tracking-tight">{children}</h2>;
}

function KpiCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return <Card className={`p-4 md:p-5 shadow-card ${highlight ? "bg-primary text-primary-foreground" : ""}`}>
    <div className={`text-[11px] uppercase tracking-wider ${highlight ? "opacity-80" : "text-muted-foreground"}`}>{label}</div>
    <div className="mt-1.5 text-2xl md:text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
    {sub && <div className={`text-xs mt-1 ${highlight ? "opacity-80" : "text-muted-foreground"}`}>{sub}</div>}
  </Card>;
}

function TopPositions({ title, basis, items }: { title: string; basis: "Бюджет" | "Платное"; items: ControlledApplication[] }) {
  return <Card className="p-4 md:p-5 shadow-card">
    <div className="flex items-start justify-between gap-3 mb-4">
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground mt-1">Меньше номер позиции — выше место в списке.</p>
      </div>
      <BasisBadge basis={basis} />
    </div>

    <div className="space-y-3">
      {items.map(({ app, control }, index) => {
        const activeRank = getActiveRank(app, control);
        const isActiveRank = basis === "Бюджет" ? control.consentRank !== null : control.contractRank !== null;
        const rankSource = isActiveRank ? basis === "Бюджет" ? "по согласиям" : "по договорам" : "общая позиция";

        return <div key={app.id} className="flex gap-3 rounded-lg border p-3 bg-card">
          <div className="shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-sm font-semibold tabular-nums">{index + 1}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-sm leading-snug">{app.group}</div>
                <div className="text-xs text-muted-foreground mt-1">{app.university} · приоритет {app.priority}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xl font-semibold tabular-nums">№ {activeRank ?? "—"}</div>
                <div className="text-[11px] text-muted-foreground">{rankSource}</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <QuotaBadge seats={control.seats} />
              <span className="text-[11px] text-muted-foreground">общая: № {app.position}</span>
              <MovementText value={app.generalChange} compact />
            </div>
          </div>
        </div>;
      })}
      {items.length === 0 && <p className="text-sm text-muted-foreground">Пока нет полученных списков.</p>}
    </div>
  </Card>;
}

function ControlList({ title, items }: { title: string; items: ControlledApplication[] }) {
  return <Card className="p-4 md:p-5 shadow-card">
    <h3 className="font-semibold mb-4">{title}</h3>
    <div className="space-y-3">
      {items.map(({ app, control }) => <ControlCard key={app.id} app={app} control={control} />)}
    </div>
  </Card>;
}

function ControlCard({ app, control }: { app: Application; control: AdmissionControl }) {
  const decision = getDecision(app, control);
  const activeRank = getActiveRank(app, control);
  const count = app.basis === "Бюджет" ? control.consentsCount : control.contractsCount;
  const above = app.basis === "Бюджет" ? control.consentsAbove : control.contractsAbove;
  const aboveHigherPriority = app.basis === "Бюджет"
    ? control.consentsAboveHigherPriority
    : control.contractsAboveHigherPriority;
  const activeLabel = app.basis === "Бюджет" ? "Согласий" : "Договоров";
  const freeSeats = app.basis === "Платное" && control.seats !== null && control.contractsCount !== null
    ? Math.max(0, control.seats - control.contractsCount)
    : null;

  return <div className="rounded-lg border p-3.5 bg-card">
    <div className="flex justify-between gap-3">
      <div><div className="font-medium text-sm leading-snug">{app.group}</div><div className="text-xs text-muted-foreground mt-1">{app.university} · приоритет {app.priority}</div></div>
      <BasisBadge basis={app.basis} />
    </div>
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3 text-xs">
      <Metric label="Мест" value={control.seats === null ? "не сопоставлено" : String(control.seats)} />
      <Metric label="Общая позиция" value={String(app.position)} />
      <Metric label="Изменение общей" value={app.generalChange} />
      <Metric label="Изменение активной" value={app.activeChange} />
      <Metric label={`${activeLabel} заключено / подано`} value={formatKnown(count)} />
      <Metric label={`${activeLabel} выше`} value={formatAboveWithPriority(above, aboveHigherPriority)} />
      {app.basis === "Платное" && <Metric label="Свободно по квоте" value={freeSeats === null ? "не рассчитано" : String(freeSeats)} />}
      <Metric label={app.basis === "Бюджет" ? "Позиция по согласиям" : "Позиция по договорам"} value={activeRank === null ? "не рассчитано" : String(activeRank)} />
    </div>
    {app.basis === "Платное" && <div className="mt-3 text-xs"><span className="text-muted-foreground">Стоимость за семестр:</span> <span className="font-medium">{control.semesterFeeText ?? "Стоимость уточняется"}</span></div>}
    <div className="flex items-start justify-between gap-3 mt-3 pt-3 border-t"><div><DecisionBadge kind={decision.kind} label={decision.label} /><div className="text-[11px] text-muted-foreground mt-1">Источник: {decision.detail}</div></div><div className="text-right"><span className="text-[11px] text-muted-foreground">{app.snapshot}</span><Link to={`/dynamics?groupId=${encodeURIComponent(app.id)}`} className="block mt-1 text-[11px] text-primary underline underline-offset-2">Полная история</Link></div></div>
  </div>;
}

function MovementText({ value, compact = false }: { value: string; compact?: boolean }) {
  const lower = value.toLowerCase();
  const tone = lower.startsWith("+") || lower.includes("поднялся") ? "text-success" : lower.startsWith("-") || lower.includes("опустился") ? "text-warning-foreground" : "text-muted-foreground";
  return <span className={`text-[11px] ${tone}`}>{compact ? value : `общая: ${value}`}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><div className="text-muted-foreground">{label}</div><div className="font-medium text-foreground mt-0.5">{value}</div></div>;
}

function QuotaBadge({ seats }: { seats: number | null }) {
  return <span className="inline-flex text-[11px] px-2 py-1 rounded-full bg-secondary text-foreground">Квота: {seats ?? "не сопоставлена"}</span>;
}

function DecisionBadge({ kind, label }: { kind: "within" | "reserve" | "unknown"; label: string }) {
  const style = kind === "within" ? "bg-success/10 text-success" : kind === "reserve" ? "bg-warning/15 text-warning-foreground" : "bg-secondary text-muted-foreground";
  return <span className={`inline-flex text-[11px] px-2 py-1 rounded-full ${style}`}>{label}</span>;
}

function formatAboveWithPriority(total: number | null, higherPriority: number | null): string {
  const totalText = total === null ? "нет данных" : String(total);
  const higherPriorityText = higherPriority === null ? "нет данных" : String(higherPriority);

  return `${totalText}; из них с приоритетом выше: ${higherPriorityText}`;
}

function formatDashboardStage(stage: string): string {
  const lower = stage.toLowerCase();

  return lower.includes("csv") || lower.includes("дашборд") ? "Данные обновлены" : stage;
}

function BasisBadge({ basis }: { basis: "Бюджет" | "Платное" }) {
  const isBudget = basis === "Бюджет";
  return <span className={`inline-block text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${isBudget ? "bg-success/10 text-success" : "bg-accent/10 text-accent"}`}>{basis}</span>;
}

export default Index;
