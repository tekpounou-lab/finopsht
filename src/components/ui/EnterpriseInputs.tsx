import React, { useState } from "react";
import { Search, Upload, QrCode, Barcode, X, SlidersHorizontal, Tag } from "lucide-react";

export const SearchInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}> = ({ value, onChange, placeholder = "Rechercher...", className = "" }) => (
  <div className={`relative ${className}`}>
    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full pl-9 pr-8 py-2 bg-slate-950/80 border border-slate-800 focus:border-blue-500 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition"
    />
    {value && (
      <button
        type="button"
        onClick={() => onChange("")}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    )}
  </div>
);

export const CommandSearch = SearchInput;
export const AdvancedSearch = SearchInput;

export const FilterBar: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = ""
}) => (
  <div className={`flex flex-wrap items-center gap-2 p-2 bg-slate-900/60 border border-slate-800 rounded-xl ${className}`}>
    <div className="flex items-center gap-1.5 px-2 text-xs text-slate-400 font-semibold border-r border-slate-800">
      <SlidersHorizontal className="w-3.5 h-3.5" />
      <span>Filtres:</span>
    </div>
    {children}
  </div>
);

export const QuickFilter: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
}> = ({ label, active, onClick, count }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition flex items-center gap-1.5 ${
      active
        ? "bg-blue-600 text-white shadow-sm"
        : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60"
    }`}
  >
    <span>{label}</span>
    {count !== undefined && (
      <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${active ? "bg-white/20 text-white" : "bg-slate-900 text-slate-400"}`}>
        {count}
      </span>
    )}
  </button>
);

export const TagInput: React.FC<{
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}> = ({ tags, onChange, placeholder = "Ajouter un tag..." }) => {
  const [input, setInput] = useState("");

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && input.trim()) {
      e.preventDefault();
      if (!tags.includes(input.trim())) {
        onChange([...tags, input.trim()]);
      }
      setInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    onChange(tags.filter((t) => t !== tagToRemove));
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 p-2 bg-slate-950/80 border border-slate-800 rounded-xl min-h-[42px]">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800 text-slate-200 rounded-lg text-xs font-medium border border-slate-700"
        >
          <Tag className="w-3 h-3 text-slate-400" />
          <span>{tag}</span>
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="hover:text-rose-400 transition cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? placeholder : ""}
        className="flex-1 bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none min-w-[120px]"
      />
    </div>
  );
};

export const TokenInput = TagInput;

export const FileUpload: React.FC<{
  onFileSelect: (file: File) => void;
  accept?: string;
  label?: string;
  hint?: string;
}> = ({ onFileSelect, accept, label = "Cliquez ou glissez un fichier ici", hint = "Formats supportés: PDF, PNG, JPG, XLSX" }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-800 hover:border-blue-500/50 bg-slate-950/40 hover:bg-slate-900/60 rounded-2xl cursor-pointer transition text-center space-y-2">
      <div className="p-3 bg-slate-800/80 rounded-2xl text-blue-400">
        <Upload className="w-6 h-6" />
      </div>
      <div className="text-xs font-semibold text-slate-200">{label}</div>
      <div className="text-[11px] text-slate-400">{hint}</div>
      <input type="file" accept={accept} onChange={handleChange} className="hidden" />
    </label>
  );
};

export const ImageUpload = FileUpload;

export const SignaturePad: React.FC<{ onSave?: (dataUrl: string) => void }> = () => (
  <div className="p-4 border border-slate-800 bg-slate-950/80 rounded-2xl text-center space-y-2">
    <div className="h-28 border border-dashed border-slate-800 rounded-xl flex items-center justify-center text-xs text-slate-500">
      Zone de Signature Tactile/Souris
    </div>
    <div className="text-[11px] text-slate-400">Signez à l'intérieur du cadre</div>
  </div>
);

export const BarcodeInput: React.FC<{ value: string; onChange: (v: string) => void }> = ({
  value,
  onChange
}) => (
  <div className="relative">
    <Barcode className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Scanner le code barre..."
      className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-100 font-mono"
    />
  </div>
);

export const QRCodeInput: React.FC<{ value: string; onChange: (v: string) => void }> = ({
  value,
  onChange
}) => (
  <div className="relative">
    <QrCode className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Scanner le QR Code..."
      className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-100 font-mono"
    />
  </div>
);

export const PINInput: React.FC<{ length?: number; onComplete: (pin: string) => void }> = ({
  length = 4,
  onComplete
}) => {
  const [pin, setPin] = useState<string[]>(Array(length).fill(""));

  const handleChange = (idx: number, val: string) => {
    if (val.length > 1) return;
    const nextPin = [...pin];
    nextPin[idx] = val;
    setPin(nextPin);
    if (nextPin.every((digit) => digit !== "")) {
      onComplete(nextPin.join(""));
    }
  };

  return (
    <div className="flex items-center justify-center gap-2">
      {pin.map((digit, i) => (
        <input
          key={i}
          type="password"
          maxLength={1}
          value={digit}
          onChange={(e) => handleChange(i, e.target.value)}
          className="w-12 h-12 text-center text-lg font-bold bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl text-slate-100 focus:outline-none"
        />
      ))}
    </div>
  );
};
