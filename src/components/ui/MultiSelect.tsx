import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, X, Loader2 } from 'lucide-react';

export interface Option {
  id: string;
  name: string;
}

export interface MultiSelectProps {
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  error?: boolean;
  pageSize?: number;
  onSearch?: (term: string) => Promise<Option[]>;
}

export default function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Sélectionner...",
  error = false,
  pageSize = 20,
  onSearch
}: MultiSelectProps) {
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
      setDisplayLimit(pageSize);
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
        console.error("MultiSelect Async Search Error:", err);
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

  const selectedOptions = useMemo(() => {
    return activeOptionsList.filter(opt => value.includes(opt.id))
      .concat(options.filter(opt => value.includes(opt.id) && !activeOptionsList.some(o => o.id === opt.id)));
  }, [activeOptionsList, options, value]);
  
  const filteredOptions = useMemo(() => {
    if (asyncOptions !== null) return asyncOptions;
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

  const toggleOption = (id: string) => {
    if (id === 'ALL') {
      onChange(['ALL']);
      return;
    }

    let newValue = [...value];
    newValue = newValue.filter(v => v !== 'ALL');

    if (newValue.includes(id)) {
      newValue = newValue.filter(v => v !== id);
    } else {
      newValue.push(id);
    }

    if (newValue.length === 0) {
      newValue = ['ALL'];
    }

    onChange(newValue);
  };

  const removeOption = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    let newValue = value.filter(v => v !== id);
    if (newValue.length === 0) {
      newValue = ['ALL'];
    }
    onChange(newValue);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div 
        className={`flex items-center justify-between w-full min-h-[38px] bg-slate-950 border ${error ? 'border-rose-500' : 'border-slate-800'} rounded px-2 py-1 text-slate-200 cursor-pointer focus-within:border-cyan-500`}
        onClick={() => {
          setIsOpen(!isOpen);
          setSearchTerm("");
          setDisplayLimit(pageSize);
        }}
      >
        <div className="flex flex-wrap gap-1 flex-1 overflow-hidden">
          {selectedOptions.length === 0 || value.includes('ALL') ? (
            <span className="text-slate-500 text-xs px-1 py-1 truncate">{placeholder}</span>
          ) : (
            selectedOptions.map(opt => (
              <span key={opt.id} className="inline-flex items-center gap-1 bg-cyan-950 text-cyan-400 text-[10px] px-2 py-1 rounded">
                {opt.name}
                <X 
                  className="w-3 h-3 hover:text-cyan-300 cursor-pointer" 
                  onClick={(e) => removeOption(e, opt.id)}
                />
              </span>
            ))
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform flex-shrink-0 ml-1 ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute z-30 w-64 mt-1 bg-slate-900 border border-slate-800 rounded-md shadow-2xl shadow-black/50 overflow-hidden -right-2 sm:right-auto sm:left-0">
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
                {displayedOptions.map(opt => {
                  const isSelected = value.includes(opt.id);
                  return (
                    <div 
                      key={opt.id}
                      className={`px-3 py-2 text-sm cursor-pointer hover:bg-slate-800 flex items-center justify-between ${isSelected ? 'bg-cyan-900/10 text-cyan-400 font-semibold' : 'text-slate-300'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleOption(opt.id);
                      }}
                    >
                      <span className="truncate pr-2">{opt.name}</span>
                      <div className={`w-4 h-4 border rounded flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-cyan-500 border-cyan-500 text-white' : 'border-slate-600'}`}>
                        {isSelected && <Check className="w-3 h-3" />}
                      </div>
                    </div>
                  );
                })}
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
