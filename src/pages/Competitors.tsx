import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CompetitionGroupSummary,
  CompetitionView,
  CompetitorItem,
  getCompetitors,
} from "@/data/applications";

const PAGE_SIZE = 100;

const Competitors = () => {
  const [basis, setBasis] = useState<"Бюджет" | "Платное">("Бюджет");
  const [groupId, setGroupId] = useState("");
  const [scenarioPriority, setScenarioPriority] = useState<number | undefined>();
  const [view, setView] = useState<CompetitionView>("active");
  const [offset, setOffset] = useState(0);

  const overview = useQuery({
    queryKey: ["competitors-overview"],
    queryFn: () => getCompetitors({ limit: 1 }),
  });

  const visibleGroups = useMemo(
    () => (overview.data?.groups ?? []).filter((item) => item.basis === basis),
    [basis, overview.data?.groups],
  );

  useEffect(() => {
    if (!visibleGroups.length) return;
    if (!visibleGroups.some((item) => item.groupId === groupId)) {
      setGroupId(visibleGroups[0].groupId);
    }
  }, [groupId, visibleGroups]);

  const selectedOverview = useMemo(
    () => (overview.data?.groups ?? []).find((item) => item.groupId === groupId),
    [groupId, overview.data?.groups],
  );

  useEffect(() => {
    setScenarioPriority(selectedOverview?.candidatePriority ?? 1);
    setOffset(0);
  }, [selectedOverview?.candidatePriority, selectedOverview?.groupId]);

  const detail = useQuery({
    queryKey: ["competitors-detail", groupId, scenarioPriority, view, offset],
    queryFn: () => getCompetitors({
      groupId,
      scenarioPriority,
      view,
      offset,
      limit: PAGE_SIZE,
    }),
    enabled: Boolean(groupId && scenarioPriority),
    placeholderData: keepPreviousData,
  });

  const summary = detail.data?.detail ?? selectedOverview ?? null;
  const pages = Math.max(1, Math.ceil((detail.data?.total ?? 0) / PAGE_SIZE));
  const page = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-header text-primary-foreground">
        <div className="container py-8 md:py-10">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="mb-2 text-xs uppercase tracking-widest opacity-70">Приёмная кампания · 2026</p>
              <h1 className="text-3xl font-semibold md:text-4xl">Конкуренты Елисея</h1>
              <p className="mt-2 max-w-3xl text-sm opacity-80 md:text-base">
                Кто находится выше в конкретном списке и сколько активных подтверждений уже занимает места
              </p>
            </div>
            <nav className="flex flex-col items-start gap-1 text-sm md:items-end">
              <Link to="/" className="underline underline-offset-4 opacity-90 hover:opacity-100">На главную</Link>
              <Link to="/applicants" className="underline underline-offset-4 opacity-90 hover:opacity-100">Карта всех поступающих</Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="container space-y-8 py-7 md:py-10">
        <section>
          <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-4">
            <div>
              <h2 className="text-xl font-semibold">Ситуация по заявлениям Елисея</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Прогнозная позиция равна числу активных поступающих выше плюс один.
              </p>
            </div>
            <Tabs value={basis} onValueChange={(value) => setBasis(value as "Бюджет" | "Платное")}>
              <TabsList>
                <TabsTrigger value="Бюджет">Бюджет</TabsTrigger>
                <TabsTrigger value="Платное">Платное</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {overview.isLoading && <OverviewSkeleton />}
          {overview.isError && <ErrorBand message={overview.error instanceof Error ? overview.error.message : "Не удалось получить анализ."} />}
          {overview.data && <OverviewTable groups={visibleGroups} selectedId={groupId} onSelect={setGroupId} />}
        </section>

        {summary && (
          <section className="space-y-5">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_190px]">
              <div>
                <label className="mb-2 block text-sm font-medium" htmlFor="competition-group">Конкурсная группа</label>
                <Select value={groupId} onValueChange={setGroupId}>
                  <SelectTrigger id="competition-group"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {visibleGroups.map((item) => (
                      <SelectItem key={item.groupId} value={item.groupId}>
                        {item.university} · {item.groupName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium" htmlFor="scenario-priority">Сценарный приоритет</label>
                <Select
                  value={String(scenarioPriority ?? 1)}
                  onValueChange={(value) => {
                    setScenarioPriority(Number(value));
                    setOffset(0);
                  }}
                >
                  <SelectTrigger id="scenario-priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 15 }, (_, index) => index + 1).map((priority) => (
                      <SelectItem key={priority} value={String(priority)}>Приоритет {priority}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Metric label="Мест" value={summary.seats} />
              <Metric label="Общая позиция" value={summary.candidatePosition} />
              <Metric label={summary.basis === "Бюджет" ? "Согласий выше" : "Договоров выше"} value={summary.activeAhead} />
              <Metric label="Из них приоритет 1" value={summary.priorityOneActiveAhead} />
              <ProjectedMetric summary={summary} />
            </div>

            <div className="grid gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-4">
              <Breakdown label="Приоритет выше" value={summary.higherPriorityActiveAhead} />
              <Breakdown label="Такой же приоритет" value={summary.samePriorityActiveAhead} />
              <Breakdown label="Приоритет ниже" value={summary.lowerPriorityActiveAhead} />
              <Breakdown label="Выше по баллу" value={summary.aheadHigherScore} sub="среди всех стоящих выше" />
            </div>

            <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-4">
              <div>
                <h2 className="text-xl font-semibold">Кто стоит выше</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Коды обезличены. Основной порядок задаёт опубликованная общая позиция.
                </p>
              </div>
              <Select
                value={view}
                onValueChange={(value) => {
                  setView(value as CompetitionView);
                  setOffset(0);
                }}
              >
                <SelectTrigger className="w-full sm:w-[260px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Только активные</SelectItem>
                  <SelectItem value="higherOrEqual">Приоритет выше или равен</SelectItem>
                  <SelectItem value="priority1">Только приоритет 1</SelectItem>
                  <SelectItem value="all">Все стоящие выше</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {detail.isFetching && !detail.data && <CompetitorsSkeleton />}
            {detail.isFetching && detail.data && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <LoaderCircle className="h-4 w-4 animate-spin" /> Пересчитываем сценарий…
              </p>
            )}
            {detail.isError && <ErrorBand message={detail.error instanceof Error ? detail.error.message : "Не удалось получить список конкурентов."} />}
            {detail.data && <CompetitorsTable items={detail.data.items} scenarioPriority={scenarioPriority ?? 1} />}

            {detail.data && detail.data.total > PAGE_SIZE && (
              <div className="flex items-center justify-between gap-3">
                <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                  <ChevronLeft className="mr-1 h-4 w-4" /> Назад
                </Button>
                <span className="text-sm text-muted-foreground">Страница {page} из {pages}</span>
                <Button variant="outline" size="sm" disabled={offset + PAGE_SIZE >= detail.data.total} onClick={() => setOffset(offset + PAGE_SIZE)}>
                  Далее <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
};

const OverviewTable = ({ groups, selectedId, onSelect }: {
  groups: CompetitionGroupSummary[];
  selectedId: string;
  onSelect: (groupId: string) => void;
}) => {
  if (!groups.length) return <p className="py-6 text-sm text-muted-foreground">Нет актуальных списков для выбранной основы.</p>;

  return (
    <div className="mt-4 overflow-hidden rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Вуз и группа</TableHead>
            <TableHead className="text-center">Приоритет</TableHead>
            <TableHead className="text-center">Балл</TableHead>
            <TableHead className="text-center">Мест</TableHead>
            <TableHead className="text-center">Общая поз.</TableHead>
            <TableHead className="text-center">Активных выше</TableHead>
            <TableHead className="text-center">Прогноз</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((item) => (
            <TableRow
              key={item.groupId}
              data-state={item.groupId === selectedId ? "selected" : undefined}
              className="cursor-pointer"
              onClick={() => onSelect(item.groupId)}
            >
              <TableCell className="min-w-[280px]">
                <div className="font-medium">{item.groupName}</div>
                <div className="mt-1 text-xs text-muted-foreground">{item.university} · {item.snapshot}</div>
              </TableCell>
              <TableCell className="text-center tabular-nums">{formatNumber(item.candidatePriority)}</TableCell>
              <TableCell className="text-center tabular-nums">{formatNumber(item.candidateScore)}</TableCell>
              <TableCell className="text-center tabular-nums">{formatNumber(item.seats)}</TableCell>
              <TableCell className="text-center tabular-nums">{formatNumber(item.candidatePosition)}</TableCell>
              <TableCell className="text-center font-medium tabular-nums">{item.activeAhead}</TableCell>
              <TableCell className="text-center"><PositionBadge summary={item} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

const CompetitorsTable = ({ items, scenarioPriority }: { items: CompetitorItem[]; scenarioPriority: number }) => {
  if (!items.length) return <p className="py-6 text-sm text-muted-foreground">По выбранному условию поступающих выше не найдено.</p>;

  return (
    <div className="overflow-hidden rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-center">Позиция</TableHead>
            <TableHead>Код</TableHead>
            <TableHead className="text-center">Балл</TableHead>
            <TableHead className="text-center">Разница</TableHead>
            <TableHead className="text-center">Приоритет</TableHead>
            <TableHead>Подтверждение</TableHead>
            <TableHead>Оценка</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, index) => (
            <TableRow key={`${item.applicantCode}-${item.generalPosition}-${index}`}>
              <TableCell className="text-center font-medium tabular-nums">{formatNumber(item.generalPosition)}</TableCell>
              <TableCell className="font-mono">{item.applicantCode}</TableCell>
              <TableCell className="text-center tabular-nums">{formatNumber(item.score)}</TableCell>
              <TableCell className="text-center tabular-nums">{formatDelta(item.scoreDelta)}</TableCell>
              <TableCell className="text-center tabular-nums">{formatNumber(item.priority)}</TableCell>
              <TableCell>
                <Badge variant={item.confirmed ? "default" : "secondary"}>{item.confirmationLabel}</Badge>
              </TableCell>
              <TableCell><RiskLabel item={item} scenarioPriority={scenarioPriority} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

const RiskLabel = ({ item, scenarioPriority }: { item: CompetitorItem; scenarioPriority: number }) => {
  if (!item.confirmed) return <span className="text-sm text-muted-foreground">Не активен</span>;
  if (item.priority === null) return <span className="text-sm text-muted-foreground">Приоритет неизвестен</span>;
  if (item.priority < scenarioPriority) return <span className="text-sm font-medium text-destructive">Приоритет выше</span>;
  if (item.priority === scenarioPriority) return <span className="text-sm font-medium">Тот же приоритет</span>;
  return <span className="text-sm text-muted-foreground">Приоритет ниже</span>;
};

const Metric = ({ label, value }: { label: string; value: number | null }) => (
  <div className="min-h-[112px] rounded-md border bg-card p-4">
    <p className="text-xs uppercase text-muted-foreground">{label}</p>
    <p className="mt-3 text-3xl font-semibold tabular-nums">{formatNumber(value)}</p>
  </div>
);

const ProjectedMetric = ({ summary }: { summary: CompetitionGroupSummary }) => (
  <div className="min-h-[112px] rounded-md border bg-primary p-4 text-primary-foreground">
    <p className="text-xs uppercase opacity-70">Прогнозная позиция</p>
    <p className="mt-3 text-3xl font-semibold tabular-nums">{formatNumber(summary.projectedActiveRank)}</p>
    <p className="mt-1 text-xs opacity-80">{positionText(summary)}</p>
  </div>
);

const Breakdown = ({ label, value, sub }: { label: string; value: number; sub?: string }) => (
  <div className="bg-card p-4">
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className="mt-2 text-2xl font-semibold tabular-nums">{value.toLocaleString("ru-RU")}</p>
    {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
  </div>
);

const PositionBadge = ({ summary }: { summary: CompetitionGroupSummary }) => {
  if (summary.withinSeats === null) return <Badge variant="secondary">Нет мест</Badge>;
  if (summary.withinSeats) return <Badge className="bg-success hover:bg-success">В местах · № {summary.projectedActiveRank}</Badge>;
  return <Badge variant="destructive">Ниже на {summary.gapToSeats}</Badge>;
};

const positionText = (summary: CompetitionGroupSummary) => {
  if (summary.withinSeats === null) return "количество мест неизвестно";
  if (summary.withinSeats) return `в пределах мест, запас ${Math.abs(summary.gapToSeats ?? 0)}`;
  return `ниже квоты на ${summary.gapToSeats}`;
};

const formatNumber = (value: number | null) => value === null ? "—" : value.toLocaleString("ru-RU");
const formatDelta = (value: number | null) => value === null ? "—" : `${value > 0 ? "+" : ""}${value}`;

const ErrorBand = ({ message }: { message: string }) => (
  <div className="mt-4 rounded-md border border-destructive/30 bg-card p-5">
    <p className="font-medium">Анализ пока недоступен</p>
    <p className="mt-1 text-sm text-muted-foreground">{message}</p>
  </div>
);

const OverviewSkeleton = () => (
  <div className="mt-4 space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
);

const CompetitorsSkeleton = () => (
  <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
);

export default Competitors;
