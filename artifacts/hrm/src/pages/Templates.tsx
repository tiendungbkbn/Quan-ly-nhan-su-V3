import { useState } from "react";
import { useListTemplates, useUploadTemplate, useDeleteTemplate, getListTemplatesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FileText, Trash2, UploadCloud, FileType2, Download, FolderOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { StorageFilePicker } from "@/components/StorageFilePicker";
import { useLanguage } from "@/lib/i18n";

export default function Templates() {
  const { t } = useLanguage();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const { data: templates, isLoading } = useListTemplates();
  const deleteMutation = useDeleteTemplate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleDelete = (id: number, name: string) => {
    if (confirm(`${t("tmpl_delete_confirm")} "${name}"?`)) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          toast({ title: t("tmpl_deleted"), description: t("tmpl_deleted_desc") });
          queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey() });
        }
      });
    }
  };

  const [importName, setImportName] = useState("");
  const [importDesc, setImportDesc] = useState("");
  const [pendingStorageFile, setPendingStorageFile] = useState<{ objectPath: string; name: string } | null>(null);
  const [importing, setImporting] = useState(false);

  const handleStoragePick = (file: { objectPath: string; name: string }) => {
    const baseName = file.name.replace(/\.docx$/i, "");
    setImportName(baseName);
    setPendingStorageFile(file);
  };

  const handleImportConfirm = async () => {
    if (!pendingStorageFile || !importName) return;
    setImporting(true);
    try {
      const res = await fetch("/api/templates/from-storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectPath: pendingStorageFile.objectPath,
          name: importName,
          description: importDesc || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Lỗi import template");
      }
      toast({ title: t("tmpl_added"), description: importName });
      queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey() });
      setPendingStorageFile(null);
      setImportName("");
      setImportDesc("");
    } catch (err: any) {
      toast({ variant: "destructive", title: t("error"), description: err?.message });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 h-full max-w-5xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{t("tmpl_title")}</h1>
          <p className="text-sm text-slate-500 mt-1">{t("tmpl_subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
            onClick={() => setIsPickerOpen(true)}
          >
            <FolderOpen className="w-4 h-4" />
            {t("tmpl_app_storage")}
          </Button>
          <UploadTemplateDialog open={isUploadOpen} onOpenChange={setIsUploadOpen} />
        </div>
      </div>

      {/* Import confirm panel */}
      {pendingStorageFile && (
        <Card className="border-indigo-200 bg-indigo-50/60 dark:bg-indigo-950/20 dark:border-indigo-800">
          <CardContent className="p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-end">
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-indigo-800 dark:text-indigo-300">
                <FolderOpen className="w-4 h-4" />
                {t("tmpl_import_label")} <span className="font-mono">{pendingStorageFile.name}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">{t("tmpl_template_name")}</label>
                  <Input
                    value={importName}
                    onChange={e => setImportName(e.target.value)}
                    placeholder={t("tmpl_name_placeholder")}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">{t("tmpl_desc")}</label>
                  <Input
                    value={importDesc}
                    onChange={e => setImportDesc(e.target.value)}
                    placeholder={t("tmpl_desc_placeholder")}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => setPendingStorageFile(null)}>{t("tmpl_cancel")}</Button>
              <Button
                size="sm"
                disabled={!importName || importing}
                onClick={handleImportConfirm}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {importing ? t("tmpl_adding") : t("tmpl_add_to_list")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="p-8 text-center text-slate-500">{t("tmpl_loading")}</div>
      ) : templates?.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/20">
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
              <FileType2 className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">{t("tmpl_none_title")}</h3>
            <p className="text-slate-500 text-sm max-w-sm mb-6">{t("tmpl_none_desc")}</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setIsPickerOpen(true)} className="gap-2 border-indigo-200 text-indigo-700">
                <FolderOpen className="w-4 h-4" />
                {t("tmpl_from_storage")}
              </Button>
              <Button onClick={() => setIsUploadOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                <UploadCloud className="w-4 h-4" />
                {t("tmpl_upload_new")}
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates?.map((tmpl) => (
            <Card key={tmpl.id} className="border-slate-200 dark:border-slate-800 shadow-sm group">
              <CardContent className="p-5">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-10 h-10 rounded bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex gap-1 -mr-2 -mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                      title={t("tmpl_download")}
                      onClick={() => {
                        const a = document.createElement("a");
                        a.href = `/api/templates/${tmpl.id}/download`;
                        a.click();
                      }}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                      title={t("delete")}
                      onClick={() => handleDelete(tmpl.id, tmpl.name)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="font-semibold text-slate-900 dark:text-white text-sm mb-1 truncate">{tmpl.name}</div>
                <div className="text-xs text-slate-500 truncate">{tmpl.description || t("no_desc")}</div>
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400">
                  {new Date(tmpl.createdAt).toLocaleDateString("vi-VN")}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <StorageFilePicker
        open={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        folder="templates"
        accept=".docx"
        title={t("tmpl_from_storage")}
        onSelect={handleStoragePick}
      />
    </div>
  );
}

/* ─── Upload dialog ─────────────────────────────────── */

function UploadTemplateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const uploadMutation = useUploadTemplate();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [tab, setTab] = useState("upload");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !name) return;
    uploadMutation.mutate({ data: { name, description: description || undefined, file } as any }, {
      onSuccess: () => {
        toast({ title: t("tmpl_added"), description: name });
        queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey() });
        onOpenChange(false);
        setName(""); setDescription(""); setFile(null);
      },
      onError: () => {
        toast({ variant: "destructive", title: t("error"), description: "Không thể tải lên biểu mẫu." });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2" onClick={() => onOpenChange(true)}>
          <UploadCloud className="w-4 h-4" />
          {t("tmpl_upload_new")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{t("tmpl_upload_new")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="pt-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("tmpl_template_name")} *</label>
            <Input value={name} onChange={e => setName(e.target.value)} required placeholder={t("tmpl_name_placeholder")} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("tmpl_desc")}</label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder={t("tmpl_desc_placeholder")} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">File .docx *</label>
            <div
              className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg p-6 text-center cursor-pointer hover:border-indigo-300 transition-colors"
              onClick={() => document.getElementById("tmpl-file-input")?.click()}
            >
              {file ? (
                <div className="flex items-center justify-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <FileType2 className="w-5 h-5 text-indigo-500" />
                  <span className="truncate max-w-[240px]">{file.name}</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-400">
                  <UploadCloud className="w-8 h-8" />
                  <span className="text-sm">Nhấn hoặc kéo thả file .docx</span>
                </div>
              )}
              <input
                id="tmpl-file-input"
                type="file"
                accept=".docx"
                className="hidden"
                onChange={e => setFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("tmpl_cancel")}</Button>
            <Button type="submit" disabled={!file || !name || uploadMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {uploadMutation.isPending ? t("tmpl_adding") : t("tmpl_upload_new")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
