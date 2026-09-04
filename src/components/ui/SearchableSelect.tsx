import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, Loader2 } from 'lucide-react';

export interface Option {
  id: string;
  name: string;
}

export interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: boolean;
  pageSize?: number;
  onSearch?: (term: string) => Promise<Option[]>;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Sélectionner...",
  error = false,
  pageSize = 20,
  onSearch
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [asyncOptions, setAsyncOptions] = useState<Option[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(pageSize);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setDisplayLimit(pageSize); // Reset pagination on new query
    }, 150);
    return () => clearTimeout(timer);
  }, [searchTerm, pageSize]);

  // Handle optional async server-side search
  useEffect(() => {
    if (!onSearch || !isOpen) return;

    let active = true;
    setIsLoading(true);

    onSearch(debouncedSearch)
      .then(res => {
        if (active) {
          setAsyncOptions(res);
          setIsLoading(false);
        }
      })
      .catch(err => {
        console.error("Async search error:", err);
        if (active) setIsLoading(false);
      });

    return () => { active = false; };
  }, [debouncedSearch, onSearch, isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeOptionsList = asyncOptions !== null ? asyncOptions : options;
  const selectedOption = activeOptionsList.find(opt => opt.id === value) || options.find(opt => opt.id === value);
  
  const filteredOptions = useMemo(() => {
    if (asyncOptions !== null) return asyncOptions; // Server-side already filtered
    if (!debouncedSearch.trim()) return options;
    const term = debouncedSearch.toLowerCase();
    return options.filter(opt => opt.name.toLowerCase().includes(term));
  }, [options, asyncOptions, debouncedSearch]);

  const displayedOptions = useMemo(() => {
    return filteredOptions.slice(0, displayLimit);
  }, [filteredOptions, displayLimit]);

  const hasMore = filteredOptions.length > displayedOptions.length;

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 30 && hasMore) {
      setDisplayLimit(prev => prev + pageSize);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div 
        className={`flex items-center justify-between w-full bg-slate-950 border ${error ? 'border-rose-500' : 'border-slate-800'} rounded px-3 py-2 text-slate-200 cursor-pointer focus-within:border-cyan-500`}
        onClick={() => {
          setIsOpen(!isOpen);
          setSearchTerm("");
          setDisplayLimit(pageSize);
        }}
      >
        <span className={selectedOption ? "text-slate-200" : "text-slate-500"}>
          {selectedOption ? selectedOption.name : placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-slate-900 border border-slate-800 rounded-md shadow-2xl shadow-black/50 overflow-hidden">
          <div className="flex items-center px-3 border-b border-slate-800 bg-slate-950">
            <Search className="w-4 h-4 text-slate-500 mr-2 flex-shrink-0" />
            <input
              type="text"
              className="w-full bg-transparent border-none py-2 text-slate-200 outline-none placeholder:text-slate-600 text-sm"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClick={e => e.stopPropagation()}
              autoFocus
            />
            {isLoading && <Loader2 className="w-4 h-4 text-cyan-400 animate-spin ml-2 flex-shrink-0" />}
          </div>
          <div 
            className="max-h-60 overflow-y-auto py-1 custom-scrollbar"
            onScroll={handleScroll}
          >
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-slate-500 text-sm text-center">
                {isLoading ? "Chargement..." : "Aucun résultat"}
              </div>
            ) : (
              <>
                {displayedOptions.map(opt => (
                  <div 
                    key={opt.id}
                    className={`px-3 py-2 text-sm cursor-pointer hover:bg-slate-800 flex items-center justify-between ${value === opt.id ? 'bg-cyan-900/20 text-cyan-400 font-semibold' : 'text-slate-300'}`}
                    onClick={() => {
                      onChange(opt.id);
                      setIsOpen(false);
                    }}
                  >
                    <span className="truncate">{opt.name}</span>
                    {value === opt.id && <Check className="w-4 h-4 flex-shrink-0 ml-2" />}
                  </div>
                ))}
                {hasMore && (
                  <div 
                    className="px-3 py-2 text-[11px] text-slate-400 bg-slate-950/80 text-center border-t border-slate-800/50 cursor-pointer hover:text-cyan-400"
                    onClick={() => setDisplayLimit(prev => prev + pageSize)}
                  >
                    Affichage de {displayedOptions.length} sur {filteredOptions.length} — Défiler ou cliquer pour charger plus
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
