import React, { useState, useEffect } from 'react';
import { Fingerprint, Download, FileSpreadsheet, AlertTriangle, RefreshCw, Volume2, VolumeX, Camera, Battery, BatteryCharging, BatteryMedium, BatteryWarning, Upload } from 'lucide-react';
import { Role } from '../../types';

export interface RecentScan {
  id: string;
  name: string;
  time: string;
  status: 'IN' | 'OUT' | 'ERROR';
}

interface AttendanceHeaderProps {
  onlineCount: number;
  complianceScore: number;
  onScanClick: () => void;
  onManualOverride: () => void;
  onRecalculate: () => void;
  onExportExcel: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  recentScans: RecentScan[];
  currentRole?: Role;
  onMassImportClick?: () => void;
}

export default function AttendanceHeader({ 
  onlineCount, 
  complianceScore, 
  onScanClick, 
  onManualOverride, 
  onRecalculate, 
  onExportExcel, 
  isMuted, 
  onToggleMute, 
  recentScans,
  currentRole,
  onMassImportClick
}: AttendanceHeaderProps) {
  const [battery, setBattery] = useState<{ level: number, charging: boolean } | null>(null);
  const [cameraPermission, setCameraPermission] = useState<PermissionState | null>(null);

  useEffect(() => {
    let batObj: any = null;
    const updateBat = () => {
      if (batObj) setBattery({ level: Math.round(batObj.level * 100), charging: batObj.charging });
    };

    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((b: any) => {
        batObj = b;
        updateBat();
        b.addEventListener('levelchange', updateBat);
        b.addEventListener('chargingchange', updateBat);
      }).catch(() => {});
    }

    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'camera' as PermissionName }).then(res => {
        setCameraPermission(res.state);
        res.addEventListener('change', () => setCameraPermission(res.state));
      }).catch(() => {});
    }
  }, []);

  const getBatteryIcon = () => {
    if (!battery) return <Battery className="w-4 h-4 text-slate-500" />;
    if (battery.charging) return <BatteryCharging className="w-4 h-4 text-emerald-400" />;
    if (battery.level > 50) return <Battery className="w-4 h-4 text-emerald-400" />;
    if (battery.level > 20) return <BatteryMedium className="w-4 h-4 text-amber-400" />;
    return <AlertTriangle className="w-4 h-4 text-rose-500 animate-pulse" />;
  };

  return (
    <div className="flex flex-col lg:flex-row justify-between items-start gap-6 bg-slate-900/40 p-4 sm:p-6 border border-slate-800/60 rounded-xl backdrop-blur-md">
      <div className="flex-1 w-full space-y-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Fingerprint className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-400" />
            Pointage de Présences & Heures
          </h2>
          <p className="text-sm text-slate-400 mt-1">Terminal de contrôle et de monitoring temps-réel</p>
        </div>
        
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-950/50 px-3 py-1.5 rounded-lg border border-slate-800 shadow-sm transition-all hover:border-slate-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
            <span className="font-semibold">{onlineCount}</span> <span className="text-slate-500">actifs</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-950/50 px-3 py-1.5 rounded-lg border border-slate-800 shadow-sm transition-all hover:border-slate-700">
            <span className="text-slate-500">Conformité:</span>
            <span className={`font-mono font-bold ${complianceScore > 90 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {complianceScore}%
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-950/50 px-3 py-1.5 rounded-lg border border-slate-800 shadow-sm transition-all hover:border-slate-700" title="État de la Batterie (Tablette/Mobile)">
            {getBatteryIcon()}
            <span className="font-mono font-medium">{battery ? `${battery.level}%` : '---'}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-950/50 px-3 py-1.5 rounded-lg border border-slate-800 shadow-sm transition-all hover:border-slate-700" title="Permission Caméra pour QR Code">
            <Camera className={`w-3.5 h-3.5 ${cameraPermission === 'granted' ? 'text-emerald-400' : cameraPermission === 'denied' ? 'text-rose-400' : 'text-slate-500'}`} />
            <span className="capitalize font-medium">{cameraPermission || 'inconnue'}</span>
          </div>
        </div>

        {/* RECENT ACTIVITY LIST */}
        {recentScans.length > 0 && (
          <div className="mt-4 bg-slate-950/50 rounded-lg border border-slate-800 p-2">
            <h4 className="text-[10px] uppercase font-bold text-slate-500 mb-2 px-1">Activité Récente (Pointages)</h4>
            <div className="flex flex-col gap-1.5">
              {recentScans.map(scan => (
                <div key={scan.id} className="flex flex-col sm:flex-row sm:items-center justify-between text-xs p-1.5 rounded hover:bg-slate-900 transition border-l-2" style={{ borderLeftColor: scan.status === 'ERROR' ? '#ef4444' : scan.status === 'IN' ? '#34d399' : '#38bdf8' }}>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-200">{scan.name}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${scan.status === 'ERROR' ? 'bg-rose-950 text-rose-400' : scan.status === 'IN' ? 'bg-emerald-950 text-emerald-400' : 'bg-sky-950 text-sky-400'}`}>
                      {scan.status}
                    </span>
                  </div>
                  <span className="font-mono text-slate-500 text-[10px] mt-1 sm:mt-0">{scan.time}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto lg:justify-end">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button 
            onClick={onToggleMute}
            title={isMuted ? "Activer les sons (Silent Mode On)" : "Désactiver les sons (Silent Mode Off)"}
            className={`px-4 py-2 rounded-lg flex items-center justify-center transition border shadow-sm ${isMuted ? 'bg-rose-950/30 border-rose-900/50 text-rose-400' : 'bg-emerald-950/30 border-emerald-900/50 text-emerald-400'}`}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button 
            onClick={onScanClick}
            className="flex-1 sm:flex-none bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-[10px] uppercase tracking-wider px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 transition shadow-lg shadow-cyan-900/20 active:scale-95"
          >
            <Fingerprint className="w-4 h-4" /> Scanner QR
          </button>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto">
          <button 
            onClick={onManualOverride}
            className="bg-amber-600/20 text-amber-500 hover:bg-amber-600/30 border border-amber-500/30 font-bold text-[10px] uppercase tracking-wider px-3 py-2.5 rounded-lg flex items-center justify-center gap-2 transition"
          >
            <AlertTriangle className="w-3.5 h-3.5" /> <span className="hidden xs:inline">Dérogation</span><span className="xs:hidden">Override</span>
          </button>
          <button 
            onClick={onRecalculate}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[10px] uppercase tracking-wider px-3 py-2.5 rounded-lg flex items-center justify-center gap-2 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" /> <span className="hidden xs:inline">Recalculer</span><span className="xs:hidden">Calc</span>
          </button>
          <button 
            onClick={onExportExcel}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[10px] uppercase tracking-wider px-3 py-2.5 rounded-lg flex items-center justify-center gap-2 transition"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> <span className="hidden xs:inline">Export Excel</span><span className="xs:hidden">Export</span>
          </button>
          {(currentRole === "OWNER" || currentRole === "MANAGER") && onMassImportClick && (
            <button 
              id="btn_import"
              onClick={onMassImportClick}
              className="bg-indigo-600/25 text-indigo-300 hover:bg-indigo-600/40 border border-indigo-500/30 font-bold text-[10px] uppercase tracking-wider px-3 py-2.5 rounded-lg flex items-center justify-center gap-2 transition"
            >
              <Upload className="w-3.5 h-3.5" /> <span className="hidden xs:inline">Importation</span><span className="xs:hidden">Import</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
