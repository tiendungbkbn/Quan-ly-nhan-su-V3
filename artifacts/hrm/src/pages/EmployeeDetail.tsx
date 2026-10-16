import { useState, useEffect, useRef } from "react";
import { useRoute, Link, useLocation } from "wouter";
import {
  useGetEmployee,
  useUpdateEmployee,
  useDeleteEmployee,
  getGetEmployeeQueryKey,
  getGetDocumentHistoryQueryKey,
  getListEmployeesQueryKey,
  useCreateEmployeeDocument,
  useUpdateDocument,
  useDeleteDocument,
  useGetDocumentHistory,
  useUploadEmployeePhoto,
  Document,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Save, Trash2, History, Check, X, Upload, ImageIcon, Download, Sheet, FolderOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { StorageFilePicker } from "@/components/StorageFilePicker";
import { useLanguage } from "@/lib/i18n";

async function downloadExcel(url: string, filename: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Xuất Excel thất bại");
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

const FIXED_DOC_TYPES = [
  "Hộ chiếu",
  "Visa",
  "Thẻ tạm trú (TRC)",
  "Giấy phép lao động",
  "Giấy khám sức khỏe",
  "Lý lịch tư pháp (LLTP)",
  "Xác nhận tạm trú",
];

const DOC_STATUS_COLORS: Record<string, string> = {
  valid: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-900/50",
  expiring: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-900/50",
  expired: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/50",
  pending: "bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700",
};

function computeStatus(expiryDate?: string | null, fallback = "pending"): string {
  if (!expiryDate) return fallback;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  if (expiry < today) return "expired";
  const daysLeft = (expiry.getTime() - today.getTime()) / 86400000;
  if (daysLeft <= 60) return "expiring";
  return "valid";
}

export default function EmployeeDetail() {
  const { t } = useLanguage();
  const [, params] = useRoute("/nhan-vien/:id");
  const [, setLocation] = useLocation();
  const id = parseInt(params?.id || "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: employee, isLoading } = useGetEmployee(id);
  const deleteMutation = useDeleteEmployee();

  const DOC_STATUS_LABELS: Record<string, string> = {
    valid: t("status_valid"),
    expiring: t("status_expiring"),
    expired: t("status_expired"),
    pending: t("status_chua_co"),
  };

  const handleDelete = () => {
    if (confirm(t("detail_confirm_delete"))) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          toast({ title: t("detail_deleted"), description: t("detail_deleted_desc") });
          setLocation("/nhan-vien");
        },
      });
    }
  };

  if (isLoading) return <div className="p-8 text-center text-slate-500">{t("detail_loading")}</div>;
  if (!employee) return <div className="p-8 text-center text-slate-500">{t("detail_not_found")}</div>;

  return (
    <div className="flex flex-col gap-3 h-full max-w-7xl mx-auto">
      <Tabs defaultValue="info" className="w-full flex flex-col flex-1 min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Link href="/nhan-vien" className="inline-flex items-center justify-center rounded-md h-8 w-8 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">{employee.fullName}</h1>
                <Badge variant="outline" className={employee.status === "active" ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-100 text-slate-600"}>
                  {employee.status === "active" ? t("detail_status_active") : t("detail_status_resigned")}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {employee.position || t("detail_no_position")} • {employee.company || t("detail_no_company")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TabsList className="grid grid-cols-2 bg-slate-100 dark:bg-slate-900 p-1 h-8 w-44">
              <TabsTrigger value="info" className="text-xs">{t("detail_tab_info")}</TabsTrigger>
              <TabsTrigger value="history" className="text-xs">{t("detail_tab_history")}</TabsTrigger>
            </TabsList>
            <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 h-8" onClick={handleDelete}>
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              {t("detail_delete")}
            </Button>
          </div>
        </div>

        <TabsContent value="info" className="mt-3 flex-1 min-h-0 overflow-hidden">
          <div className="grid grid-cols-5 gap-4 h-full">
            <div className="col-span-2 overflow-auto">
              <PersonalInfoTab employee={employee} DOC_STATUS_LABELS={DOC_STATUS_LABELS} />
            </div>
            <div className="col-span-3 overflow-auto">
              <DocumentsSection employeeId={id} documents={employee.documents || []} DOC_STATUS_LABELS={DOC_STATUS_LABELS} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-3 flex-1 min-h-0 overflow-auto">
          <HistoryTab documents={employee.documents || []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─── Thông tin cá nhân ───────────────────────────────────── */

function PersonalInfoTab({ employee, DOC_STATUS_LABELS }: { employee: any; DOC_STATUS_LABELS: Record<string, string> }) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateMutation = useUpdateEmployee();

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = {
      fullName: fd.get("fullName") as string,
      dob: (fd.get("dob") as string) || null,
      gender: (fd.get("gender") as string) || null,
      nationality: fd.get("nationality") as string,
      company: (fd.get("company") as string)?.trim() || null,
      cccd: (fd.get("cccd") as string) || null,
      passportNo: (fd.get("passportNo") as string) || null,
      passportExpiry: (fd.get("passportExpiry") as string) || null,
      visaNo: (fd.get("visaNo") as string) || null,
      visaExpiry: (fd.get("visaExpiry") as string) || null,
      position: (fd.get("position") as string) || null,
      phone: (fd.get("phone") as string) || null,
      email: (fd.get("email") as string) || null,
      tempAddress: (fd.get("tempAddress") as string) || null,
      employeeCode: (fd.get("employeeCode") as string) || null,
      workPeriod: (fd.get("workPeriod") as string) || null,
      cuaKhau: (fd.get("cuaKhau") as string) || null,
      status: fd.get("status") as "active" | "resigned",
    };
    updateMutation.mutate({ id: employee.id, data }, {
      onSuccess: () => {
        toast({ title: t("detail_saved") });
        queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(employee.id) });
        queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
      },
    });
  };

  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-sm h-full flex flex-col">
      <form onSubmit={handleSave} className="flex flex-col h-full">
        <CardHeader className="flex flex-row items-center justify-between py-2.5 px-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 shrink-0">
          <CardTitle className="text-sm font-semibold">{t("detail_personal_info")}</CardTitle>
          <Button type="submit" disabled={updateMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white h-7 text-xs px-3">
            <Save className="w-3 h-3 mr-1.5" />
            {updateMutation.isPending ? t("detail_saving") : t("detail_save")}
          </Button>
        </CardHeader>
        <CardContent className="p-4 flex-1 overflow-auto">
          <PassportImageZone employeeId={employee.id} initialPhotoUrl={employee.photoUrl} />
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <F label={t("detail_field_name")} tag="HO_TEN"><Input name="fullName" defaultValue={employee.fullName} required className="h-8 text-sm" /></F>
            <F label={t("detail_field_nationality")} tag="QUOC_TICH"><Input name="nationality" defaultValue={employee.nationality} required className="h-8 text-sm" /></F>
            <F label={t("detail_field_company")} tag="CONG_TY"><Input name="company" defaultValue={employee.company || ""} className="h-8 text-sm" /></F>
            <F label={t("detail_field_dob")} tag="NGAY_SINH"><Input name="dob" type="date" defaultValue={employee.dob ? employee.dob.split("T")[0] : ""} className="h-8 text-sm" /></F>
            <F label={t("detail_field_gender")} tag="GIOI_TINH">
              <select name="gender" defaultValue={employee.gender || ""} className="w-full h-8 px-2 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm">
                <option value="">{t("detail_field_gender_none")}</option>
                <option value="Nam">{t("detail_field_gender_male")}</option>
                <option value="Nữ">{t("detail_field_gender_female")}</option>
                <option value="Khác">{t("detail_field_gender_other")}</option>
              </select>
            </F>
            <F label={t("detail_field_cccd")} tag="CCCD"><Input name="cccd" defaultValue={(employee as any).cccd || ""} className="h-8 text-sm font-mono" placeholder={t("detail_field_cccd")} /></F>
            <F label={t("detail_field_employee_code")} tag="MA_NV"><Input name="employeeCode" defaultValue={(employee as any).employeeCode || ""} className="h-8 text-sm font-mono" /></F>

            <div className="col-span-2 border-t border-slate-100 dark:border-slate-800 my-0.5" />

            <F label={t("detail_field_work_period")} tag="TGCT"><Input name="workPeriod" defaultValue={(employee as any).workPeriod || ""} className="h-8 text-sm" placeholder={t("year_placeholder")} /></F>
            <F label={t("detail_field_phone")}><Input name="phone" defaultValue={employee.phone || ""} className="h-8 text-sm" /></F>
            <div className="col-span-2"><F label={t("detail_field_position")} tag="CHUC_VU"><Input name="position" defaultValue={employee.position || ""} className="h-8 text-sm" /></F></div>
            <div className="col-span-2"><F label={t("detail_field_address")} tag="DIA_CHI"><Input name="tempAddress" defaultValue={employee.tempAddress || ""} className="h-8 text-sm" /></F></div>
            <div className="col-span-2"><F label={t("detail_field_cua_khau")} tag="CUA_KHAU"><Input name="cuaKhau" defaultValue={(employee as any).cuaKhau || ""} className="h-8 text-sm" placeholder={t("detail_field_cua_khau")} /></F></div>

            <div className="col-span-2 border-t border-slate-100 dark:border-slate-800 my-0.5" />

            <div className="col-span-2">
              <F label={t("detail_field_work_status")}>
                <select name="status" defaultValue={employee.status} className="w-full h-8 px-2 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm max-w-[180px] block">
                  <option value="active">{t("detail_status_active")}</option>
                  <option value="resigned">{t("emp_resigned")}</option>
                </select>
              </F>
            </div>
          </div>
        </CardContent>
      </form>
    </Card>
  );
}

function F({ label, tag, children }: { label: string; tag?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
        {label}
        {tag && <span className="font-mono bg-indigo-50 text-indigo-400 border border-indigo-100 rounded px-1 normal-case">{`{{${tag}}}`}</span>}
      </label>
      {children}
    </div>
  );
}

/* ─── Khu vực ảnh hộ chiếu ──────────────────────────────── */

function PassportImageZone({ employeeId, initialPhotoUrl }: { employeeId: number; initialPhotoUrl?: string | null }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const uploadMutation = useUploadEmployeePhoto();

  const [cacheBust, setCacheBust] = useState(() => Date.now());
  const [hasPhoto, setHasPhoto] = useState(!!initialPhotoUrl);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [storagePickerOpen, setStoragePickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setHasPhoto(!!initialPhotoUrl); }, [initialPhotoUrl]);

  const photoSrc = hasPhoto ? `/api/employees/${employeeId}/photo?t=${cacheBust}` : null;

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    uploadMutation.mutate(
      { id: employeeId, data: { photo: file } },
      {
        onSuccess: () => {
          setHasPhoto(true);
          setCacheBust(Date.now());
          queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(employeeId) });
          toast({ title: t("detail_photo_uploaded") });
        },
        onError: (err: any) => {
          const detail = err?.response?.data?.detail ?? "";
          toast({ variant: "destructive", title: t("error"), description: detail || t("detail_photo_err") });
        },
      }
    );
  };

  const handleRemove = async () => {
    setIsDeleting(true);
    try {
      await fetch(`/api/employees/${employeeId}/photo`, { method: "DELETE" });
      setHasPhoto(false);
      setCacheBust(Date.now());
      queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(employeeId) });
      toast({ title: t("detail_photo_deleted") });
    } catch {
      toast({ variant: "destructive", title: t("error"), description: t("detail_photo_del_err") });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStorageSelect = async (file: { objectPath: string }) => {
    try {
      const res = await fetch(`/api/employees/${employeeId}/photo-path`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectPath: file.objectPath }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Lỗi cập nhật ảnh");
      }
      setHasPhoto(true);
      setCacheBust(Date.now());
      queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(employeeId) });
      toast({ title: t("detail_photo_storage_ok") });
    } catch (err: any) {
      toast({ variant: "destructive", title: t("error"), description: err?.message });
    }
  };

  const isUploading = uploadMutation.isPending;

  return (
    <div className="mb-3">
      <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
        {t("detail_passport_photo")}
      </p>
      <div
        className={`relative rounded-lg border-2 border-dashed overflow-hidden transition-colors cursor-pointer
          ${isDragging
            ? "border-indigo-400 bg-indigo-50/60"
            : photoSrc
            ? "border-slate-200 dark:border-slate-700"
            : "border-slate-200 dark:border-slate-700 hover:border-indigo-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
          }`}
        style={{ aspectRatio: "3/2", minHeight: 130, maxHeight: 259 }}
        onClick={() => !photoSrc && !isUploading && fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
      >
        {isUploading || isDeleting ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-slate-900/60">
            <p className="text-xs text-slate-500">{isUploading ? t("detail_uploading") : t("detail_deleting")}</p>
          </div>
        ) : null}
        {photoSrc ? (
          <>
            <img src={photoSrc} alt={t("detail_passport_photo")} className="w-full h-full object-contain" />
            <div className="absolute top-1.5 right-1.5 flex gap-1">
              <a
                href={photoSrc}
                download={`ho-chieu-${employeeId}.jpg`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-[9px] bg-black/50 hover:bg-black/70 text-white rounded px-1.5 py-0.5 transition-colors"
              >
                <Download className="w-2.5 h-2.5" />
                {t("detail_download")}
              </a>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                className="inline-flex items-center gap-1 text-[9px] bg-black/50 hover:bg-black/70 text-white rounded px-1.5 py-0.5 transition-colors"
              >
                <Upload className="w-2.5 h-2.5" />
                {t("detail_change")}
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setStoragePickerOpen(true); }}
                className="inline-flex items-center gap-1 text-[9px] bg-indigo-600/80 hover:bg-indigo-600 text-white rounded px-1.5 py-0.5 transition-colors"
              >
                <FolderOpen className="w-2.5 h-2.5" />
                {t("detail_storage")}
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleRemove(); }}
                disabled={isDeleting}
                className="inline-flex items-center gap-1 text-[9px] bg-black/50 hover:bg-black/70 text-white rounded px-1.5 py-0.5 transition-colors"
              >
                <X className="w-2.5 h-2.5" />
                {t("detail_remove")}
              </button>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 select-none">
            <div className="rounded-lg bg-slate-100 dark:bg-slate-800 p-2">
              <ImageIcon className="w-4 h-4 text-slate-400" />
            </div>
            <p className="text-[10px] text-slate-400">{t("detail_drag_photo")}</p>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded px-2 py-1 hover:bg-indigo-100 transition-colors"
              >
                <Upload className="w-3 h-3" />
                {t("detail_upload")}
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setStoragePickerOpen(true); }}
                className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/40 border border-indigo-300 dark:border-indigo-700 rounded px-2 py-1 hover:bg-indigo-200 transition-colors"
              >
                <FolderOpen className="w-3 h-3" />
                App Storage
              </button>
            </div>
          </div>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      <StorageFilePicker
        open={storagePickerOpen}
        onClose={() => setStoragePickerOpen(false)}
        folder="photos"
        accept="image/*"
        title={t("detail_choose_storage")}
        onSelect={handleStorageSelect}
      />
    </div>
  );
}

/* ─── Giấy tờ – inline editable ─────────────────────────── */

function DocumentsSection({ employeeId, documents, DOC_STATUS_LABELS }: { employeeId: number; documents: Document[]; DOC_STATUS_LABELS: Record<string, string> }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      await downloadExcel(
        `/api/employees/${employeeId}/export-excel`,
        `ho_so_nhanvien_${employeeId}.xlsx`
      );
      toast({ title: t("detail_export_ok") });
    } catch {
      toast({ variant: "destructive", title: t("error"), description: t("detail_export_err") });
    } finally {
      setIsExporting(false);
    }
  };

  const docMap: Record<string, Document> = {};
  for (const doc of documents) {
    if (!docMap[doc.docType] || new Date(doc.createdAt) > new Date(docMap[doc.docType].createdAt)) {
      docMap[doc.docType] = doc;
    }
  }
  const extraTypes = [...new Set(documents.map((d) => d.docType).filter((tp) => !FIXED_DOC_TYPES.includes(tp)))];
  const allRows = [...FIXED_DOC_TYPES, ...extraTypes];

  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-sm h-full flex flex-col">
      <CardHeader className="py-2.5 px-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 shrink-0 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold">{t("detail_docs_title")}</CardTitle>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5 border-green-600 text-green-700 hover:bg-green-50"
          onClick={handleExportExcel}
          disabled={isExporting || documents.length === 0}
        >
          <Sheet className="w-3.5 h-3.5" />
          {isExporting ? t("detail_exporting") : t("detail_export_excel")}
        </Button>
      </CardHeader>
      <div className="overflow-auto flex-1">
        <table className="w-full text-sm border-collapse">
          <thead className="text-[10px] text-slate-400 uppercase bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 font-medium text-left">{t("detail_col_doctype")}</th>
              <th className="px-3 py-2 font-medium text-left w-44">{t("detail_col_id")}</th>
              <th className="px-3 py-2 font-medium text-left">{t("detail_col_issue")}</th>
              <th className="px-3 py-2 font-medium text-left">{t("detail_col_expiry")}</th>
              <th className="px-3 py-2 font-medium text-left w-20">{t("detail_col_status")}</th>
              <th className="px-3 py-2 font-medium text-center w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-950">
            {allRows.map((type) => (
              <DocRow
                key={type}
                type={type}
                doc={docMap[type] || null}
                employeeId={employeeId}
                DOC_STATUS_LABELS={DOC_STATUS_LABELS}
                tags={
                  type === "Hộ chiếu"
                    ? { idNumber: "SO_HC", issueDate: "CAP_HC", expiryDate: "HH_HC" }
                    : type === "Visa"
                    ? { idNumber: "SO_VISA", issueDate: "CAP_VISA", expiryDate: "HH_VISA" }
                    : type === "Thẻ tạm trú (TRC)"
                    ? { idNumber: "SO_TRC", expiryDate: "HH_TRC" }
                    : undefined
                }
              />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function DocRow({ type, doc, employeeId, tags, DOC_STATUS_LABELS }: { type: string; doc: Document | null; employeeId: number; tags?: { idNumber?: string; issueDate?: string; expiryDate?: string }; DOC_STATUS_LABELS: Record<string, string> }) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createMutation = useCreateEmployeeDocument();
  const updateMutation = useUpdateDocument();
  const deleteMutation = useDeleteDocument();

  const toDateStr = (val?: string | null) => (val ? val.split("T")[0] : "");

  const [idNumber, setIdNumber] = useState(doc?.idNumber || "");
  const [issueDate, setIssueDate] = useState(toDateStr(doc?.issueDate));
  const [expiryDate, setExpiryDate] = useState(toDateStr(doc?.expiryDate));

  useEffect(() => {
    setIdNumber(doc?.idNumber || "");
    setIssueDate(toDateStr(doc?.issueDate));
    setExpiryDate(toDateStr(doc?.expiryDate));
  }, [doc?.id, doc?.updatedAt]);

  const autoStatus = computeStatus(expiryDate || null, doc?.status || "pending");

  const isDirty =
    idNumber !== (doc?.idNumber || "") ||
    issueDate !== toDateStr(doc?.issueDate) ||
    expiryDate !== toDateStr(doc?.expiryDate);

  const isPending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  const handleSave = () => {
    const data = {
      docType: type,
      idNumber: idNumber || null,
      issueDate: issueDate || null,
      expiryDate: expiryDate || null,
      status: autoStatus as any,
      notes: doc?.notes || null,
    };
    if (doc) {
      updateMutation.mutate({ id: doc.id, data }, {
        onSuccess: () => {
          toast({ title: t("detail_saved"), description: type });
          queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(employeeId) });
          queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
        },
      });
    } else {
      createMutation.mutate({ id: employeeId, data }, {
        onSuccess: () => {
          toast({ title: t("detail_saved"), description: type });
          queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(employeeId) });
          queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
        },
      });
    }
  };

  const handleDelete = () => {
    if (!doc) return;
    if (confirm(`${t("detail_confirm_del_doc")} ${type}?`)) {
      deleteMutation.mutate({ id: doc.id }, {
        onSuccess: () => {
          toast({ title: t("detail_deleted"), description: type });
          queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(employeeId) });
          queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
        },
      });
    }
  };

  const handleReset = () => {
    setIdNumber(doc?.idNumber || "");
    setIssueDate(toDateStr(doc?.issueDate));
    setExpiryDate(toDateStr(doc?.expiryDate));
  };

  return (
    <tr className="hover:bg-slate-50/60 dark:hover:bg-slate-900/30 transition-colors group">
      <td className="px-3 py-1.5 font-medium text-slate-700 dark:text-slate-300 text-xs whitespace-nowrap">{type}</td>
      <td className="px-2 py-1.5">
        <div className="flex flex-col gap-0.5">
          <Input
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value)}
            placeholder="—"
            className="h-7 text-xs font-mono border-slate-200 focus:border-indigo-400 bg-transparent w-full min-w-[90px]"
          />
          {tags?.idNumber && (
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
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            className="h-7 text-xs border-slate-200 focus:border-indigo-400 bg-transparent w-full min-w-[120px]"
          />
          {tags?.issueDate && (
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
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            className="h-7 text-xs border-slate-200 focus:border-indigo-400 bg-transparent w-full min-w-[120px]"
          />
          {tags?.expiryDate && (
            <span className="text-[9px] font-mono text-indigo-400/70 select-none leading-none">
              {`{{${tags.expiryDate}}}`}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-1.5 whitespace-nowrap">
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${DOC_STATUS_COLORS[autoStatus]}`}>
          {DOC_STATUS_LABELS[autoStatus] || autoStatus}
        </Badge>
      </td>
      <td className="px-2 py-1.5 text-center whitespace-nowrap">
        {isDirty ? (
          <div className="flex items-center justify-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSave}
              disabled={isPending}
              className="h-6 w-6 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
              title={t("save")}
            >
              <Check className="w-3.5 h-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="h-6 w-6 p-0 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              title={t("cancel")}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : doc ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={isPending}
            className="h-6 w-6 p-0 text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
            title={t("delete")}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        ) : null}
      </td>
    </tr>
  );
}

/* ─── Lịch sử ────────────────────────────────────────────── */

function HistoryTab({ documents }: { documents: Document[] }) {
  const { t } = useLanguage();
  const [selectedDocId, setSelectedDocId] = useState<number | "">("");

  useEffect(() => {
    if (documents.length > 0 && selectedDocId === "") setSelectedDocId(documents[0].id);
  }, [documents]);

  const { data: history, isLoading } = useGetDocumentHistory(selectedDocId as number, {
    query: {
      queryKey: getGetDocumentHistoryQueryKey(selectedDocId as number),
      enabled: !!selectedDocId,
    },
  });

  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50">
        <CardTitle className="text-sm font-semibold">{t("detail_history_title")}</CardTitle>
        <select
          value={selectedDocId}
          onChange={(e) => setSelectedDocId(Number(e.target.value))}
          className="w-56 h-8 px-3 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm"
        >
          <option value="" disabled>{t("detail_choose_doc")}</option>
          {documents.map((d) => (
            <option key={d.id} value={d.id}>{d.docType} {d.idNumber ? `(${d.idNumber})` : ""}</option>
          ))}
        </select>
      </CardHeader>
      <div className="overflow-auto">
        {!selectedDocId ? (
          <div className="p-8 text-center text-slate-400 text-sm">{t("detail_no_doc_selected")}</div>
        ) : isLoading ? (
          <div className="p-8 text-center text-slate-400 text-sm">{t("loading")}</div>
        ) : history?.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
            <History className="w-7 h-7 text-slate-300" />
            {t("detail_no_history")}
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="text-[11px] text-slate-400 uppercase bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-2 font-medium">{t("detail_col_time")}</th>
                <th className="px-4 py-2 font-medium">{t("detail_col_change_type")}</th>
                <th className="px-4 py-2 font-medium">{t("detail_col_old")}</th>
                <th className="px-4 py-2 font-medium">{t("detail_col_new")}</th>
                <th className="px-4 py-2 font-medium">{t("detail_col_notes")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-950">
              {history?.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap text-xs">{new Date(entry.createdAt).toLocaleString("vi-VN")}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200 text-[10px]">{entry.changeType}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400 text-xs max-w-[180px] truncate">{entry.oldData || "—"}</td>
                  <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200 text-xs max-w-[180px] truncate">{entry.newData || "—"}</td>
                  <td className="px-4 py-2.5 text-slate-400 text-xs">{entry.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
