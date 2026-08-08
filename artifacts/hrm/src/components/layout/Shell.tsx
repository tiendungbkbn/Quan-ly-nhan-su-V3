import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Users, FileText, FileSpreadsheet, ChevronLeft, ChevronRight, Settings, Globe, Check, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage, type Lang } from "@/lib/i18n";

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const mobileSettingsRef = useRef<HTMLDivElement>(null);
  const { lang, setLang, t } = useLanguage();

  // Close mobile drawer on route change
  useEffect(() => { setMobileOpen(false); }, [location]);

  const NAV_ITEMS = [
    { href: "/", label: t("nav_dashboard"), icon: LayoutDashboard },
    { href: "/nhan-vien", label: t("nav_employees"), icon: Users },
    { href: "/ho-so", label: t("nav_templates"), icon: FileText },
    { href: "/nhap-lieu", label: t("nav_import"), icon: FileSpreadsheet },
  ];

  // Close settings popup when clicking outside (desktop)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    if (settingsOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [settingsOpen]);

  const LANGS: { code: Lang; label: string }[] = [
    { code: "vi", label: t("lang_vi") },
    { code: "zh", label: t("lang_zh") },
  ];

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex-col bg-slate-900 text-slate-50 border-r border-slate-800 hidden md:flex shrink-0 transition-[width] duration-200 overflow-hidden",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Header */}
        <div className="h-16 flex items-center border-b border-slate-800 px-3 shrink-0">
          <div className={cn(
            "flex items-center gap-2 text-indigo-400 flex-1 min-w-0 transition-opacity duration-150",
            collapsed ? "opacity-0 pointer-events-none w-0" : "opacity-100"
          )}>
            <Users className="w-6 h-6 shrink-0" />
            <span className="text-lg font-bold tracking-tight text-white whitespace-nowrap truncate">HRM Portal</span>
          </div>
          {collapsed && (
            <div className="flex-1 flex items-center justify-center">
              <Users className="w-6 h-6 text-indigo-400" />
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? "Mở rộng menu" : "Thu gọn menu"}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-800 text-slate-500 hover:text-slate-200 transition-colors shrink-0"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 py-4 flex flex-col gap-1 px-2 overflow-hidden">
          {!collapsed && (
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-3 whitespace-nowrap">
              {t("nav_main_menu")}
            </div>
          )}
          {NAV_ITEMS.map((item) => {
            const isActive =
              location === item.href ||
              (item.href !== "/" && location.startsWith(item.href + "/"));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
                  collapsed ? "px-0 justify-center" : "px-3",
                  isActive
                    ? "bg-indigo-500/10 text-indigo-400"
                    : "text-slate-400 hover:text-slate-50 hover:bg-slate-800"
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Bottom section: settings + user */}
        <div className="border-t border-slate-800 shrink-0">
          {/* Settings button */}
          <div className="relative px-2 pt-2" ref={settingsRef}>
            <button
              onClick={() => setSettingsOpen((v) => !v)}
              title={t("settings")}
              className={cn(
                "w-full flex items-center gap-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
                collapsed ? "px-0 justify-center" : "px-3",
                settingsOpen
                  ? "bg-slate-800 text-slate-200"
                  : "text-slate-400 hover:text-slate-50 hover:bg-slate-800"
              )}
            >
              <Settings className="w-5 h-5 shrink-0" />
              {!collapsed && <span>{t("settings")}</span>}
            </button>

            {/* Settings popup */}
            {settingsOpen && (
              <div className={cn(
                "absolute bottom-full mb-2 z-50 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden",
                collapsed ? "left-14 w-52" : "left-2 right-2"
              )}>
                {/* Language switcher */}
                <div className="px-3 py-2.5 border-b border-slate-700">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    <Globe className="w-3.5 h-3.5" />
                    {t("language")}
                  </div>
                  <div className="space-y-1">
                    {LANGS.map((l) => (
                      <button
                        key={l.code}
                        onClick={() => { setLang(l.code); setSettingsOpen(false); }}
                        className={cn(
                          "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-colors",
                          lang === l.code
                            ? "bg-indigo-500/15 text-indigo-300"
                            : "text-slate-300 hover:bg-slate-700 hover:text-slate-100"
                        )}
                      >
                        <span>{l.label}</span>
                        {lang === l.code && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* User profile */}
          {collapsed ? (
            <div className="flex items-center justify-center p-3">
              <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
                <span className="text-slate-300 text-xs">HR</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-6 py-4 text-sm font-medium text-slate-400">
              <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 shrink-0">
                <span className="text-slate-300">HR</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-slate-200 truncate">Admin</span>
                <span className="text-xs text-slate-500 truncate">{lang === "zh" ? "人事管理" : "Nhân sự"}</span>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-full z-50 w-72 flex-col bg-slate-900 text-slate-50 border-r border-slate-800 flex md:hidden transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Drawer header */}
        <div className="h-16 flex items-center border-b border-slate-800 px-4 shrink-0">
          <div className="flex items-center gap-2 text-indigo-400 flex-1">
            <Users className="w-6 h-6 shrink-0" />
            <span className="text-lg font-bold tracking-tight text-white">HRM Portal</span>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-slate-800 text-slate-400 hover:text-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 flex flex-col gap-1 px-2 overflow-y-auto">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-3">
            {t("nav_main_menu")}
          </div>
          {NAV_ITEMS.map((item) => {
            const isActive =
              location === item.href ||
              (item.href !== "/" && location.startsWith(item.href + "/"));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-indigo-500/10 text-indigo-400"
                    : "text-slate-400 hover:text-slate-50 hover:bg-slate-800"
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Mobile settings + user */}
        <div className="border-t border-slate-800 shrink-0">
          <div className="relative px-2 pt-2" ref={mobileSettingsRef}>
            <button
              onClick={() => setSettingsOpen((v) => !v)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                settingsOpen ? "bg-slate-800 text-slate-200" : "text-slate-400 hover:text-slate-50 hover:bg-slate-800"
              )}
            >
              <Settings className="w-5 h-5 shrink-0" />
              <span>{t("settings")}</span>
            </button>
            {settingsOpen && (
              <div className="absolute bottom-full mb-2 left-2 right-2 z-50 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
                <div className="px-3 py-2.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    <Globe className="w-3.5 h-3.5" />
                    {t("language")}
                  </div>
                  <div className="space-y-1">
                    {LANGS.map((l) => (
                      <button
                        key={l.code}
                        onClick={() => { setLang(l.code); setSettingsOpen(false); }}
                        className={cn(
                          "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-colors",
                          lang === l.code
                            ? "bg-indigo-500/15 text-indigo-300"
                            : "text-slate-300 hover:bg-slate-700 hover:text-slate-100"
                        )}
                      >
                        <span>{l.label}</span>
                        {lang === l.code && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 px-6 py-4 text-sm font-medium text-slate-400">
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 shrink-0">
              <span className="text-slate-300 text-xs">HR</span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-slate-200 truncate">Admin</span>
              <span className="text-xs text-slate-500 truncate">{lang === "zh" ? "人事管理" : "Nhân sự"}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center justify-between px-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 md:hidden shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobileOpen(true)}
              className="w-9 h-9 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
              aria-label="Mở menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-indigo-500 dark:text-indigo-400">
              <Users className="w-5 h-5" />
              <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">HRM Portal</span>
            </div>
          </div>
        </header>
        <div className="flex-1 p-4 md:p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
