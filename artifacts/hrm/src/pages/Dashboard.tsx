import { useState } from "react";
import { useGetDashboardStats, useGetExpiringDocuments, useGetMissingDocs, useGetDashboardCharts } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LabelList } from "recharts";
import { AlertCircle, FileWarning, Users, UserMinus, ShieldAlert, FileClock, ChevronRight } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/lib/i18n";

const PIE_COLORS: Record<string, string> = {
  "còn hiệu lực": "#16a34a",
  "đang xử lý":   "#fde047",
  "sắp hết hạn":  "#f97316",
  "đã hết hạn":   "#dc2626",
  "thiếu hồ sơ":  "#94a3b8",
  valid:    "#16a34a",
  pending:  "#fde047",
  expiring: "#f97316",
  expired:  "#dc2626",
  missing:  "#94a3b8",
};

type ModalType = "expiring30" | "expiring60" | "expired" | "missing" | null;

export default function Dashboard() {
  const { t } = useLanguage();
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: expiringDocs, isLoading: expiringLoading } = useGetExpiringDocuments({ days: 90 });
  const { data: missingDocs, isLoading: missingLoading } = useGetMissingDocs();
  const { data: charts, isLoading: chartsLoading } = useGetDashboardCharts();
  const [openModal, setOpenModal] = useState<ModalType>(null);

  const STATUS_LABELS: Record<string, string> = {
    valid: t("status_valid"),
    expiring: t("status_expiring"),
    expired: t("status_expired"),
    pending: t("status_pending"),
    missing: t("status_missing"),
  };

  if (statsLoading || expiringLoading || missingLoading || chartsLoading) {
    return <div className="flex items-center justify-center h-full p-8 text-slate-500">{t("dash_loading")}</div>;
  }

  const expiring30 = (expiringDocs ?? []).filter((d) => d.daysUntilExpiry <= 30);
  const expiring60 = (expiringDocs ?? []).filter((d) => d.daysUntilExpiry <= 60);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{t("dash_title")}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("dash_subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-8 gap-4">
        <StatCard title={t("dash_total_emp")}    value={stats?.totalEmployees}   icon={Users}       color="text-indigo-500" />
        <StatCard title={t("dash_active_emp")}    value={stats?.activeEmployees}  icon={Users}       color="text-green-500" />
        <StatCard title={t("dash_resigned_emp")}    value={stats?.resignedEmployees} icon={UserMinus}  color="text-slate-500" />
        <StatCard title={t("dash_total_docs")} value={stats?.totalDocuments}   icon={FileText}    color="text-indigo-400" />
        <StatCard title={t("dash_exp_30")} value={stats?.expiringIn30}   icon={ShieldAlert} color="text-red-500"
          isAlert={!!stats?.expiringIn30 && stats.expiringIn30 > 0}
          onClick={() => setOpenModal("expiring30")} clickable />
        <StatCard title={t("dash_exp_60")} value={stats?.expiringIn60}   icon={FileClock}   color="text-orange-500"
          isAlert={!!stats?.expiringIn60 && stats.expiringIn60 > 0}
          onClick={() => setOpenModal("expiring60")} clickable />
        <StatCard title={t("dash_expired")}   value={stats?.expiredDocuments} icon={FileWarning} color="text-red-600"
          isAlert={!!stats?.expiredDocuments && stats.expiredDocuments > 0}
          onClick={() => setOpenModal("expired")} clickable />
        <StatCard title={t("dash_missing")}  value={stats?.missingDocuments} icon={AlertCircle} color="text-yellow-600"
          isAlert={!!stats?.missingDocuments && stats.missingDocuments > 0}
          onClick={() => setOpenModal("missing")} clickable />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-1 border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-slate-500">{t("dash_doc_status")}</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={charts?.documentStatusPie || []}
                  cx="50%" cy="42%"
                  innerRadius={52} outerRadius={72}
                  paddingAngle={2} dataKey="value"
                  label={({ cx, cy, midAngle, outerRadius, value }) => {
                    const RADIAN = Math.PI / 180;
                    const r = outerRadius + 22;
                    const x = cx + r * Math.cos(-midAngle * RADIAN);
                    const y = cy + r * Math.sin(-midAngle * RADIAN);
                    return value > 0 ? (
                      <text x={x} y={y} textAnchor={x > cx ? "start" : "end"} dominantBaseline="central" fontSize={10} fill="var(--muted-foreground)">{value}</text>
                    ) : null;
                  }}
                  labelLine={false}
                >
                  {charts?.documentStatusPie?.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[entry.label.toLowerCase()] || PIE_COLORS.valid} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, _name: string, props: any) => [value, STATUS_LABELS[props.payload.label.toLowerCase()] || props.payload.label]}
                  contentStyle={{ backgroundColor: "var(--card)", borderColor: "var(--border)", borderRadius: "6px" }}
                />
                <Legend
                  iconType="circle" iconSize={8}
                  formatter={(value: string, entry: any) => {
                    const key = entry?.payload?.label?.toLowerCase?.() || value;
                    const label = STATUS_LABELS[key] || value;
                    const count = entry?.payload?.value ?? "";
                    return <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{label}: <strong style={{ color: "var(--foreground)" }}>{count}</strong></span>;
                  }}
                  payload={charts?.documentStatusPie?.map((entry) => ({
                    value: entry.label,
                    type: "circle" as const,
                    color: PIE_COLORS[entry.label.toLowerCase()] || PIE_COLORS.valid,
                    payload: entry,
                  }))}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="col-span-2 border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-slate-500">{t("dash_exp_by_month")}</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts?.expirationByMonth || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                <Tooltip cursor={{ fill: "rgba(0,0,0,0.05)" }} contentStyle={{ backgroundColor: "var(--card)", borderColor: "var(--border)", borderRadius: "6px" }} />
                <Bar dataKey="count" fill="var(--color-primary)" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="count" position="top" style={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-[400px]">
          <CardHeader className="py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
            <CardTitle className="text-sm font-semibold text-slate-800 dark:text-slate-200">{t("dash_warn_90")}</CardTitle>
          </CardHeader>
          <div className="overflow-auto flex-1 p-0">
            <ExpiringTable docs={expiringDocs ?? []} />
          </div>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-[400px]">
          <CardHeader className="py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
            <CardTitle className="text-sm font-semibold text-slate-800 dark:text-slate-200">{t("dash_missing_docs")}</CardTitle>
          </CardHeader>
          <div className="overflow-auto flex-1 p-0">
            <MissingTable docs={missingDocs ?? []} />
          </div>
        </Card>
      </div>

      {/* ─── Sheets ─────────────────────────────────────────────── */}
      <ExpiringSheet
        open={openModal === "expiring30"}
        onClose={() => setOpenModal(null)}
        title={t("sheet_exp_30")}
        docs={expiring30}
      />
      <ExpiringSheet
        open={openModal === "expiring60"}
        onClose={() => setOpenModal(null)}
        title={t("sheet_exp_60")}
        docs={expiring60}
      />
      <ExpiredSheet
        open={openModal === "expired"}
        onClose={() => setOpenModal(null)}
      />
      <MissingSheet
        open={openModal === "missing"}
        onClose={() => setOpenModal(null)}
        docs={missingDocs ?? []}
      />
    </div>
  );
}

/* ─── StatCard ─────────────────────────────────────────────── */

function StatCard({
  title, value, icon: Icon, color, isAlert, onClick, clickable,
}: {
  title: string; value?: number; icon: any; color: string;
  isAlert?: boolean; onClick?: () => void; clickable?: boolean;
}) {
  return (
    <Card
      onClick={onClick}
      className={`border-slate-200 dark:border-slate-800 shadow-sm transition-all
        ${isAlert ? "bg-red-50/50 dark:bg-red-950/20 border-red-100 dark:border-red-900/50" : ""}
        ${clickable ? "cursor-pointer hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 select-none" : ""}
      `}
    >
      <CardContent className="p-4 flex flex-col items-start gap-2">
        <div className="flex items-center justify-between w-full">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">{title}</div>
          <div className="flex items-center gap-0.5">
            <Icon className={`w-4 h-4 ${color}`} />
            {clickable && <ChevronRight className="w-3 h-3 text-slate-300" />}
          </div>
        </div>
        <div className={`text-2xl font-bold ${isAlert ? "text-red-700 dark:text-red-400" : "text-slate-900 dark:text-slate-100"}`}>
          {value !== undefined ? value : "-"}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Expiring table (inline) ──────────────────────────────── */

function ExpiringTable({ docs }: { docs: any[] }) {
  const [, setLocation] = useLocation();
  const { t } = useLanguage();
  if (docs.length === 0) {
    return <div className="px-4 py-8 text-center text-slate-500 text-sm">{t("dash_no_expiring")}</div>;
  }
  return (
    <table className="w-full text-sm text-left">
      <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-900 sticky top-0 z-10">
        <tr>
          <th className="px-4 py-3 font-medium">{t("dash_employee")}</th>
          <th className="px-4 py-3 font-medium">{t("dash_doc_type")}</th>
          <th className="px-4 py-3 font-medium">{t("dash_expiry_date")}</th>
          <th className="px-4 py-3 font-medium text-right">{t("dash_remaining")}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {docs.map((doc) => (
          <tr
            key={doc.documentId}
            className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
            onClick={() => setLocation(`/nhan-vien/${doc.employeeId}`)}
          >
            <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-200">{doc.employeeName}</td>
            <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{doc.docType}</td>
            <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
              {new Date(doc.expiryDate).toLocaleDateString("vi-VN")}
            </td>
            <td className="px-4 py-2.5 text-right">
              <Badge variant="outline" className={
                doc.daysUntilExpiry <= 30
                  ? "bg-red-100 text-red-800 border-red-200"
                  : "bg-yellow-100 text-yellow-800 border-yellow-200"
              }>
                {doc.daysUntilExpiry} {t("days")}
              </Badge>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ─── Missing table (inline) ───────────────────────────────── */

function MissingTable({ docs }: { docs: any[] }) {
  const [, setLocation] = useLocation();
  const { t } = useLanguage();
  if (docs.length === 0) {
    return <div className="px-4 py-8 text-center text-slate-500 text-sm">{t("dash_all_ok")}</div>;
  }
  return (
    <table className="w-full text-sm text-left">
      <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-900 sticky top-0 z-10">
        <tr>
          <th className="px-4 py-3 font-medium">{t("dash_employee")}</th>
          <th className="px-4 py-3 font-medium">{t("dash_nationality")}</th>
          <th className="px-4 py-3 font-medium">{t("dash_missing_types")}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {docs.map((doc) => (
          <tr
            key={doc.employeeId}
            className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
            onClick={() => setLocation(`/nhan-vien/${doc.employeeId}`)}
          >
            <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-200">{doc.employeeName}</td>
            <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{doc.nationality || "Trung Quốc"}</td>
            <td className="px-4 py-2.5">
              <div className="flex flex-wrap gap-1">
                {doc.missingDocTypes.map((t2: string) => (
                  <Badge key={t2} variant="outline" className="bg-slate-100 text-slate-700 border-slate-200 text-[10px] px-1.5 py-0">{t2}</Badge>
                ))}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ─── Sheet: sắp hết hạn ───────────────────────────────────── */

function ExpiringSheet({ open, onClose, title, docs }: { open: boolean; onClose: () => void; title: string; docs: any[] }) {
  const [, setLocation] = useLocation();
  const { t } = useLanguage();
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col p-0">
        <SheetHeader className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <SheetTitle className="text-base font-semibold">{title}</SheetTitle>
          <p className="text-xs text-slate-500 mt-0.5">{docs.length} {t("dash_docs_to_handle")}</p>
        </SheetHeader>
        <div className="overflow-auto flex-1">
          {docs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">{t("dash_no_data")}</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-900 sticky top-0 z-10">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">{t("dash_employee")}</th>
                  <th className="px-4 py-3 text-left font-medium">{t("dash_doc_type")}</th>
                  <th className="px-4 py-3 text-left font-medium">{t("dash_expiry_date")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("dash_remaining")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {docs.map((doc) => (
                  <tr
                    key={doc.documentId}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                    onClick={() => { onClose(); setLocation(`/nhan-vien/${doc.employeeId}`); }}
                  >
                    <td className="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">{doc.employeeName}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{doc.docType}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {new Date(doc.expiryDate).toLocaleDateString("vi-VN")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Badge variant="outline" className={
                        doc.daysUntilExpiry <= 30
                          ? "bg-red-100 text-red-800 border-red-200"
                          : "bg-yellow-100 text-yellow-800 border-yellow-200"
                      }>
                        {doc.daysUntilExpiry} {t("days")}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ─── Sheet: đã hết hạn ────────────────────────────────────── */

function ExpiredSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [, setLocation] = useLocation();
  const { t } = useLanguage();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", "expired"],
    queryFn: () => fetch("/api/dashboard/expired").then((r) => r.json()),
    enabled: open,
  });

  const docs: any[] = data ?? [];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col p-0">
        <SheetHeader className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <SheetTitle className="text-base font-semibold">{t("sheet_expired")}</SheetTitle>
          {!isLoading && <p className="text-xs text-slate-500 mt-0.5">{docs.length} {t("dash_docs_overdue")}</p>}
        </SheetHeader>
        <div className="overflow-auto flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">{t("dash_loading_short")}</div>
          ) : docs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">{t("dash_no_expired")}</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-900 sticky top-0 z-10">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">{t("dash_employee")}</th>
                  <th className="px-4 py-3 text-left font-medium">{t("dash_doc_type")}</th>
                  <th className="px-4 py-3 text-left font-medium">{t("dash_expiry_date")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("dash_overdue")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {docs.map((doc: any) => (
                  <tr
                    key={doc.documentId}
                    className="hover:bg-red-50/40 dark:hover:bg-red-950/20 cursor-pointer transition-colors"
                    onClick={() => { onClose(); setLocation(`/nhan-vien/${doc.employeeId}`); }}
                  >
                    <td className="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">{doc.employeeName}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{doc.docType}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {new Date(doc.expiryDate).toLocaleDateString("vi-VN")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">
                        {Math.abs(doc.daysUntilExpiry)} {t("days")}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ─── Sheet: thiếu hồ sơ ───────────────────────────────────── */

function MissingSheet({ open, onClose, docs }: { open: boolean; onClose: () => void; docs: any[] }) {
  const [, setLocation] = useLocation();
  const { t } = useLanguage();
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col p-0">
        <SheetHeader className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <SheetTitle className="text-base font-semibold">{t("sheet_missing")}</SheetTitle>
          <p className="text-xs text-slate-500 mt-0.5">{docs.length} {t("dash_need_docs")}</p>
        </SheetHeader>
        <div className="overflow-auto flex-1">
          {docs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">{t("dash_all_have_docs")}</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-900 sticky top-0 z-10">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">{t("dash_employee")}</th>
                  <th className="px-4 py-3 text-left font-medium">{t("dash_nationality")}</th>
                  <th className="px-4 py-3 text-left font-medium">{t("dash_missing_types")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {docs.map((doc: any) => (
                  <tr
                    key={doc.employeeId}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                    onClick={() => { onClose(); setLocation(`/nhan-vien/${doc.employeeId}`); }}
                  >
                    <td className="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">{doc.employeeName}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{doc.nationality || "Trung Quốc"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {doc.missingDocTypes.map((tp: string) => (
                          <Badge key={tp} variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-[10px] px-1.5 py-0">{tp}</Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ─── Inline icon ───────────────────────────────────────────── */

function FileText(props: any) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>
}
