import { useI18n, Language } from "../i18n";
import { Globe, Check } from "lucide-react";

export default function LanguageSelector() {
  const { language, setLanguage } = useI18n();

  const langs: { key: Language; label: string }[] = [
    { key: "fr", label: "Français" },
    { key: "ht", label: "Kreyòl Ayisyen" },
    { key: "en", label: "English" },
  ];

  return (
    <div className="relative flex items-center p-1.5 bg-slate-900/60 border border-slate-800/80 rounded-lg backdrop-blur-md" id="lang-selector-container">
      <Globe className="w-4 h-4 text-cyan-400 mr-2" id="lang-selector-icon" />
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value as Language)}
        className="appearance-none bg-transparent text-[10px] sm:text-xs font-medium text-slate-200 cursor-pointer focus:outline-none pr-6"
        id="lang-selector-dropdown"
      >
        {langs.map((l) => (
          <option key={l.key} value={l.key} className="bg-slate-900 text-slate-200">
            {l.label}
          </option>
        ))}
      </select>
    </div>
  );
}
