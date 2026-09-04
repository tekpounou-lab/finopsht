import React from "react";
import { Building, GitMerge, Users, Layout, MapPin, ChevronDown, Building2, Layers, UserCircle2 } from "lucide-react";
import { useBusinessContext } from "../../../../contexts/BusinessContext";
import { motion } from "motion/react";

export default function OrganizationStructureSection() {
  const { currentBusiness, branches, departments } = useBusinessContext();

  return (
    <div className="space-y-12 pb-20" id="org-structure-root">
      <div>
        <h3 className="text-lg font-bold text-slate-100 uppercase tracking-tight">Visualiseur de Structure</h3>
        <p className="text-xs text-slate-500 font-medium mt-1">Représentation hiérarchique de l'écosystème Enterprise.</p>
      </div>

      <div className="flex flex-col items-center">
        {/* Level 1: Business */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative group"
        >
          <div className="px-8 py-5 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-3xl shadow-xl shadow-cyan-500/20 border border-white/20 flex flex-col items-center gap-2">
            <Building2 className="w-8 h-8 text-white shadow-lg" />
            <h4 className="text-sm font-black text-white uppercase tracking-tighter">{currentBusiness?.name || "Business"}</h4>
            <div className="px-2 py-0.5 bg-white/20 rounded-full text-[8px] font-black text-white uppercase">Siège Social</div>
          </div>
          
          {/* Vertical Connector */}
          <div className="h-16 w-0.5 bg-gradient-to-b from-cyan-500/50 to-slate-800 mx-auto"></div>
        </motion.div>

        {/* Level 2: Branches */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 relative">
          {/* Horizontal Connector Line (simplified for visual) */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[2px] bg-slate-800 -z-10 hidden lg:block"></div>

          {branches?.map((branch, bIdx) => (
            <motion.div 
              key={branch.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: bIdx * 0.1 }}
              className="flex flex-col items-center"
            >
              <div className="p-1 bg-gradient-to-tr from-slate-800 to-slate-900 rounded-2xl border border-slate-700 shadow-xl w-64">
                <div className="bg-slate-950 rounded-xl p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-100 uppercase truncate w-32">{branch.name}</h5>
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Succursale</p>
                  </div>
                </div>
              </div>

              {/* Vertical Connector to Departments */}
              <div className="h-12 w-[1px] bg-slate-800"></div>

              {/* Level 3: Departments */}
              <div className="space-y-4">
                {departments?.filter(d => d.branch_id === branch.id).map((dept, dIdx) => (
                  <motion.div 
                    key={dept.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: (bIdx * 0.1) + (dIdx * 0.05) }}
                    className="flex flex-col items-center"
                  >
                    <div className="px-4 py-3 bg-slate-900/40 border border-slate-800 hover:border-cyan-500/30 rounded-xl w-56 group transition-all cursor-default">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Layers className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 transition-colors" />
                          <span className="text-[11px] font-bold text-slate-300 group-hover:text-slate-100 uppercase tracking-tight">{dept.name}</span>
                        </div>
                        <ChevronDown className="w-3 h-3 text-slate-700 group-hover:text-cyan-500 transition-all" />
                      </div>
                      
                      {/* Level 4: Placeholder Teams/Staff Indicator */}
                      <div className="mt-3 pt-3 border-t border-slate-800/50 flex items-center justify-between">
                         <div className="flex -space-x-1.5">
                            {[1, 2, 3].map(i => (
                              <div key={i} className="w-5 h-5 rounded-full bg-slate-800 border border-slate-950 flex items-center justify-center overflow-hidden">
                                <UserCircle2 className="w-4 h-4 text-slate-600" />
                              </div>
                            ))}
                         </div>
                         <span className="text-[8px] text-slate-600 font-black uppercase">Staff Ready</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="max-w-md mx-auto bg-slate-900/50 border border-slate-800 rounded-2xl p-6 text-center">
         <GitMerge className="w-8 h-8 text-cyan-500/40 mx-auto mb-4" />
         <h4 className="text-xs font-bold text-slate-300 uppercase mb-2">Génération de Matrice Hiérarchique</h4>
         <p className="text-[10px] text-slate-500 leading-relaxed">
           Cette vue représente l'architecture logique de votre organisation. Les autorisations de sécurité héritent de cette structure pour garantir l'étanchéité des données entre les succursales.
         </p>
      </div>
    </div>
  );
}
