import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  useCreateEmployee,
  useListEmployees,
  getListEmployeesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n";

/* ─── Helpers ────────────────────────────────────────────── */

function F({
  label,
  tag,
  children,
  className,
}: {
  label: string;
  tag?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1">
        {label}
        {tag && (
          <span className="font-mono bg-indigo-50 text-indigo-400 border border-indigo-100 rounded px-1 normal-case text-[9px]">
            {`{{${tag}}}`}
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

function Inp(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <Input {...props} className={`h-8 text-xs ${props.className ?? ""}`} />;
}

/* ─── Document helpers ───────────────────────────────────── */

const DOC_TYPES: Array<{
  type: string;
  tags: { idNumber?: string; issueDate?: string; expiryDate?: string };
}> = [
  { type: "Hộ chiếu",             tags: { idNumber: "SO_HC",   issueDate: "CAP_HC",   expiryDate: "HH_HC"   } },
  { type: "Visa",                  tags: { idNumber: "SO_VISA", issueDate: "CAP_VISA", expiryDate: "HH_VISA" } },
  { type: "Thẻ tạm trú (TRC)",    tags: { idNumber: "SO_TRC",  expiryDate: "HH_TRC"  } },
  { type: "Giấy phép lao động",   tags: {} },
  { type: "Lý lịch tư pháp (LLTP)", tags: {} },
  { type: "Giấy khám sức khỏe",  tags: {} },
];

type DocEntry = { idNumber: string; issueDate: string; expiryDate: string };

function computeDocStatus(expiryDate: string): string {
  if (!expiryDate) return "pending";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expiryDate);
  if (exp < today) return "expired";
  if ((exp.getTime() - today.getTime()) / 86400000 <= 60) return "expiring";
  return "valid";
}

const STATUS_COLORS: Record<string, string> = {
  valid:    "bg-green-50 text-green-700 border-green-200",
  expiring: "bg-orange-50 text-orange-700 border-orange-200",
  expired:  "bg-red-50 text-red-700 border-red-200",
  pending:  "bg-slate-100 text-slate-400 border-slate-200",
};

/* ─── Main component ─────────────────────────────────────── */

export default function CreateEmployee() {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createMutation = useCreateEmployee();

  const STATUS_LABELS: Record<string, string> = {
    valid: t("status_valid"),
    expiring: t("status_expiring"),
    expired: t("status_expired"),
    pending: t("status_chua_co"),
  };

  const [fullNameInput, setFullNameInput] = useState("");
  const [docFields, setDocFields] = useState<Record<string, DocEntry>>(
    Object.fromEntries(DOC_TYPES.map((d) => [d.type, { idNumber: "", issueDate: "", expiryDate: "" }]))
  );

  const { data: allEmployees } = useListEmployees({ status: undefined });

  const duplicates =
    fullNameInput.trim().length >= 2
      ? (allEmployees ?? []).filter(
          (e) => e.fullName.trim().toLowerCase() === fullNameInput.trim().toLowerCase()
        )
      : [];

  const setDoc = (type: string, field: keyof DocEntry, value: string) =>
    setDocFields((prev) => ({ ...prev, [type]: { ...prev[type], [field]: value } }));

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const hc   = docFields["Hộ chiếu"];
    const visa = docFields["Visa"];

    const data = {
      fullName:      fd.get("fullName") as string,
      dob:           (fd.get("dob") as string) || null,
      gender:        (fd.get("gender") as string) || null,
      nationality:   (fd.get("nationality") as string) || "Trung Quốc",
      cccd:          (fd.get("cccd") as string) || null,
      passportNo:    hc.idNumber || null,
      passportExpiry: hc.expiryDate || null,
      visaNo:        visa.idNumber || null,
      company:       (fd.get("company") as string).trim() || null,
      position:      (fd.get("position") as string) || null,
      phone:         (fd.get("phone") as string) || null,
      email:         (fd.get("email") as string) || null,
      tempAddress:   (fd.get("tempAddress") as string) || null,
      employeeCode:  (fd.get("employeeCode") as string) || null,
      workPeriod:    (fd.get("workPeriod") as string) || null,
      cuaKhau:       (fd.get("cuaKhau") as string) || null,
      status: "active" as const,
    };

    createMutation.mutate(
      { data },
      {
        onSuccess: async (created) => {
          const filled = DOC_TYPES.filter((d) => {
            const f = docFields[d.type];
            return f.idNumber || f.issueDate || f.expiryDate;
          });
          if (filled.length > 0) {
            await Promise.allSettled(
              filled.map((d) => {
                const f = docFields[d.type];
                return fetch(`/api/employees/${created.id}/documents`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    docType:    d.type,
                    idNumber:   f.idNumber   || null,
                    issueDate:  f.issueDate  || null,
                    expiryDate: f.expiryDate || null,
                    status:     computeDocStatus(f.expiryDate),
                  }),
                });
              })
            );
          }
          toast({ title: t("create_ok"), description: t("create_ok_desc") });
          queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
          setLocation(`/nhan-vien/${created.id}`);
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: t("error"),
            description: t("create_err"),
          });
        },
      }
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between py-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <Link
            href="/nhan-vien"
            className="inline-flex items-center justify-center rounded-md h-8 w-8 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight leading-none">
              {t("create_title")}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {t("detail_personal_info")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/nhan-vien">
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs">
              {t("cancel")}
            </Button>
          </Link>
          <Button
            type="submit"
            form="create-form"
            disabled={createMutation.isPending}
            size="sm"
            className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
          >
            <UserPlus className="w-3.5 h-3.5" />
            {createMutation.isPending
              ? t("create_creating")
              : duplicates.length > 0
              ? t("create_submit")
              : t("create_submit")}
          </Button>
        </div>
      </div>

      {/* Two-column body */}
      <form
        id="create-form"
        onSubmit={handleSubmit}
        className="flex-1 grid grid-cols-5 gap-4 min-h-0 pb-3 overflow-hidden"
      >
        {/* LEFT — Thông tin cá nhân */}
        <div className="col-span-2 overflow-auto">
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm h-full flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between py-2.5 px-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 shrink-0">
              <CardTitle className="text-sm font-semibold">{t("detail_personal_info")}</CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex-1 overflow-auto space-y-3">

              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                <F label={t("detail_field_name")} tag="HO_TEN" className="col-span-2">
                  <Inp
                    name="fullName"
                    required
                    placeholder={t("detail_field_name") + "..."}
                    value={fullNameInput}
                    onChange={(e) => setFullNameInput(e.target.value)}
                    className={duplicates.length > 0 ? "border-amber-400 focus-visible:ring-amber-400" : ""}
                  />
                </F>
                <F label={t("detail_field_dob")} tag="NGAY_SINH">
                  <Inp name="dob" type="date" />
                </F>
                <F label={t("detail_field_gender")} tag="GIOI_TINH">
                  <select
                    name="gender"
                    className="w-full h-8 px-2 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">{t("detail_field_gender_none")}</option>
                    <option value="Nam">{t("detail_field_gender_male")}</option>
                    <option value="Nữ">{t("detail_field_gender_female")}</option>
                    <option value="Khác">{t("detail_field_gender_other")}</option>
                  </select>
                </F>
                <F label={t("detail_field_nationality")}>
                  <Inp name="nationality" defaultValue="Trung Quốc" />
                </F>
                <F label={t("detail_field_cccd")} tag="CCCD">
                  <Inp name="cccd" className="font-mono" placeholder={t("detail_field_cccd")} />
                </F>
                <F label={t("detail_field_employee_code")} tag="MA_NV">
                  <Inp name="employeeCode" className="font-mono" />
                </F>
                <F label={t("detail_field_work_period")} tag="TGCT">
                  <Inp name="workPeriod" placeholder={t("year_placeholder")} />
                </F>

                <div className="col-span-2 border-t border-slate-100 dark:border-slate-800" />

                <F label={t("detail_field_company")} tag="CONG_TY" className="col-span-2">
                  <Inp
                    name="company"
                    list="employee-company-options"
                    placeholder={t("detail_field_company")}
                    data-testid="input-employee-company"
                  />
                  <datalist id="employee-company-options">
                    {[...new Set((allEmployees ?? []).map((employee) => employee.company?.trim()).filter((company): company is string => !!company))]
                      .sort((a, b) => a.localeCompare(b, "vi"))
                      .map((company) => <option key={company} value={company} />)}
                  </datalist>
                </F>
                <F label={t("detail_field_position")} tag="CHUC_VU" className="col-span-2">
                  <Inp name="position" placeholder={t("detail_field_position")} />
                </F>

                <div className="col-span-2 border-t border-slate-100 dark:border-slate-800" />

                <F label={t("detail_field_phone")} tag="phone">
                  <Inp name="phone" />
                </F>
                <F label="Email" tag="email">
                  <Inp name="email" type="email" placeholder="Email" />
                </F>
                <F label={t("detail_field_address")} tag="DIA_CHI" className="col-span-2">
                  <Inp name="tempAddress" placeholder={t("detail_field_address")} />
                </F>
                <F label={t("detail_field_cua_khau")} tag="CUA_KHAU" className="col-span-2">
                  <Inp name="cuaKhau" placeholder={t("detail_field_cua_khau")} />
                </F>
              </div>

              {/* Duplicate warning */}
              {duplicates.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-2 space-y-1.5">
                  <div className="flex items-start gap-1.5">
                    <svg className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                    <p className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
                      {t("create_duplicate_warn")}: {duplicates.length}
                    </p>
                  </div>
                  <div className="space-y-1 pl-5">
                    {duplicates.map((d) => (
                      <div key={d.id} className="flex items-center justify-between text-[10px] rounded bg-white dark:bg-slate-900 border border-amber-100 dark:border-amber-900/50 px-2 py-1 gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-medium text-slate-700 dark:text-slate-300 truncate">{d.fullName}</span>
                          {d.passportNo && <span className="font-mono text-slate-400 shrink-0">{d.passportNo}</span>}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge variant="outline" className={`text-[9px] px-1 py-0 h-3.5 ${d.status === "active" ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-100 text-slate-500"}`}>
                            {d.status === "active" ? t("emp_active") : t("emp_resigned")}
                          </Badge>
                          <Link href={`/nhan-vien/${d.id}`} className="text-indigo-600 dark:text-indigo-400 hover:underline">
                            {t("detail_tab_info")}
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT — Giấy tờ & Hồ sơ pháp lý */}
        <div className="col-span-3 overflow-auto">
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm h-full flex flex-col">
            <CardHeader className="py-2.5 px-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 shrink-0">
              <CardTitle className="text-sm font-semibold">{t("detail_docs_title")}</CardTitle>
            </CardHeader>
            <div className="overflow-auto flex-1">
              <table className="w-full text-sm border-collapse">
                <thead className="text-[10px] text-slate-400 uppercase bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 font-medium text-left">{t("detail_col_doctype")}</th>
                    <th className="px-3 py-2 font-medium text-left w-44">{t("detail_col_id")}</th>
                    <th className="px-3 py-2 font-medium text-left">{t("detail_col_issue")}</th>
                    <th className="px-3 py-2 font-medium text-left">{t("detail_col_expiry")}</th>
                    <th className="px-3 py-2 font-medium text-left w-24">{t("detail_col_status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-950">
                  {DOC_TYPES.map(({ type, tags }) => {
                    const f = docFields[type];
                    const status = computeDocStatus(f.expiryDate);
                    const hasData = f.idNumber || f.issueDate || f.expiryDate;
                    return (
                      <tr key={type} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/30 transition-colors">
                        <td className="px-3 py-1.5 font-medium text-slate-700 dark:text-slate-300 text-xs whitespace-nowrap">
                          {type}
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex flex-col gap-0.5">
                            <Input
                              value={f.idNumber}
                              onChange={(e) => setDoc(type, "idNumber", e.target.value)}
                              placeholder="—"
                              className="h-7 text-xs font-mono border-slate-200 focus:border-indigo-400 bg-transparent w-full min-w-[90px]"
                            />
                            {tags.idNumber && (
                              <span className="text-[9px] font-mono text-indigo-400/70 select-none leading-none">
                                {`{{${tags.idNumber}}}`}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex flex-col gap-0.5">
                            <Input
                              type="date"
                              value={f.issueDate}
                              onChange={(e) => setDoc(type, "issueDate", e.target.value)}
                              className="h-7 text-xs border-slate-200 focus:border-indigo-400 bg-transparent w-full min-w-[120px]"
                            />
                            {tags.issueDate && (
                              <span className="text-[9px] font-mono text-indigo-400/70 select-none leading-none">
                                {`{{${tags.issueDate}}}`}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex flex-col gap-0.5">
                            <Input
                              type="date"
                              value={f.expiryDate}
                              onChange={(e) => setDoc(type, "expiryDate", e.target.value)}
                              className="h-7 text-xs border-slate-200 focus:border-indigo-400 bg-transparent w-full min-w-[120px]"
                            />
                            {tags.expiryDate && (
                              <span className="text-[9px] font-mono text-indigo-400/70 select-none leading-none">
                                {`{{${tags.expiryDate}}}`}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-1.5">
                          {hasData ? (
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${STATUS_COLORS[status]}`}>
                              {STATUS_LABELS[status]}
                            </Badge>
                          ) : (
                            <span className="text-[10px] text-slate-300 dark:text-slate-600">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </form>
    </div>
  );
}
