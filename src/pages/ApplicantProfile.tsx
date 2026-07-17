import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileText } from "lucide-react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApplicantApplication, ApplicantProfileData, Basis, getApplicantProfile } from "@/data/applications";

type ProfileLocationState = { profile?: ApplicantProfileData } | null;

const ApplicantProfile = () => {
  const { profileKey = "" } = useParams();
  const location = useLocation();
  const initialProfile = (location.state as ProfileLocationState)?.profile;

  const query = useQuery({
    queryKey: ["applicant-profile", profileKey],
    queryFn: () => getApplicantProfile({ profileKey }),
    initialData: initialProfile,
  });

  const grouped = useMemo(() => groupApplications(query.data?.applications ?? []), [query.data?.applications]);

  if (query.isLoading) {
    return <ProfileLoading />;
  }

  if (query.isError) {
    return <ProfileMessage title="Карточка пока недоступна" message={query.error instanceof Error ? query.error.message : "Не удалось получить данные."} />;
  }

  if (!query.data?.found || !query.data.summary) {
    return <ProfileMessage title="Поступающий не найден" message="Проверьте код или вернитесь к общей карте поступающих." />;
  }

  const profile = query.data;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-header text-primary-foreground">
        <div className="container py-8 md:py-10">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-xs uppercase tracking-widest opacity-70 mb-2">Карточка поступающего</p>
              <h1 className="font-mono text-3xl md:text-4xl font-semibold tracking-normal">{profile.applicantCode}</h1>
              <p className="mt-2 text-sm md:text-base opacity-80">Заявления и подтверждения по последним опубликованным спискам</p>
            </div>
            <nav className="flex flex-col items-start md:items-end gap-1 text-sm">
              <Link to="/applicants" className="inline-flex items-center underline underline-offset-4 opacity-90 hover:opacity-100"><ArrowLeft className="w-4 h-4 mr-1" />К карте поступающих</Link>
              <Link to="/" className="underline underline-offset-4 opacity-90 hover:opacity-100">На главную</Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="container py-7 md:py-10 space-y-8">
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <ProfileKpi label="Вузов" value={profile.summary.universitiesCount} />
          <ProfileKpi label="Заявлений" value={profile.summary.applicationsCount} />
          <ProfileKpi label="Согласий" value={profile.summary.consentsCount} tone="success" />
          <ProfileKpi label="Договоров" value={profile.summary.contractsCount} tone="accent" />
        </section>

        <div className="space-y-10">
          {grouped.map(([university, applications]) => (
            <section key={university}>
              <div className="flex items-baseline justify-between border-b pb-3 mb-5">
                <h2 className="text-xl md:text-2xl font-semibold tracking-tight">{university}</h2>
                <span className="text-sm text-muted-foreground tabular-nums">{applications.length} заявлений</span>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-7">
                <BasisSection basis="Бюджет" applications={applications.filter((item) => item.basis === "Бюджет")} />
                <BasisSection basis="Платное" applications={applications.filter((item) => item.basis === "Платное")} />
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
};

function BasisSection({ basis, applications }: { basis: Basis; applications: ApplicantApplication[] }) {
  if (!applications.length) return <div className="hidden xl:block" />;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-2 h-2 rounded-full ${basis === "Бюджет" ? "bg-success" : "bg-accent"}`} />
        <h3 className="font-semibold">{basis}</h3>
        <span className="text-xs text-muted-foreground tabular-nums">{applications.length}</span>
      </div>
      <div className="space-y-3">
        {applications.map((application) => <ApplicationRow key={application.groupId} application={application} />)}
      </div>
    </div>
  );
}

function ApplicationRow({ application }: { application: ApplicantApplication }) {
  const confirmed = application.basis === "Бюджет" ? application.hasConsent : application.hasContract;
  const confirmationLabel = application.basis === "Бюджет" ? "Согласие" : "Договор";
  const confirmationValue = application.basis === "Бюджет" ? application.consent : application.contract;
  const activeRank = application.basis === "Бюджет" ? application.consentRank : application.contractRank;

  return (
    <Card className={`p-4 md:p-5 shadow-card border-l-4 ${application.basis === "Бюджет" ? "border-l-success" : "border-l-accent"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-medium leading-snug">{application.group}</h4>
          <p className="mt-1 text-xs text-muted-foreground">Список: {application.snapshot}</p>
        </div>
        {confirmed && <Badge className={application.basis === "Бюджет" ? "bg-success/10 text-success hover:bg-success/10 border-0" : "bg-accent/10 text-accent hover:bg-accent/10 border-0"}>Подтверждено</Badge>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 mt-4 text-xs">
        <Value label="Приоритет" value={formatNumber(application.priority)} strong />
        <Value label="Балл" value={formatNumber(application.score)} />
        <Value label="Общая позиция" value={formatNumber(application.generalPosition)} />
        <Value label="Мест" value={formatNumber(application.seats)} />
        <Value label={confirmationLabel} value={confirmationValue || "—"} />
        <Value label="Активная позиция" value={formatNumber(activeRank)} />
        <Value label="Статус" value={application.status || "—"} wide />
      </div>

      <div className="mt-4 pt-3 border-t flex justify-end">
        <Link to={`/dynamics?groupId=${encodeURIComponent(application.groupId)}`} className="inline-flex items-center text-xs text-primary underline underline-offset-2">
          <FileText className="w-3.5 h-3.5 mr-1" /> Динамика группы
        </Link>
      </div>
    </Card>
  );
}

function Value({ label, value, strong, wide }: { label: string; value: string; strong?: boolean; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <div className="text-muted-foreground">{label}</div>
      <div className={`mt-0.5 break-words ${strong ? "font-semibold" : "font-medium"}`}>{value}</div>
    </div>
  );
}

function ProfileKpi({ label, value, tone }: { label: string; value: number; tone?: "success" | "accent" }) {
  return (
    <Card className="p-4 md:p-5 shadow-card min-h-[105px]">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-3 text-2xl md:text-3xl font-semibold tabular-nums ${tone === "success" ? "text-success" : tone === "accent" ? "text-accent" : ""}`}>{value.toLocaleString("ru-RU")}</div>
    </Card>
  );
}

function groupApplications(applications: ApplicantApplication[]): Array<[string, ApplicantApplication[]]> {
  const grouped = new Map<string, ApplicantApplication[]>();

  applications.forEach((application) => {
    const current = grouped.get(application.university) ?? [];
    current.push(application);
    grouped.set(application.university, current);
  });

  grouped.forEach((items) => items.sort((first, second) => (
    first.basis.localeCompare(second.basis, "ru") ||
    (first.priority ?? 999) - (second.priority ?? 999) ||
    first.group.localeCompare(second.group, "ru")
  )));

  return Array.from(grouped.entries()).sort((first, second) => first[0].localeCompare(second[0], "ru"));
}

function ProfileLoading() {
  return <div className="container py-12 space-y-5"><Skeleton className="h-24 w-full" /><div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-24" />)}</div><Skeleton className="h-72 w-full" /></div>;
}

function ProfileMessage({ title, message }: { title: string; message: string }) {
  return <div className="min-h-screen flex items-center justify-center p-6"><Card className="max-w-lg p-6 shadow-card"><h1 className="text-lg font-semibold">{title}</h1><p className="mt-2 text-sm text-muted-foreground">{message}</p><Link to="/applicants" className="inline-block mt-4 text-sm text-primary underline underline-offset-2">Вернуться к карте</Link></Card></div>;
}

function formatNumber(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("ru-RU");
}

export default ApplicantProfile;
