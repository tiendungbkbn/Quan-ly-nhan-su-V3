import { useState, useMemo, useRef, useEffect } from "react";
import { 
  useListEmployees,
  useListTemplates,
  exportEmployeesExcel,
  getListEmployeesQueryKey,
  getListTemplatesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Search, Plus, Filter, FileDown, MoreHorizontal, FileText, Sheet, Check, Trash2, AlertTriangle } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function downloadExcel(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

export default function Employees() {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"active" | "resigned" | "">("active");
  const [companyFilter, setCompanyFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleBulkDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch("/api/employees/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast({
        title: t("emp_bulk_delete_ok"),
        description: `${data.deleted} ${t("emp_bulk_delete_ok_desc")}`,
      });
      queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
      setSelectedIds(new Set());
      setIsDeleteOpen(false);
    } catch {
      toast({ variant: "destructive", title: t("error"), description: t("emp_bulk_delete_err") });
    } finally {
      setIsDeleting(false);
    }
  };

  const { data: rawEmployees, isLoading } = useListEmployees(
    undefined,
    { query: { queryKey: getListEmployeesQueryKey(), refetchOnMount: "always" } }
  );

  const companies = useMemo(
    () => [...new Set((rawEmployees ?? []).map((employee) => employee.company?.trim()).filter((company): company is string => !!company))]
      .sort((a, b) => a.localeCompare(b, "vi")),
    [rawEmployees],
  );
  const companyCounts = useMemo(
    () => (rawEmployees ?? [])
      .filter((employee) => !status || employee.status === status)
      .reduce<Record<string, number>>((counts, employee) => {
        const key = employee.company?.trim() || "";
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {}),
    [rawEmployees, status],
  );
  const statusEmployeeCount = useMemo(
    () => (rawEmployees ?? []).filter((employee) => !status || employee.status === status).length,
    [rawEmployees, status],
  );

  // Keep company options complete while applying search and filters to the loaded list.
  const employees = useMemo(
    () => (rawEmployees ?? [])
      .filter((employee) => {
        if (status && employee.status !== status) return false;
        if (companyFilter === "__unassigned__" && employee.company?.trim()) return false;
        if (companyFilter && companyFilter !== "__unassigned__" && employee.company?.trim() !== companyFilter) return false;
        const term = search.trim().toLocaleLowerCase("vi");
        if (!term) return true;
        return [employee.fullName, employee.passportNo, employee.position, employee.company, employee.employeeCode]
          .some((value) => value?.toLocaleLowerCase("vi").includes(term));
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "vi")),
    [rawEmployees, status, companyFilter, search],
  );

  // Save scroll position to sessionStorage on every scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      sessionStorage.setItem("employees-scroll", String(el.scrollTop));
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  // Restore scroll position after employee list renders
  useEffect(() => {
    if (!employees) return;
    const saved = sessionStorage.getItem("employees-scroll");
    if (saved && scrollRef.current) {
      scrollRef.current.scrollTop = Number(saved);
    }
  }, [employees]);

  const toggleSelect = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleAll = () => {
    if (selectedIds.size === employees?.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(employees?.map(e => e.id) || []));
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const blob = await exportEmployeesExcel({
        search: search.trim() || undefined,
        status: status || undefined,
        company: companyFilter && companyFilter !== "__unassigned__" ? companyFilter : undefined,
        unassignedCompany: companyFilter === "__unassigned__" ? "true" : undefined,
      });
      downloadExcel(blob, "danh_sach_nhan_vien.xlsx");
      toast({ title: t("emp_export_ok") });
    } catch {
      toast({ variant: "destructive", title: t("error"), description: t("emp_export_err") });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      {/* ── Page header ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{t("emp_title")}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t("emp_subtitle")}</p>
        </div>
        <div className="flex gap-2 shrink-0 items-center">
          {selectedIds.size > 0 && (
            <>
              <Button
                variant="outline"
                className="gap-2 border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400"
                onClick={() => setIsDeleteOpen(true)}
              >
                <Trash2 className="w-4 h-4" />
                {t("emp_bulk_delete")} ({selectedIds.size})
              </Button>
              <Button variant="secondary" className="gap-2" onClick={() => setIsGenerateOpen(true)}>
                <FileDown className="w-4 h-4" />
                {t("emp_create_docs")} ({selectedIds.size})
              </Button>
            </>
          )}
          <Button
            variant="outline"
            className="gap-2 border-green-600 text-green-700 hover:bg-green-50"
            onClick={handleExportExcel}
            disabled={isExporting}
          >
            <Sheet className="w-4 h-4" />
            {isExporting ? t("emp_exporting") : t("emp_export_excel")}
          </Button>
          <Link href="/nhan-vien/tao-moi">
            <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
              <Plus className="w-4 h-4" />
              {t("emp_add")}
            </Button>
          </Link>
          <GenerateDocsDialog
            open={isGenerateOpen}
            onOpenChange={setIsGenerateOpen}
            selectedIds={Array.from(selectedIds)}
          />
          {/* Bulk delete confirmation dialog */}
          <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
            <DialogContent className="sm:max-w-[420px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-600">
                  <AlertTriangle className="w-5 h-5" />
                  {t("emp_bulk_delete_confirm_title")}
                </DialogTitle>
                <DialogDescription className="pt-1">
                  {t("emp_bulk_delete_confirm_desc")}{" "}
                  <strong className="text-slate-900 dark:text-white">{selectedIds.size}</strong>{" "}
                  {t("emp_bulk_delete_confirm_desc2")}
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-lg border border-red-100 bg-red-50 dark:bg-red-950/20 dark:border-red-900/40 p-3 max-h-40 overflow-y-auto">
                <ul className="space-y-1">
                  {employees
                    ?.filter((e) => selectedIds.has(e.id))
                    .map((e) => (
                      <li key={e.id} className="text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                        {e.fullName}
                      </li>
                    ))}
                </ul>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setIsDeleteOpen(false)} disabled={isDeleting}>
                  {t("cancel")}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleBulkDelete}
                  disabled={isDeleting}
                  className="gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  {isDeleting ? t("emp_bulk_deleting") : `${t("emp_bulk_delete")} (${selectedIds.size})`}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ── Card with sticky header ──────────────────────────── */}
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">

        {/* Search / filter bar — never scrolls */}
        <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap gap-3 shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder={t("emp_search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800"
              data-testid="input-employee-search"
            />
          </div>
          <div className="relative w-44">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="w-full h-9 pl-9 pr-4 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none"
            >
              <option value="">{t("emp_all_status")}</option>
              <option value="active">{t("emp_active")}</option>
              <option value="resigned">{t("emp_resigned")}</option>
            </select>
          </div>
          <div className="relative w-52">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              aria-label={t("detail_field_company")}
              data-testid="select-employee-company"
              className="w-full h-9 pl-9 pr-4 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none"
            >
              <option value="">{t("emp_all_companies")} ({statusEmployeeCount})</option>
              {companies.map((company) => (
                <option key={company} value={company}>
                  {company} ({companyCounts[company] ?? 0} {t("emp_employee_count")})
                </option>
              ))}
              {(companyCounts[""] ?? 0) > 0 && (
                <option value="__unassigned__">
                  {t("emp_unassigned_company")} ({companyCounts[""]} {t("emp_employee_count")})
                </option>
              )}
            </select>
          </div>
          <div className="ml-auto self-center text-xs text-slate-500" data-testid="text-employee-filter-count">
            {employees.length} / {statusEmployeeCount} {t("emp_employee_count")}
          </div>
        </div>

        {/* Scrollable table */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="text-[10px] text-slate-500 uppercase tracking-wide bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-20">
              <tr>
                <th className="px-3 py-2.5 font-medium w-10 text-center">
                  <input
                    type="checkbox"
                    checked={(employees?.length ?? 0) > 0 && selectedIds.size === (employees?.length ?? 0)}
                    onChange={toggleAll}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </th>
                <th className="px-3 py-2.5 font-medium min-w-[160px]">{t("emp_col_name")}</th>
                <th className="px-3 py-2.5 font-medium w-14 text-center">{t("emp_col_photo")}</th>
                <th className="px-3 py-2.5 font-medium">
                  <div className="flex flex-col gap-0.5">
                    <span>{t("emp_col_passport")}</span>
                    <span className="font-mono text-[9px] text-indigo-400/80 normal-case tracking-normal">{"{{SO_HC}}"}</span>
                  </div>
                </th>
                <th className="px-3 py-2.5 font-medium">
                  <div className="flex flex-col gap-0.5">
                    <span>{t("emp_col_visa")}</span>
                    <span className="font-mono text-[9px] text-indigo-400/80 normal-case tracking-normal">{"{{SO_VISA}}"}</span>
                  </div>
                </th>
                <th className="px-3 py-2.5 font-medium">
                  <div className="flex flex-col gap-0.5">
                    <span>{t("emp_col_trc")}</span>
                    <span className="font-mono text-[9px] text-indigo-400/80 normal-case tracking-normal">{"{{SO_TRC}}"}</span>
                  </div>
                </th>
                <th className="px-3 py-2.5 font-medium">{t("emp_col_gpld")}</th>
                <th className="px-3 py-2.5 font-medium">{t("emp_col_lltp")}</th>
                <th className="px-3 py-2.5 font-medium">{t("emp_col_gksk")}</th>
                <th className="px-3 py-2.5 font-medium min-w-[140px]">{t("emp_col_company")}</th>
                <th className="px-3 py-2.5 font-medium text-right w-10"></th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-950">
              {isLoading ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-slate-500">
                    {t("emp_loading")}
                  </td>
                </tr>
              ) : (employees?.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-slate-500">
                    {t("emp_not_found")}
                  </td>
                </tr>
              ) : (
                employees?.map((emp) => (
                  <tr
                    key={emp.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors group"
                  >
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(emp.id)}
                        onChange={() => toggleSelect(emp.id)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/nhan-vien/${emp.id}`}
                        className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        {emp.fullName}
                      </Link>
                      <div className="text-xs text-slate-400 mt-0.5 truncate max-w-[160px]">
                        {emp.phone || emp.email || "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {emp.photoUrl ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/40">
                          <Check className="w-3 h-3 text-green-600 dark:text-green-400" strokeWidth={2.5} />
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-700 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 font-mono text-xs">
                      {emp.passportNo || <span className="text-slate-300 dark:text-slate-700">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 font-mono text-xs">
                      {emp.visaNo || <span className="text-slate-300 dark:text-slate-700">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 font-mono text-xs">
                      {emp.trcNo || <span className="text-slate-300 dark:text-slate-700">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 font-mono text-xs">
                      {emp.gpldNo || <span className="text-slate-300 dark:text-slate-700">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 font-mono text-xs">
                      {emp.lltpNo || <span className="text-slate-300 dark:text-slate-700">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 font-mono text-xs">
                      {emp.gkskNo || <span className="text-slate-300 dark:text-slate-700">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">
                      <div className="text-xs">{emp.company || <span className="text-slate-300 dark:text-slate-700">—</span>}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{emp.position || ""}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Link
                        href={`/nhan-vien/${emp.id}`}
                        className="inline-flex items-center justify-center rounded-md h-7 w-7 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function GenerateDocsDialog({ open, onOpenChange, selectedIds }: { open: boolean, onOpenChange: (o: boolean) => void, selectedIds: number[] }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { data: templates, isLoading } = useListTemplates({
    query: { queryKey: getListTemplatesQueryKey(), enabled: open },
  });
  const [selectedTemplate, setSelectedTemplate] = useState<{ id: number; name: string } | null>(null);
  const [soCongVan, setSoCongVan] = useState("");
  const [ngayNhapCanh, setNgayNhapCanh] = useState("");
  const [cuaKhau, setCuaKhau] = useState("");
  const [format, setFormat] = useState<"docx" | "pdf">("docx");

  const resetFields = () => {
    setSoCongVan("");
    setNgayNhapCanh("");
    setCuaKhau("");
  };

  const handleSelectTemplate = (id: number, name: string) => {
    setSelectedTemplate({ id, name });
    resetFields();
  };

  const handleBack = () => {
    setSelectedTemplate(null);
    resetFields();
  };

  const handleClose = (val: boolean) => {
    if (!val) {
      setSelectedTemplate(null);
      resetFields();
    }
    onOpenChange(val);
  };

  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!selectedTemplate) return;
    setIsGenerating(true);
    try {
      const url = format === "pdf" ? "/api/generate-docs?format=pdf" : "/api/generate-docs";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeIds: selectedIds,
          templateId: selectedTemplate.id,
          soCongVan: soCongVan || null,
          ngayNhapCanh: ngayNhapCanh || null,
          cuaKhau: cuaKhau || null,
        }),
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const ext = format === "pdf" ? "pdf" : "docx";
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `Ho_so_nhan_vien_${Date.now()}.${ext}`;
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(objectUrl);
      toast({ title: t("gen_ok"), description: t("gen_downloaded") });
      handleClose(false);
    } catch {
      toast({ variant: "destructive", title: t("error"), description: t("gen_err") });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("gen_title")}</DialogTitle>
        </DialogHeader>

        {!selectedTemplate ? (
          <div className="pt-4 space-y-4">
            <p className="text-sm text-slate-500">
              {t("gen_bạn_chọn")} <strong className="text-slate-900 dark:text-white">{selectedIds.length}</strong> {t("gen_selected")}. {t("gen_choose_template")}
            </p>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
              {isLoading ? (
                <div className="text-center py-4 text-slate-500 text-sm">{t("gen_loading_template")}</div>
              ) : templates?.length === 0 ? (
                <div className="text-center py-4 text-slate-500 text-sm">
                  {t("gen_no_template")} <Link href="/ho-so" className="text-indigo-600 underline">{t("nav_templates")}</Link> {t("gen_no_template2")}
                </div>
              ) : (
                templates?.map(tmpl => (
                  <div key={tmpl.id} className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-900/50 hover:border-indigo-300 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-medium text-sm text-slate-900 dark:text-slate-200">{tmpl.name}</div>
                        <div className="text-xs text-slate-500">{tmpl.description || t("gen_no_desc")}</div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                      onClick={() => handleSelectTemplate(tmpl.id, tmpl.name)}
                    >
                      {t("gen_choose")}
                    </Button>
                  </div>
                ))
              )}
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => handleClose(false)}>{t("gen_close")}</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="pt-4 space-y-5">
            <div className="flex items-center gap-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-lg">
              <div className="w-8 h-8 rounded bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div className="text-sm font-medium text-indigo-800 dark:text-indigo-300">{selectedTemplate.name}</div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("gen_so_cong_van")}
                <span className="ml-2 text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 normal-case">{"{{SO_CONG_VAN}}"}</span>
              </label>
              <input
                className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm"
                placeholder="Ví dụ: 123/CV-CT"
                value={soCongVan}
                onChange={(e) => setSoCongVan(e.target.value)}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("gen_ngay_nhap_canh")}
                <span className="ml-2 text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 normal-case">{"{{NGAY_NHAP_CANH}}"}</span>
              </label>
              <input
                type="text"
                className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm"
                placeholder="dd/mm/yyyy"
                value={ngayNhapCanh}
                onChange={(e) => setNgayNhapCanh(e.target.value)}
              />
              <p className="text-xs text-slate-400">{t("gen_leave_blank")}</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("gen_cua_khau")}
                <span className="ml-2 text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 normal-case">{"{{CUA_KHAU}}"}</span>
              </label>
              <input
                type="text"
                className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm"
                placeholder="VD: Cửa khẩu Hữu Nghị"
                value={cuaKhau}
                onChange={(e) => setCuaKhau(e.target.value)}
              />
              <p className="text-xs text-slate-400">{t("gen_leave_blank")}</p>
            </div>

            <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-3 text-xs text-slate-500 space-y-1">
              <p className="font-medium text-slate-600 dark:text-slate-400">{t("gen_auto_tags")}</p>
              <p><span className="font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5">{"{{NGAY}}"}</span> — {t("gen_ngay_auto")}</p>
            </div>

            {/* Format picker */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("gen_format_label")}</label>
              <div className="grid grid-cols-2 gap-2">
                {(["docx", "pdf"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFormat(f)}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-colors",
                      format === f
                        ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                    )}
                  >
                    {f === "docx"
                      ? <><FileText className="w-4 h-4" /> {t("gen_format_docx")}</>
                      : <><FileDown className="w-4 h-4" /> {t("gen_format_pdf")}</>}
                  </button>
                ))}
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={handleBack}>{t("gen_back")}</Button>
              <Button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {isGenerating ? t("gen_generating") : `${t("gen_create")} (${selectedIds.length} ${t("gen_selected")})`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
