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

const Confirmations = () => {
  const [meta, setMeta] = useState<DashboardMeta | null>(null);
  const [apps, setApps] = useState<Application[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDashboardData()
      .then((data) => {
        setMeta(data.meta);
        setApps(data.applications);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Не удалось получить данные.");
      });
  }, []);

  const budgetConsents = useMemo(() => apps.filter(hasBudgetConsent), [apps]);
  const paidContracts = useMemo(() => apps.filter(hasPaidContract), [apps]);

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
            <p className="text-sm text-muted-foreground">Пока нет ни согласий, ни договоров.</p>
          </Card>
        )}

        {budgetConsents.length > 0 && (
          <section>
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-lg md:text-xl font-semibold tracking-tight">
                Поданные согласия · Бюджет
              </h2>
              <span className="text-sm text-muted-foreground tabular-nums">{budgetConsents.length}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {budgetConsents.map((app) => (
                <ConfirmationCard key={app.id} app={app} kind="consent" />
              ))}
            </div>
          </section>
        )}

        {budgetConsents.length > 0 && paidContracts.length > 0 && (
          <div className="border-t border-border" />
        )}

        {paidContracts.length > 0 && (
          <section>
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-lg md:text-xl font-semibold tracking-tight">
                Заключённые договоры · Платное
              </h2>
              <span className="text-sm text-muted-foreground tabular-nums">{paidContracts.length}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {paidContracts.map((app) => (
                <ConfirmationCard key={app.id} app={app} kind="contract" />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

function ConfirmationCard({ app, kind }: { app: Application; kind: "consent" | "contract" }) {
  const isConsent = kind === "consent";
  const accent = isConsent ? "border-l-success" : "border-l-accent";
  const badgeClass = isConsent ? "bg-success/10 text-success" : "bg-accent/10 text-accent";
  const badgeText = isConsent ? "Бюджет" : "Платное";
  const typeLabel = isConsent ? "Тип согласия" : "Договор";
  const typeValue = isConsent ? app.consentRaw : app.contractRaw;

  return (
    <Card className={`p-4 md:p-5 shadow-card border-l-4 ${accent}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-sm leading-snug">{app.group}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {app.university} · приоритет {app.priority}
          </div>
        </div>
        <span className={`inline-block text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${badgeClass}`}>
          {badgeText}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-2 mt-3 text-xs">
        <Field label="Балл" value={String(app.score)} />
        <Field label="Общая позиция" value={String(app.position)} />
        <Field label={typeLabel} value={typeValue || "—"} />
      </div>
      <div className="mt-3 pt-3 border-t flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{app.snapshot}</span>
        <Link
          to={`/dynamics?groupId=${encodeURIComponent(app.id)}`}
          className="text-primary underline underline-offset-2"
        >
          История
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
