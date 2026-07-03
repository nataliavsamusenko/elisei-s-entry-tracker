import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Application,
  CoverageEntry,
  DashboardMeta,
  buildAnalyticalPhrase,
  getDashboardData,
} from "@/data/applications";

const Index = () => {
  const [meta, setMeta] = useState<DashboardMeta | null>(null);
  const [apps, setApps] = useState<Application[]>([]);
  const [coverage, setCoverage] = useState<CoverageEntry[]>([]);
  const [uniFilter, setUniFilter] = useState<string>("all");
  const [basisFilter, setBasisFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    getDashboardData().then((d) => {
      setMeta(d.meta);
      setApps(d.applications);
      setCoverage(d.coverage);
    });
  }, []);

  const universities = useMemo(
    () => Array.from(new Set(apps.map((a) => a.university))),
    [apps]
  );

  const filtered = useMemo(() => {
    return apps.filter((a) => {
      if (uniFilter !== "all" && a.university !== uniFilter) return false;
      if (basisFilter !== "all" && a.basis !== basisFilter) return false;
      if (query && !a.group.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [apps, uniFilter, basisFilter, query]);

  const top6 = useMemo(
    () => [...apps].sort((a, b) => a.position - b.position).slice(0, 6),
    [apps]
  );
  const maxTop = top6.length ? Math.max(...top6.map((t) => t.position)) : 1;

  if (!meta) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Загрузка данных…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-gradient-header text-primary-foreground">
        <div className="container py-8 md:py-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest opacity-70 mb-2">
                Приёмная кампания · 2026
              </p>
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
                Трекер поступления Елисея
              </h1>
              <p className="mt-2 text-sm md:text-base opacity-80">
                Абитуриент №{meta.candidateId} · Актуальность данных: {meta.lastUpdate}
              </p>
            </div>
            <div className="flex flex-col items-start md:items-end gap-2">
              <Badge className="bg-warning text-warning-foreground hover:bg-warning border-0 text-sm px-3 py-1">
                {meta.stage}
              </Badge>
              <span className="text-xs opacity-70">
                Общая позиция ≠ прогноз поступления
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-8 md:py-10 space-y-8">
        {/* KPIs */}
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
          <KpiCard label="Списков получено" value={`${meta.receivedTotal} / ${meta.totalGroups}`} sub={`${Math.round((meta.receivedTotal/meta.totalGroups)*100)}% покрытия`} />
          <KpiCard label="Бюджет" value={`${meta.budgetReceived} / ${meta.budgetTotal}`} sub="конкурсных групп" />
          <KpiCard label="Платное" value={`${meta.paidReceived} / ${meta.paidTotal}`} sub="конкурсных групп" />
          <KpiCard label="Диапазон баллов" value="191–194" sub="по полученным спискам" />
          <KpiCard label="Лучшая позиция" value="43" sub="СПбГУПТД · Бухучёт" highlight />
        </section>

        {/* Info block */}
        <Card className="p-5 md:p-6 shadow-card border-l-4 border-l-accent">
          <h2 className="text-base md:text-lg font-semibold mb-2">Как читать эти цифры</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Общая позиция в списке — это <strong className="text-foreground">не прогноз поступления</strong>.
            Для оценки шансов на <strong className="text-foreground">бюджете</strong> нужны план мест и число
            абитуриентов выше по списку с поданным согласием и более высоким приоритетом. Для{" "}
            <strong className="text-foreground">платного</strong> — число договорных мест и количество уже
            заключённых договоров выше по списку. Пока получено 20 из 60 списков — картина неполная.
          </p>
        </Card>

        {/* Score profile */}
        <section>
          <SectionTitle>Профиль баллов</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ScoreCard total={194} breakdown="70 / 61 / 60" ai={3} />
            <ScoreCard total={192} breakdown="70 / 60 / 61" ai={1} />
            <ScoreCard total={191} breakdown="70 / 60 / 61" ai={0} />
          </div>
          <p className="text-xs text-muted-foreground mt-3 italic">
            CSV не расшифровывает порядок предметов. Конкретные названия (математика, русский, третий предмет)
            появятся после подключения справочника «конкурсная группа → предметы».
          </p>
        </section>

        {/* Top 6 positions */}
        <section>
          <SectionTitle>Ближайшие текущие позиции · топ-6</SectionTitle>
          <Card className="p-5 md:p-6 shadow-card">
            <div className="space-y-4">
              {top6.map((t) => (
                <div key={t.id} className="grid grid-cols-12 items-center gap-3">
                  <div className="col-span-12 md:col-span-5">
                    <div className="text-sm font-medium">{t.university} · {t.basis}</div>
                    <div className="text-xs text-muted-foreground line-clamp-1">{t.group}</div>
                  </div>
                  <div className="col-span-8 md:col-span-5">
                    <div className="h-2 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${Math.max(6, ((maxTop - t.position + 10) / (maxTop + 10)) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="col-span-4 md:col-span-2 flex items-center justify-end gap-3">
                    <span className="text-xs text-muted-foreground">{t.score} б.</span>
                    <span className="text-lg font-semibold tabular-nums">#{t.position}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>

        {/* Table with filters */}
        <section>
          <SectionTitle>Все полученные записи</SectionTitle>
          <Card className="p-4 md:p-5 shadow-card">
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="flex-1 min-w-[180px]">
                <Input
                  placeholder="Поиск по названию группы…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <Select value={uniFilter} onValueChange={setUniFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Вуз" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все вузы</SelectItem>
                  {universities.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
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
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                    <th className="py-3 px-3">Вуз · Основа</th>
                    <th className="py-3 px-3">Конкурсная группа</th>
                    <th className="py-3 px-3 text-center">Приор.</th>
                    <th className="py-3 px-3 text-center">Балл</th>
                    <th className="py-3 px-3">Состав</th>
                    <th className="py-3 px-3 text-center">Позиция</th>
                    <th className="py-3 px-3">Статус</th>
                    <th className="py-3 px-3">Согл./Догов.</th>
                    <th className="py-3 px-3">Комментарий</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => (
                    <tr key={a.id} className="border-b last:border-b-0 hover:bg-secondary/50 transition-colors align-top">
                      <td className="py-3 px-3">
                        <div className="font-medium">{a.university}</div>
                        <BasisBadge basis={a.basis} />
                      </td>
                      <td className="py-3 px-3 max-w-[240px]">{a.group}</td>
                      <td className="py-3 px-3 text-center tabular-nums">{a.priority}</td>
                      <td className="py-3 px-3 text-center font-semibold tabular-nums">{a.score}</td>
                      <td className="py-3 px-3 text-xs text-muted-foreground whitespace-nowrap">{a.scoreBreakdown}</td>
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex items-center justify-center min-w-[44px] px-2 py-1 rounded-md bg-secondary font-semibold tabular-nums">
                          {a.position}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-xs">{a.status}</td>
                      <td className="py-3 px-3 text-xs text-muted-foreground">{a.consent}</td>
                      <td className="py-3 px-3 text-xs text-muted-foreground max-w-[280px]">
                        {buildAnalyticalPhrase(a)}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">Ничего не найдено</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Coverage */}
          <section>
            <SectionTitle>Покрытие списками по вузам</SectionTitle>
            <Card className="p-5 md:p-6 shadow-card space-y-4">
              {coverage.map((c) => {
                const pct = (c.received / c.total) * 100;
                return (
                  <div key={c.university}>
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className="font-medium">{c.university}</span>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {c.received} из {c.total}
                      </span>
                    </div>
                    <Progress value={pct} className="h-2" />
                  </div>
                );
              })}
            </Card>
          </section>

          {/* Needed data */}
          <section>
            <SectionTitle>Что ещё нужно для точной оценки</SectionTitle>
            <Card className="p-5 md:p-6 shadow-card">
              <ul className="space-y-3 text-sm">
                {[
                  "Количество мест по каждой конкурсной группе (бюджет и платное).",
                  "Максимум и минимум баллов по всей выгрузке — контекст силы конкурса.",
                  "Общее количество заявлений в каждой группе.",
                  "Позиция среди подавших согласие (бюджет) и заключивших договор (платное).",
                  "Динамика к предыдущему снимку — движение вверх/вниз.",
                  "Справочник «конкурсная группа → математика / русский / третий предмет».",
                ].map((t, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                    <span className="text-muted-foreground">{t}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 pt-4 border-t text-xs text-muted-foreground">
                Эти поля будут рассчитаны автоматически после подключения источника данных (JSON endpoint
                Google Apps Script).
              </div>
            </Card>
          </section>
        </div>

        <footer className="pt-6 pb-4 text-center text-xs text-muted-foreground">
          Демо-данные · В коде подготовлен адаптер <code className="text-foreground">getDashboardData()</code> для переключения на живой источник.
        </footer>
      </main>
    </div>
  );
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4 tracking-tight">{children}</h2>;
}

function KpiCard({
  label, value, sub, highlight,
}: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <Card className={`p-4 md:p-5 shadow-card ${highlight ? "bg-primary text-primary-foreground" : ""}`}>
      <div className={`text-[11px] uppercase tracking-wider ${highlight ? "opacity-80" : "text-muted-foreground"}`}>
        {label}
      </div>
      <div className="mt-1.5 text-2xl md:text-3xl font-semibold tracking-tight tabular-nums">
        {value}
      </div>
      {sub && (
        <div className={`text-xs mt-1 ${highlight ? "opacity-80" : "text-muted-foreground"}`}>{sub}</div>
      )}
    </Card>
  );
}

function ScoreCard({ total, breakdown, ai }: { total: number; breakdown: string; ai: number }) {
  return (
    <Card className="p-5 shadow-card">
      <div className="flex items-baseline gap-3">
        <div className="text-4xl font-semibold tracking-tight tabular-nums">{total}</div>
        <div className="text-xs text-muted-foreground uppercase tracking-wider">баллов</div>
      </div>
      <div className="mt-3 text-sm">
        <span className="text-muted-foreground">Предметы (порядок из CSV):</span>{" "}
        <span className="font-medium tabular-nums">{breakdown}</span>
      </div>
      <div className="mt-1 text-sm">
        <span className="text-muted-foreground">Индивидуальные достижения:</span>{" "}
        <span className="font-medium tabular-nums">+{ai}</span>
      </div>
    </Card>
  );
}

function BasisBadge({ basis }: { basis: "Бюджет" | "Платное" }) {
  const isBudget = basis === "Бюджет";
  return (
    <span className={`inline-block mt-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
      isBudget ? "bg-success/10 text-success" : "bg-accent/10 text-accent"
    }`}>
      {basis}
    </span>
  );
}

export default Index;
