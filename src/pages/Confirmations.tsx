import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import {
  Application,
  DashboardMeta,
  getDashboardData,
  hasBudgetConsent,
  hasPaidContract,
} from "@/data/applications";
import {
  AdmissionControl,
  formatKnown,
  getActiveRank,
  getAdmissionControl,
  getDecision,
} from "@/data/admission-control";

type Kind = "consent" | "contract";

type Entry = { app: Application; control: AdmissionControl };

const Confirmations = () => {
  const [meta, setMeta] = useState<DashboardMeta | null>(null);
  const [apps, setApps] = useState<Application[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Подтверждения Елисея";
    getDashboardData()
      .then((data) => {
        setMeta(data.meta);
        setApps(data.applications);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Не удалось получить данные.");
      });
  }, []);

  const budgetConsents = useMemo<Entry[]>(
    () => apps.filter(hasBudgetConsent).map((app) => ({ app, control: getAdmissionControl(app) })),
    [apps]
  );
  const paidContracts = useMemo<Entry[]>(
    () => apps.filter(hasPaidContract).map((app) => ({ app, control: getAdmissionControl(app) })),
    [apps]
  );

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-lg p-6 shadow-card">
          <h1 className="font-semibold text-lg">Данные пока не загрузились</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </Card>
      </div>
    );
  }

  if (!meta) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Загрузка данных…</div>;
  }

  const nothing = budgetConsents.length === 0 && paidContracts.length === 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-header text-primary-foreground">
        <div className="container py-8 md:py-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest opacity-70 mb-2">Приёмная кампания · 2026</p>
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Подтверждения Елисея</h1>
              <p className="mt-2 text-sm md:text-base opacity-80">
                Абитуриент №{meta.candidateId} · Актуальность данных: {meta.lastUpdate}
              </p>
            </div>
            <Link to="/" className="text-sm underline underline-offset-4 opacity-90 hover:opacity-100">
              ← На главную
            </Link>
          </div>
        </div>
      </header>

      <main className="container py-8 md:py-10 space-y-10">
        {nothing && (
          <Card className="p-6 shadow-card">
            <p className="text-sm text-muted-foreground">
              Пока нет ни поданных согласий, ни заключённых договоров. Как только они появятся в источнике, они отобразятся здесь.
            </p>
          </Card>
        )}

        {budgetConsents.length > 0 && (
          <ConfirmationSection
            title="Бюджет · поданные согласия"
            accent="success"
            entries={budgetConsents}
            kind="consent"
          />
        )}

        {budgetConsents.length > 0 && paidContracts.length > 0 && (
          <div className="border-t border-border" />
        )}

        {paidContracts.length > 0 && (
          <ConfirmationSection
            title="Платное · заключённые договоры"
            accent="accent"
            entries={paidContracts}
            kind="contract"
          />
        )}
      </main>
    </div>
  );
};

function ConfirmationSection({
  title,
  accent,
  entries,
  kind,
}: {
  title: string;
  accent: "success" | "accent";
  entries: Entry[];
  kind: Kind;
}) {
  const grouped = useMemo(() => groupByUniversity(entries), [entries]);
  const dot = accent === "success" ? "bg-success" : "bg-accent";

  return (
    <section>
      <div className="flex items-baseline justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
          <h2 className="text-lg md:text-xl font-semibold tracking-tight">{title}</h2>
        </div>
        <span className="text-sm text-muted-foreground tabular-nums">{entries.length}</span>
      </div>

      <div className="space-y-6">
        {grouped.map(([university, list]) => (
          <div key={university}>
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="text-sm md:text-base font-medium text-foreground">{university}</h3>
              <span className="text-xs text-muted-foreground tabular-nums">{list.length}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {list.map((entry) => (
                <ConfirmationCard key={entry.app.id} entry={entry} kind={kind} accent={accent} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function groupByUniversity(entries: Entry[]): Array<[string, Entry[]]> {
  const map = new Map<string, Entry[]>();
  for (const e of entries) {
    const arr = map.get(e.app.university) ?? [];
    arr.push(e);
    map.set(e.app.university, arr);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => a.app.priority - b.app.priority);
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "ru"));
}

function ConfirmationCard({
  entry,
  kind,
  accent,
}: {
  entry: Entry;
  kind: Kind;
  accent: "success" | "accent";
}) {
  const { app, control } = entry;
  const isConsent = kind === "consent";
  const borderClass = accent === "success" ? "border-l-success" : "border-l-accent";
  const badgeClass = accent === "success" ? "bg-success/10 text-success" : "bg-accent/10 text-accent";
  const badgeText = isConsent ? "Бюджет" : "Платное";
  const typeLabel = isConsent ? "Тип согласия" : "Договор";
  const typeValue = isConsent ? app.consentRaw : app.contractRaw;

  const activeRank = getActiveRank(app, control);
  const isActive =
    (isConsent && control.consentRank !== null) ||
    (!isConsent && control.contractRank !== null);
  const positionLabel = isActive ? "Активная позиция" : "Общая позиция";
  const positionValue = isActive ? String(activeRank ?? app.position) : String(app.position);

  const decision = getDecision(app, control);
  const decisionClass =
    decision.kind === "within"
      ? "bg-success/10 text-success"
      : decision.kind === "reserve"
      ? "bg-warning/15 text-warning-foreground"
      : "bg-secondary text-muted-foreground";

  return (
    <Card className={`p-4 md:p-5 shadow-card border-l-4 ${borderClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-sm leading-snug">{app.group}</div>
          <div className="text-xs text-muted-foreground mt-1">Приоритет {app.priority}</div>
        </div>
        <span className={`inline-block text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${badgeClass}`}>
          {badgeText}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-x-3 gap-y-2 mt-3 text-xs">
        <Field label="Балл" value={String(app.score)} />
        <Field label={positionLabel} value={positionValue} />
        <Field label="Мест" value={formatKnown(control.seats)} />
        <Field label={typeLabel} value={typeValue || "—"} />
        <Field label="Снимок" value={app.snapshot} />
      </div>

      <div className="mt-3">
        <span className={`inline-block text-[11px] px-2 py-1 rounded ${decisionClass}`}>
          {decision.label}
        </span>
        <div className="text-[11px] text-muted-foreground mt-1">{decision.detail}</div>
      </div>

      <div className="mt-3 pt-3 border-t flex items-center justify-end text-[11px]">
        <Link
          to={`/dynamics?groupId=${encodeURIComponent(app.id)}`}
          className="text-primary underline underline-offset-2"
        >
          Полная динамика →
        </Link>
      </div>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium text-foreground mt-0.5">{value}</div>
    </div>
  );
}

export default Confirmations;
