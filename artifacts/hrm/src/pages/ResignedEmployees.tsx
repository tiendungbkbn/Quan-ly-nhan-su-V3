import { useState } from "react";
import {
  useListEmployees,
  useListTemplates,
  useGenerateDocs,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Search, FileDown, MoreHorizontal, FileText, UserMinus } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function ResignedEmployees() {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);

  const { data: employees, isLoading } = useListEmployees({
    search: search || undefined,
    status: "resigned",
  });

  const toggleSelect = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleAll = () => {
    if (selectedIds.size === employees?.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(employees?.map((e) => e.id) || []));
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <UserMinus className="w-5 h-5 text-slate-500 dark:text-slate-400" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Nhân viên đã nghỉ
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1 pl-12">
            Danh sách nhân sự đã kết thúc hợp đồng hoặc nghỉ việc.
          </p>
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <Button
              variant="secondary"
              className="gap-2"
              onClick={() => setIsGenerateOpen(true)}
            >
              <FileDown className="w-4 h-4" />
              Tạo hồ sơ ({selectedIds.size})
            </Button>
          )}
          <GenerateDocsDialog
            open={isGenerateOpen}
            onOpenChange={setIsGenerateOpen}
            selectedIds={Array.from(selectedIds)}
          />
        </div>
      </div>

      <Card className="border-slate-200 dark:border-slate-800 shadow-sm flex flex-col flex-1 overflow-hidden min-h-[500px]">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex gap-4 shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Tìm theo tên, passport..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800"
            />
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-400">
            <UserMinus className="w-3.5 h-3.5" />
            {isLoading ? "Đang tải..." : `${employees?.length ?? 0} nhân viên`}
          </div>
        </div>

        <div className="overflow-auto flex-1 p-0">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-900 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3 font-medium w-12 text-center">
                  <input
                    type="checkbox"
                    checked={employees?.length > 0 && selectedIds.size === employees.length}
                    onChange={toggleAll}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Họ và tên</th>
                <th className="px-4 py-3 font-medium">Quốc tịch</th>
                <th className="px-4 py-3 font-medium">Hộ chiếu</th>
                <th className="px-4 py-3 font-medium">Công ty / Chức vụ</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3 font-medium text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-950">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                    Đang tải dữ liệu...
                  </td>
                </tr>
              ) : employees?.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3 text-slate-400">
                      <UserMinus className="w-10 h-10 opacity-40" />
                      <p className="text-sm">Chưa có nhân viên nào trong danh sách đã nghỉ.</p>
                      <p className="text-xs text-slate-400">
                        Khi nhân viên được cập nhật sang trạng thái "Đã nghỉ", họ sẽ tự động xuất hiện ở đây.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                employees?.map((emp) => (
                  <tr
                    key={emp.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors group"
                  >
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(emp.id)}
                        onChange={() => toggleSelect(emp.id)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/nhan-vien/${emp.id}`}
                        className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        {emp.fullName}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {emp.phone || emp.email || "Không có liên hệ"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {emp.nationality}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-mono text-xs">
                      {emp.passportNo || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      <div>{emp.company || "-"}</div>
                      <div className="text-xs text-slate-500">{emp.position || "-"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className="bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                      >
                        Đã nghỉ
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/nhan-vien/${emp.id}`}
                        className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-50 h-8 w-8 p-0 opacity-0 group-hover:opacity-100"
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

function GenerateDocsDialog({
  open,
  onOpenChange,
  selectedIds,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  selectedIds: number[];
}) {
  const { toast } = useToast();
  const { data: templates, isLoading } = useListTemplates({ query: { enabled: open } });
  const generateMutation = useGenerateDocs();
  const [selectedTemplate, setSelectedTemplate] = useState<{ id: number; name: string } | null>(null);
  const [soCongVan, setSoCongVan] = useState("");
  // ngayNhapCanh: dd/MM/yyyy — nhập thẳng dạng văn bản
  const [ngayNhapCanh, setNgayNhapCanh] = useState("");

  const resetFields = () => {
    setSoCongVan("");
    setNgayNhapCanh("");
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

  const handleGenerate = () => {
    if (!selectedTemplate) return;
    generateMutation.mutate(
      {
        data: {
          employeeIds: selectedIds,
          templateId: selectedTemplate.id,
          soCongVan: soCongVan || null,
          ngayNhapCanh: ngayNhapCanh || null,
        },
      },
      {
        onSuccess: (blob) => {
          const mimeType =
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
          const safeBlob =
            blob instanceof Blob ? blob : new Blob([blob as BlobPart], { type: mimeType });
          const url = window.URL.createObjectURL(safeBlob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `Ho_so_nhan_vien_${Date.now()}.docx`;
          document.body.appendChild(link);
          link.click();
          link.parentNode?.removeChild(link);
          window.URL.revokeObjectURL(url);
          toast({ title: "Thành công", description: "Hồ sơ đã được tải xuống." });
          handleClose(false);
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Lỗi",
            description: "Không thể tạo hồ sơ. Vui lòng thử lại.",
          });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Tạo hồ sơ hàng loạt</DialogTitle>
        </DialogHeader>

        {!selectedTemplate ? (
          <div className="pt-4 space-y-4">
            <p className="text-sm text-slate-500">
              Bạn đã chọn{" "}
              <strong className="text-slate-900 dark:text-white">{selectedIds.length}</strong> nhân
              viên. Vui lòng chọn một biểu mẫu để tạo hồ sơ.
            </p>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
              {isLoading ? (
                <div className="text-center py-4 text-slate-500 text-sm">Đang tải biểu mẫu...</div>
              ) : templates?.length === 0 ? (
                <div className="text-center py-4 text-slate-500 text-sm">
                  Chưa có biểu mẫu nào. Hãy vào trang{" "}
                  <Link href="/ho-so" className="text-indigo-600 underline">
                    Hồ sơ mẫu
                  </Link>{" "}
                  để tải lên.
                </div>
              ) : (
                templates?.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-900/50 hover:border-indigo-300 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-medium text-sm text-slate-900 dark:text-slate-200">
                          {t.name}
                        </div>
                        <div className="text-xs text-slate-500">{t.description || "Không có mô tả"}</div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                      onClick={() => handleSelectTemplate(t.id, t.name)}
                    >
                      Chọn
                    </Button>
                  </div>
                ))
              )}
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => handleClose(false)}>
                Đóng
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="pt-4 space-y-5">
            <div className="flex items-center gap-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-lg">
              <div className="w-8 h-8 rounded bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div className="text-sm font-medium text-indigo-800 dark:text-indigo-300">
                {selectedTemplate.name}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Số công văn
                <span className="ml-2 text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 normal-case">
                  {"{{SO_CONG_VAN}}"}
                </span>
              </label>
              <Input
                placeholder="Ví dụ: 123/CV-CT"
                value={soCongVan}
                onChange={(e) => setSoCongVan(e.target.value)}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Ngày nhập cảnh
                <span className="ml-2 text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 normal-case">
                  {"{{NGAY_NHAP_CANH}}"}
                </span>
              </label>
              <Input
                type="text"
                placeholder="dd/mm/yyyy"
                value={ngayNhapCanh}
                onChange={(e) => setNgayNhapCanh(e.target.value)}
              />
              <p className="text-xs text-slate-400">Để trống nếu biểu mẫu không dùng tag này.</p>
            </div>

            <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-3 text-xs text-slate-500 space-y-1">
              <p className="font-medium text-slate-600 dark:text-slate-400">Tag tự động:</p>
              <p>
                <span className="font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5">
                  {"{{NGAY}}"}
                </span>{" "}
                — ngày tạo hồ sơ (tự động, không cần nhập)
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={handleBack}>
                Quay lại
              </Button>
              <Button
                type="button"
                onClick={handleGenerate}
                disabled={generateMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {generateMutation.isPending
                  ? "Đang tạo..."
                  : `Tạo hồ sơ (${selectedIds.length} nhân viên)`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
