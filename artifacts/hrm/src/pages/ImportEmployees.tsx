import { useRef, useState } from "react";
import { useParseImportFile, useConfirmImport, ImportRow } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, FileText, CheckCircle, XCircle, AlertCircle, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n";

// Các cột hiển thị trong bảng xem trước
const PREVIEW_COLS: { key: keyof ImportRow; label: string }[] = [
  { key: "id",        label: "ID" },
  { key: "HO_TEN",    label: "Họ tên" },
  { key: "NGAY_SINH", label: "Ngày sinh" },
  { key: "GIOI_TINH", label: "Giới tính" },
  { key: "QUOC_TICH", label: "Quốc tịch" },
  { key: "CCCD",      label: "CCCD" },
  { key: "MA_NV",     label: "Mã số NV" },
  { key: "company",   label: "Công ty" },
  { key: "CHUC_VU",   label: "Chức vụ" },
  { key: "phone",     label: "SĐT" },
  { key: "SO_HC",     label: "Số HC" },
  { key: "CAP_HC",    label: "Cấp HC" },
  { key: "HH_HC",     label: "HH HC" },
  { key: "SO_VISA",   label: "Số Visa" },
  { key: "CAP_VISA",  label: "Cấp Visa" },
  { key: "HH_VISA",   label: "HH Visa" },
  { key: "SO_TRC",    label: "Số TRC" },
  { key: "capTRC",    label: "Cấp TRC" },
  { key: "HH_TRC",    label: "HH TRC" },
  { key: "soGPLD",    label: "Số GPLD" },
  { key: "hhGPLD",    label: "HH GPLD" },
  { key: "soSKSK",    label: "Số SKSK" },
  { key: "hhSKSK",    label: "HH SKSK" },
  { key: "soLLTP",    label: "Số LLTP" },
  { key: "hhLLTP",    label: "HH LLTP" },
  { key: "soXNTT",    label: "Số XNTT" },
  { key: "hhXNTT",    label: "HH XNTT" },
  { key: "DIA_CHI",   label: "Địa chỉ tạm trú" },
  { key: "TGCT",      label: "Thời gian CT" },
];

type Phase = "idle" | "preview" | "done";

export default function ImportEmployees() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const parseMutation = useParseImportFile();
  const confirmMutation = useConfirmImport();

  const [phase, setPhase] = useState<Phase>("idle");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [confirmResult, setConfirmResult] = useState<{ ok: number; errors: number; results: { index: number; status: string; name?: string | null; error?: string | null }[] } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFile = (file: File) => {
    setFileName(file.name);
    parseMutation.mutate(
      { data: { file } as any },
      {
        onSuccess: (data) => {
          if (!data.rows || data.rows.length === 0) {
            toast({ variant: "destructive", title: t("emp_not_found"), description: "File không có hàng dữ liệu nào đọc được. Hãy kiểm tra định dạng cột (HO_TEN, SO_HC…)." });
            return;
          }
          setRows(data.rows as ImportRow[]);
          setPhase("preview");
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error ?? "Không thể đọc file.";
          toast({ variant: "destructive", title: t("error"), description: msg });
        },
      }
    );
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleConfirm = () => {
    confirmMutation.mutate(
      { data: { rows } },
      {
        onSuccess: (data) => {
          setConfirmResult(data as any);
          setPhase("done");
        },
        onError: () => {
          toast({ variant: "destructive", title: t("error"), description: "Không thể lưu dữ liệu. Vui lòng thử lại." });
        },
      }
    );
  };

  const handleReset = () => {
    setPhase("idle");
    setRows([]);
    setFileName("");
    setConfirmResult(null);
    parseMutation.reset();
    confirmMutation.reset();
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{t("import_title")}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("import_subtitle")}</p>
      </div>

      {/* Hướng dẫn định dạng */}
      <Card className="border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-indigo-900/10">
        <CardHeader className="py-3 px-4 border-b border-indigo-100 dark:border-indigo-900/40">
          <CardTitle className="text-sm font-semibold text-indigo-800 dark:text-indigo-300">{t("import_guide_title")}</CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-3 text-xs text-indigo-700 dark:text-indigo-400">
          <p>{t("import_guide_desc")}</p>
          <ul className="list-disc list-inside space-y-1 ml-1">
            <li>{t("import_guide_update")}</li>
            <li>{t("import_guide_create")}</li>
          </ul>
          <p className="text-indigo-600">{t("import_guide_overwrite")}</p>
          <p>{t("import_guide_date")}</p>
          <div>
            <p className="font-semibold mb-1.5">{t("import_col_list")}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
              {PREVIEW_COLS.map((col) => (
                <div key={col.key} className="flex items-center gap-1.5">
                  <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-300 w-14 shrink-0">{col.key}</span>
                  <span className="text-indigo-500 dark:text-indigo-400">{col.label}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upload Zone */}
      {phase === "idle" && (
        <Card className="border-slate-200 dark:border-slate-800">
          <CardContent className="p-6">
            <div
              className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
                isDragOver
                  ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20"
                  : "border-slate-200 dark:border-slate-700 hover:border-indigo-300 hover:bg-slate-50 dark:hover:bg-slate-900/50"
              }`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
            >
              {parseMutation.isPending ? (
                <div className="flex flex-col items-center gap-3 text-slate-500">
                  <div className="w-10 h-10 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm font-medium">{t("loading")}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                    <Upload className="w-7 h-7 text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("detail_drag_photo")}</p>
                    <p className="text-xs text-slate-400 mt-1">Hỗ trợ: .xlsx, .xls, .pdf — tối đa 20MB</p>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-green-600" /> Excel
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full">
                      <FileText className="w-3.5 h-3.5 text-red-500" /> PDF
                    </span>
                  </div>
                </div>
              )}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.pdf"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </CardContent>
        </Card>
      )}

      {/* Preview Table */}
      {phase === "preview" && (
        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader className="py-3 px-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">
                {rows.length} {t("gen_selected")} — "{fileName}"
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">{t("detail_no_doc_selected")}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleReset}>
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> {t("cancel")}
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={handleConfirm}
                disabled={confirmMutation.isPending}
              >
                {confirmMutation.isPending ? t("loading") : `${t("create_submit")} (${rows.length})`}
              </Button>
            </div>
          </CardHeader>
          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-500 uppercase">
                <tr>
                  <th className="px-3 py-2 font-medium text-left w-8">#</th>
                  {PREVIEW_COLS.map((col) => (
                    <th key={col.key} className="px-3 py-2 font-medium text-left whitespace-nowrap">
                      <span className="font-mono text-indigo-500">{col.key}</span>
                      <span className="ml-1 text-slate-400 font-normal normal-case">{col.label}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                    <td className="px-3 py-1.5 text-slate-400">{i + 1}</td>
                    {PREVIEW_COLS.map((col) => (
                      <td key={col.key} className="px-3 py-1.5 text-slate-700 dark:text-slate-300 whitespace-nowrap max-w-[140px] truncate">
                        {row[col.key] || <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Done */}
      {phase === "done" && confirmResult && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Card className="border-green-200 dark:border-green-900/40 bg-green-50/50 dark:bg-green-900/10">
              <CardContent className="p-5 flex items-center gap-4">
                <CheckCircle className="w-8 h-8 text-green-500 shrink-0" />
                <div>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-400">{confirmResult.ok}</p>
                  <p className="text-sm text-green-600 dark:text-green-500">{t("create_ok")}</p>
                </div>
              </CardContent>
            </Card>
            <Card className={`${confirmResult.errors > 0 ? "border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-900/10" : "border-slate-200 dark:border-slate-800"}`}>
              <CardContent className="p-5 flex items-center gap-4">
                {confirmResult.errors > 0
                  ? <XCircle className="w-8 h-8 text-red-400 shrink-0" />
                  : <AlertCircle className="w-8 h-8 text-slate-300 shrink-0" />}
                <div>
                  <p className={`text-2xl font-bold ${confirmResult.errors > 0 ? "text-red-600 dark:text-red-400" : "text-slate-400"}`}>{confirmResult.errors}</p>
                  <p className={`text-sm ${confirmResult.errors > 0 ? "text-red-500 dark:text-red-500" : "text-slate-400"}`}>{t("error")}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader className="py-3 px-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold">{t("detail_col_notes")}</CardTitle>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleReset}>
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> {t("import_title")}
              </Button>
            </CardHeader>
            <div className="overflow-auto max-h-[50vh]">
              <table className="w-full text-sm">
                <thead className="text-[10px] text-slate-400 uppercase bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-2 font-medium text-left w-8">#</th>
                    <th className="px-4 py-2 font-medium text-left">{t("emp_col_name")}</th>
                    <th className="px-4 py-2 font-medium text-left">{t("detail_col_status")}</th>
                    <th className="px-4 py-2 font-medium text-left">{t("detail_col_notes")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {confirmResult.results.map((r) => (
                    <tr key={r.index} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                      <td className="px-4 py-2 text-slate-400">{r.index + 1}</td>
                      <td className="px-4 py-2 font-medium text-slate-800 dark:text-slate-200">{r.name || "—"}</td>
                      <td className="px-4 py-2">
                        {r.status === "ok" ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px] px-1.5 py-0 h-5">
                            {t("create_ok")}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 text-[10px] px-1.5 py-0 h-5">
                            {t("error")}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-400">{r.error || (r.status === "ok" ? `ID #${(r as any).employeeId}` : "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
