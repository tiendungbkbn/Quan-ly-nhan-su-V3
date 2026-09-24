import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UploadCloud, FolderOpen, FileText, Image, RefreshCw, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export type StorageFolder = "photos" | "templates";

interface StorageFile {
  name: string;
  objectPath: string;   // /public-objects/photos/foo.jpg
  size: number;
  updatedAt: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  folder: StorageFolder;
  accept?: string;       // e.g. "image/*" or ".docx"
  title?: string;
  onSelect: (file: StorageFile & { servingUrl: string }) => void;
}

async function uploadPublicFile(folder: string, file: File) {
  const formData = new FormData();
  formData.append("folder", folder);
  formData.append("filename", file.name);
  formData.append("contentType", file.type || "application/octet-stream");
  formData.append("file", file);

  const res = await fetch("/api/storage/public-uploads", {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Không thể lấy upload URL");
  }
  return res.json() as Promise<{ objectPath: string; servingUrl: string; name: string; size: number; updatedAt: string }>;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function StorageFilePicker({ open, onClose, folder, accept, title, onSelect }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const listKey = ["storage-list", folder];
  const { data, isLoading, isError } = useQuery({
    queryKey: listKey,
    queryFn: async () => {
      const res = await fetch(`/api/storage/list?folder=${folder}`);
      if (!res.ok) throw new Error("Không thể tải danh sách");
      return res.json() as Promise<{ folder: string; files: StorageFile[] }>;
    },
    enabled: open,
    staleTime: 30_000,
  });

  const files = data?.files ?? [];

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const { objectPath, servingUrl, name, size, updatedAt } = await uploadPublicFile(folder, file);
      await queryClient.invalidateQueries({ queryKey: listKey });
      toast({ title: "Tải lên thành công", description: file.name });
      const storageFile: StorageFile = {
        name,
        objectPath,
        size,
        updatedAt,
      };
      onSelect({ ...storageFile, servingUrl });
      onClose();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Lỗi", description: err?.message ?? "Tải lên thất bại" });
    } finally {
      setUploading(false);
    }
  };

  const handlePickExisting = (f: StorageFile) => {
    const servingUrl = `/api/storage${f.objectPath}`;
    onSelect({ ...f, servingUrl });
    onClose();
  };

  const isImage = folder === "photos";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FolderOpen className="w-4 h-4 text-indigo-500" />
            {title ?? (folder === "photos" ? "Chọn ảnh từ App Storage" : "Chọn biểu mẫu từ App Storage")}
          </DialogTitle>
          <p className="text-xs text-slate-500 mt-0.5">
            Thư mục: <span className="font-mono text-indigo-600">/{folder}/</span>
          </p>
        </DialogHeader>

        {/* Upload strip */}
        <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 shrink-0 bg-slate-50/60 dark:bg-slate-900/40">
          <Button
            size="sm"
            variant="outline"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="gap-2 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            {uploading ? "Đang tải lên..." : "Tải lên mới"}
          </Button>
          <span className="text-xs text-slate-400">hoặc chọn file đã có bên dưới</span>
          <div className="flex-1" />
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => queryClient.invalidateQueries({ queryKey: listKey })}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
            e.target.value = "";
          }}
        />

        {/* File grid */}
        <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
              Đang tải danh sách...
            </div>
          ) : isError ? (
            <div className="flex items-center justify-center h-40 text-red-500 text-sm">
              Không thể tải danh sách. Thử lại sau.
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                {isImage ? <Image className="w-6 h-6 text-slate-400" /> : <FileText className="w-6 h-6 text-slate-400" />}
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Thư mục trống</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tải lên file hoặc dùng App Storage pane để thêm file vào thư mục <span className="font-mono">/{folder}/</span>
                </p>
              </div>
            </div>
          ) : (
            <div className={isImage
              ? "grid grid-cols-3 sm:grid-cols-4 gap-3"
              : "flex flex-col gap-2"
            }>
              {files.map((f) => {
                const servingUrl = `/api/storage${f.objectPath}`;
                const isSelected = selected === f.objectPath;
                if (isImage) {
                  return (
                    <button
                      key={f.objectPath}
                      onClick={() => { setSelected(f.objectPath); handlePickExisting(f); }}
                      className={`relative rounded-lg border-2 overflow-hidden aspect-square transition-all hover:border-indigo-400
                        ${isSelected ? "border-indigo-500 ring-2 ring-indigo-300" : "border-slate-200 dark:border-slate-700"}`}
                    >
                      <img
                        src={servingUrl}
                        alt={f.name}
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).src = ""; }}
                      />
                      {isSelected && (
                        <div className="absolute inset-0 bg-indigo-500/20 flex items-center justify-center">
                          <Check className="w-6 h-6 text-indigo-700" />
                        </div>
                      )}
                      <div className="absolute bottom-0 inset-x-0 bg-black/50 px-1.5 py-0.5">
                        <p className="text-[9px] text-white truncate">{f.name}</p>
                      </div>
                    </button>
                  );
                }
                return (
                  <button
                    key={f.objectPath}
                    onClick={() => { setSelected(f.objectPath); handlePickExisting(f); }}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 text-left w-full transition-all hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20
                      ${isSelected ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30" : "border-slate-200 dark:border-slate-700"}`}
                  >
                    <div className="w-9 h-9 rounded bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-indigo-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{f.name}</p>
                      <p className="text-xs text-slate-500">
                        {formatSize(f.size)}
                        {f.updatedAt && ` · ${new Date(f.updatedAt).toLocaleDateString("vi-VN")}`}
                      </p>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-indigo-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
