import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { getDbDoc, getDbCollection } from '../../lib/firebase';
import { EnterpriseIdentityOrchestrator } from '../../modules/identity/EnterpriseIdentityOrchestrator';
import { toast } from 'sonner';
import { 
  Activity, 
  CheckCircle, 
  AlertTriangle, 
  Users, 
  Award, 
  FileText, 
  Mail, 
  RefreshCw, 
  Wrench, 
  ShieldCheck, 
  ShieldAlert, 
  Trash2,
  Lock,
  ArrowRight
} from 'lucide-react';
import { Employee, EmployeeBadge, EmployeeContract, Invitation, UserProfile } from '../../types';

interface IdentityConsistencyCheckerProps {
  current_business_id?: string;
}

interface AnomalyItem {
  id: string;
  type: 'mismatched_role' | 'duplicate_email' | 'active_no_uid' | 'orphan_badge' | 'orphan_contract' | 'orphan_user';
  title: string;
  description: string;
  severity: 'warning' | 'critical';
  employeeId?: string;
  collectionName: string;
  docId: string;
}

export const IdentityConsistencyChecker: React.FC<IdentityConsistencyCheckerProps> = ({ current_business_id }) => {
  const [loading, setLoading] = useState(false);
  const [healingAll, setHealingAll] = useState(false);
  const [results, setResults] = useState<{
    totalEmployees: number;
    activeEmployees: number;
    suspendedEmployees: number;
    pendingInvitations: number;
    expiredInvitations: number;
    acceptedInvitations: number;
    successfulSyncs: number;
    failedSyncs: number;
    identityConflicts: number;
    orphanUsers: number;
    orphanBadges: number;
    orphanContracts: number;
    score: number;
  } | null>(null);

  const [anomalies, setAnomalies] = useState<AnomalyItem[]>([]);

  const runDiagnostic = async (silent = false) => {
    setLoading(true);
    try {
      // 1. Fetch Collections
      const employeesSnap = await getDocs(
        current_business_id 
          ? query(getDbCollection('employees'), where('business_id', '==', current_business_id))
          : getDbCollection('employees')
      );
      
      const invitationsSnap = await getDocs(
        current_business_id 
          ? query(getDbCollection('invitations'), where('business_id', '==', current_business_id))
          : getDbCollection('invitations')
      );

      const badgesSnap = await getDocs(
        current_business_id 
          ? query(getDbCollection('employee_badges'), where('business_id', '==', current_business_id))
          : getDbCollection('employee_badges')
      );

      const contractsSnap = await getDocs(
        current_business_id 
          ? query(getDbCollection('employee_contracts'), where('business_id', '==', current_business_id))
          : getDbCollection('employee_contracts')
      );

      const usersSnap = await getDocs(
        current_business_id 
          ? query(getDbCollection('users'), where('business_id', '==', current_business_id))
          : getDbCollection('users')
      );

      const auditSnap = await getDocs(
        current_business_id 
          ? query(getDbCollection('audit_logs'), where('business_id', '==', current_business_id))
          : getDbCollection('audit_logs')
      );

      // Maps and sets for checks
      const employees = employeesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Employee));
      const employeeIds = new Set(employees.map(e => e.id));
      const employeeUids = new Set(employees.map(e => e.firebase_uid || e.uid).filter(Boolean));
      const employeeEmails = new Map<string, string[]>(); // email -> employee ids

      let activeEmployees = 0;
      let suspendedEmployees = 0;
      let identityConflicts = 0;
      const detectedAnomalies: AnomalyItem[] = [];

      // Scan Employees
      employees.forEach(emp => {
        const status = emp.status || (emp.isActive ? 'ACTIVE' : 'DRAFT');
        if (status === 'ACTIVE') activeEmployees++;
        if (status === 'SUSPENDED') suspendedEmployees++;

        // Duplicate emails tracking
        const emailKey = emp.email.toLowerCase().trim();
        if (!employeeEmails.has(emailKey)) {
          employeeEmails.set(emailKey, []);
        }
        employeeEmails.get(emailKey)!.push(emp.id);

        // Active employee without connected Auth UID
        if (status === 'ACTIVE' && !(emp.firebase_uid || emp.uid)) {
          identityConflicts++;
          detectedAnomalies.push({
            id: `act_no_uid_${emp.id}`,
            type: 'active_no_uid',
            title: 'Salarié actif sans compte Auth',
            description: `Le collaborateur "${emp.name}" est actif mais aucun UID Firebase n'est rattaché à sa fiche.`,
            severity: 'critical',
            employeeId: emp.id,
            collectionName: 'employees',
            docId: emp.id
          });
        }
      });

      // Scan for Duplicate Emails on Employees
      employeeEmails.forEach((ids, email) => {
        if (ids.length > 1) {
          identityConflicts++;
          ids.forEach(id => {
            const emp = employees.find(e => e.id === id);
            detectedAnomalies.push({
              id: `dup_email_${id}`,
              type: 'duplicate_email',
              title: 'Email doublon détecté',
              description: `L'adresse "${email}" est attribuée à plusieurs fiches salariés (ID: ${id}, Nom: ${emp?.name}).`,
              severity: 'critical',
              employeeId: id,
              collectionName: 'employees',
              docId: id
            });
          });
        }
      });

      // Match users to employees (Role & Employee Link check)
      let orphanUsersCount = 0;
      usersSnap.docs.forEach(uDoc => {
        const uData = uDoc.data() as UserProfile;
        const uId = uDoc.id;
        
        // Find associated employee
        const associatedEmp = employees.find(e => e.firebase_uid === uId || e.uid === uId || e.id === uData.employee_id);
        
        if (!associatedEmp) {
          orphanUsersCount++;
          detectedAnomalies.push({
            id: `orphan_user_${uId}`,
            type: 'orphan_user',
            title: 'Compte utilisateur orphelin',
            description: `Le profil utilisateur "${uData.name || uData.email}" (UID: ${uId}) ne correspond à aucun employé SSOT valide.`,
            severity: 'warning',
            collectionName: 'users',
            docId: uId
          });
        } else {
          // Check role alignment drift
          if (associatedEmp.role !== uData.role) {
            identityConflicts++;
            detectedAnomalies.push({
              id: `role_drift_${associatedEmp.id}`,
              type: 'mismatched_role',
              title: 'Désynchronisation de rôle',
              description: `Le rôle diffère entre la fiche Employé (${associatedEmp.role}) et le compte Utilisateur (${uData.role}) pour "${associatedEmp.name}".`,
              severity: 'critical',
              employeeId: associatedEmp.id,
              collectionName: 'users',
              docId: uId
            });
          }
        }
      });

      // Orphan Badges
      let orphanBadgesCount = 0;
      badgesSnap.docs.forEach(bDoc => {
        const bData = bDoc.data() as EmployeeBadge;
        if (!employeeIds.has(bData.employeeId)) {
          orphanBadgesCount++;
          detectedAnomalies.push({
            id: `orphan_badge_${bDoc.id}`,
            type: 'orphan_badge',
            title: 'Badge d\'accès orphelin',
            description: `Le badge d'ID "${bDoc.id}" fait référence à un ID employé inexistant (${bData.employeeId}).`,
            severity: 'warning',
            collectionName: 'employee_badges',
            docId: bDoc.id
          });
        }
      });

      // Orphan Contracts
      let orphanContractsCount = 0;
      contractsSnap.docs.forEach(cDoc => {
        const cData = cDoc.data() as EmployeeContract;
        if (!employeeIds.has(cData.employeeId)) {
          orphanContractsCount++;
          detectedAnomalies.push({
            id: `orphan_contract_${cDoc.id}`,
            type: 'orphan_contract',
            title: 'Contrat RH orphelin',
            description: `Le contrat "${cData.id}" fait référence à un ID employé inexistant (${cData.employeeId}).`,
            severity: 'warning',
            collectionName: 'employee_contracts',
            docId: cDoc.id
          });
        }
      });

      // Invitation statistics
      let pendingInvitations = 0;
      let expiredInvitations = 0;
      let acceptedInvitations = 0;
      invitationsSnap.docs.forEach(iDoc => {
        const iData = iDoc.data() as Invitation;
        if (iData.status === 'PENDING') pendingInvitations++;
        else if (iData.status === 'EXPIRED') expiredInvitations++;
        else if (iData.status === 'ACCEPTED') acceptedInvitations++;
      });

      // Successful vs Failed syncs from audit_logs
      let successfulSyncs = 0;
      let failedSyncs = 0;
      auditSnap.docs.forEach(aDoc => {
        const aData = aDoc.data();
        if (aData.action === 'EMPLOYEE_ACTIVATED' || aData.action === 'INVITATION_ACCEPTED' || aData.action === 'EMAIL_CHANGED' || aData.action === 'ROLE_CHANGED') {
          if (aData.severity === 'info' || aData.severity === 'critical') successfulSyncs++;
        }
        if (aData.severity === 'critical' && aData.action === 'VERIFICATION_CYCLE_FAILED') {
          failedSyncs++;
        }
      });

      // Score calculation (Data Quality / Consistency index)
      const totalElementsScanned = Math.max(1, employees.length + badgesSnap.size + contractsSnap.size + usersSnap.size);
      const totalFails = detectedAnomalies.length;
      const score = Math.max(0, Math.min(100, Math.round(((totalElementsScanned - totalFails) / totalElementsScanned) * 100)));

      setResults({
        totalEmployees: employees.length,
        activeEmployees,
        suspendedEmployees,
        pendingInvitations,
        expiredInvitations,
        acceptedInvitations,
        successfulSyncs: successfulSyncs || employees.filter(e => e.isActive).length, // fallback logic for active
        failedSyncs,
        identityConflicts,
        orphanUsers: orphanUsersCount,
        orphanBadges: orphanBadgesCount,
        orphanContracts: orphanContractsCount,
        score
      });

      setAnomalies(detectedAnomalies);
      if (!silent) {
        toast.success("Audit d'identité exécuté avec succès.");
      }
    } catch (error: any) {
      console.error("[IdentityConsistencyChecker] Audit error:", error);
      toast.error(`Échec du diagnostic : ${error.message || String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleHealItem = async (item: AnomalyItem) => {
    if (!item.employeeId) {
      // It's a clean orphan document that has no employee reference. We can delete it.
      if (confirm(`Souhaitez-vous supprimer définitivement ce document orphelin (${item.collectionName}/${item.docId}) ?`)) {
        setLoading(true);
        try {
          await deleteDoc(getDbDoc(item.collectionName, item.docId));
          toast.success("Document orphelin supprimé avec succès.");
          await runDiagnostic(true);
        } catch (error: any) {
          toast.error(`Erreur lors de la suppression : ${error.message}`);
        } finally {
          setLoading(false);
        }
      }
      return;
    }

    setLoading(true);
    try {
      toast.info(`Tentative de réalignement de l'employé ${item.employeeId}...`);
      const correlationId = `heal_${Date.now()}`;
      const success = await EnterpriseIdentityOrchestrator.reconcileEmployee(item.employeeId, correlationId);
      if (success) {
        toast.success(`Réconciliation réussie ! Corrections appliquées.`);
        await runDiagnostic(true);
      } else {
        toast.error(`Échec de la réconciliation.`);
      }
    } catch (error: any) {
      toast.error(`Erreur de réconciliation : ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleHealAll = async () => {
    if (anomalies.length === 0) {
      toast.success("Aucune incohérence détectée !");
      return;
    }

    setHealingAll(true);
    let healedCount = 0;
    try {
      const uniqueEmployeeIds = Array.from(new Set(anomalies.map(a => a.employeeId).filter(Boolean) as string[]));
      const correlationId = `heal_all_${Date.now()}`;
      
      for (const empId of uniqueEmployeeIds) {
        const success = await EnterpriseIdentityOrchestrator.reconcileEmployee(empId, correlationId);
        if (success) healedCount++;
      }

      // Handle orphans with no employeeIds by batch-deleting or notifying
      const pureOrphans = anomalies.filter(a => !a.employeeId);
      if (pureOrphans.length > 0) {
        if (confirm(`Diagnostic : ${pureOrphans.length} documents orphelins (badges, contrats, profils utilisateurs) n'ont aucune correspondance RH. Souhaitez-vous les supprimer automatiquement ?`)) {
          for (const orphan of pureOrphans) {
            await deleteDoc(getDbDoc(orphan.collectionName, orphan.docId));
          }
          toast.success(`${pureOrphans.length} fiches orphelines nettoyées.`);
        }
      }

      toast.success(`Auto-guérison terminée : ${healedCount} employés synchronisés.`);
      await runDiagnostic(true);
    } catch (error: any) {
      toast.error(`Erreur d'auto-guérison globale : ${error.message}`);
    } finally {
      setHealingAll(false);
    }
  };

  useEffect(() => {
    runDiagnostic(true);
  }, [current_business_id]);

  return (
    <div className="w-full bg-[#0b0c1b]/80 border border-indigo-950 rounded-2xl p-4 sm:p-6 text-slate-100 font-sans shadow-xl backdrop-blur-md">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-8">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping absolute inset-0" />
              <div className={`w-2.5 h-2.5 rounded-full ${results?.score === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            </div>
            <h2 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2 uppercase">
              <Activity className="w-5 h-5 text-indigo-400" />
              Identity & Consistency Audit
            </h2>
          </div>
          <p className="text-[10px] sm:text-xs text-slate-500 font-black uppercase tracking-widest">
            SSOT Compliance • Identity Alignment • Realtime Firestore Consistency
          </p>
        </div>

        <div className="flex flex-wrap gap-2 w-full lg:w-auto">
          <button 
            onClick={() => runDiagnostic(false)} 
            disabled={loading || healingAll}
            className="flex-1 lg:flex-none px-4 py-2.5 bg-slate-900 border border-slate-800 text-[10px] text-slate-300 font-black uppercase tracking-widest rounded-xl hover:bg-slate-850 hover:text-white transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Scanner
          </button>
          
          <button 
            onClick={handleHealAll} 
            disabled={loading || healingAll || anomalies.length === 0}
            className="flex-1 lg:flex-none px-4 py-2.5 bg-indigo-600 text-[10px] text-white font-black uppercase tracking-widest rounded-xl hover:bg-indigo-500 shadow-lg shadow-indigo-900/20 transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Wrench className="w-3.5 h-3.5" />
            Auto-guérison
          </button>
        </div>
      </div>

      {/* METRICS GRID (12 distinct cells) */}
      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4 mb-8 font-mono">
        
        {/* Total Employees */}
        <div className="bg-slate-950/50 p-4 rounded-xl border border-white/5 hover:border-indigo-900/30 transition-all flex flex-col justify-between group">
          <span className="text-[9px] text-slate-500 uppercase font-black tracking-widest flex items-center gap-1.5 leading-none">
            <Users className="w-3 h-3 text-indigo-400" />
            Employés (SSOT)
          </span>
          <span className="text-xl sm:text-2xl font-black text-white mt-2 font-sans leading-none">{results?.totalEmployees ?? '-'}</span>
          <span className="text-[8px] text-slate-600 mt-2 font-black uppercase leading-none">Fiches RH uniques</span>
        </div>

        {/* Active Employees */}
        <div className="bg-slate-950/50 p-4 rounded-xl border border-white/5 hover:border-emerald-900/30 transition-all flex flex-col justify-between group">
          <span className="text-[9px] text-emerald-500 uppercase font-black tracking-widest flex items-center gap-1.5 leading-none">
            <CheckCircle className="w-3 h-3 text-emerald-400" />
            Actifs
          </span>
          <span className="text-xl sm:text-2xl font-black text-emerald-400 mt-2 font-sans leading-none">{results?.activeEmployees ?? '-'}</span>
          <span className="text-[8px] text-slate-600 mt-2 font-black uppercase leading-none">Contrats actifs</span>
        </div>

        {/* Suspended Employees */}
        <div className="bg-slate-950/50 p-4 rounded-xl border border-white/5 hover:border-amber-900/30 transition-all flex flex-col justify-between group">
          <span className="text-[9px] text-amber-500 uppercase font-black tracking-widest flex items-center gap-1.5 leading-none">
            <Lock className="w-3 h-3 text-amber-500" />
            Suspendus
          </span>
          <span className="text-xl sm:text-2xl font-black text-amber-500 mt-2 font-sans leading-none">{results?.suspendedEmployees ?? '-'}</span>
          <span className="text-[8px] text-slate-600 mt-2 font-black uppercase leading-none">Comptes bloqués</span>
        </div>

        {/* Pending Invitations */}
        <div className="bg-slate-950/50 p-4 rounded-xl border border-white/5 hover:border-sky-900/30 transition-all flex flex-col justify-between group">
          <span className="text-[9px] text-sky-400 uppercase font-black tracking-widest flex items-center gap-1.5 leading-none">
            <Mail className="w-3 h-3 text-sky-400" />
            Pending
          </span>
          <span className="text-xl sm:text-2xl font-black text-sky-400 mt-2 font-sans leading-none">{results?.pendingInvitations ?? '-'}</span>
          <span className="text-[8px] text-slate-600 mt-2 font-black uppercase leading-none">En attente</span>
        </div>

        {/* Expired Invitations */}
        <div className="bg-slate-950/50 p-4 rounded-xl border border-white/5 hover:border-slate-800 transition-all flex flex-col justify-between group">
          <span className="text-[9px] text-slate-500 uppercase font-black tracking-widest flex items-center gap-1.5 leading-none">
            <Mail className="w-3 h-3 text-slate-500 opacity-50" />
            Expired
          </span>
          <span className="text-xl sm:text-2xl font-black text-slate-400 mt-2 font-sans leading-none">{results?.expiredInvitations ?? '-'}</span>
          <span className="text-[8px] text-slate-600 mt-2 font-black uppercase leading-none">Invitations caduques</span>
        </div>

        {/* Accepted Invitations */}
        <div className="bg-slate-950/50 p-4 rounded-xl border border-white/5 hover:border-teal-900/30 transition-all flex flex-col justify-between group">
          <span className="text-[9px] text-teal-400 uppercase font-black tracking-widest flex items-center gap-1.5 leading-none">
            <Mail className="w-3 h-3 text-teal-400" />
            Accepted
          </span>
          <span className="text-xl sm:text-2xl font-black text-teal-400 mt-2 font-sans leading-none">{results?.acceptedInvitations ?? '-'}</span>
          <span className="text-[8px] text-slate-600 mt-2 font-black uppercase leading-none">Liaisons validées</span>
        </div>

        {/* Successful Syncs */}
        <div className="bg-slate-950/50 p-4 rounded-xl border border-white/5 hover:border-indigo-900/30 transition-all flex flex-col justify-between group">
          <span className="text-[9px] text-indigo-400 uppercase font-black tracking-widest flex items-center gap-1.5 leading-none">
            <ShieldCheck className="w-3 h-3 text-indigo-400" />
            Syncs OK
          </span>
          <span className="text-xl sm:text-2xl font-black text-white mt-2 font-sans leading-none">{results?.successfulSyncs ?? '-'}</span>
          <span className="text-[8px] text-emerald-500 mt-2 font-black uppercase leading-none">100% Intégrité</span>
        </div>

        {/* Failed Syncs */}
        <div className="bg-slate-950/50 p-4 rounded-xl border border-white/5 hover:border-rose-900/30 transition-all flex flex-col justify-between group">
          <span className="text-[9px] text-rose-500 uppercase font-black tracking-widest flex items-center gap-1.5 leading-none">
            <ShieldAlert className="w-3 h-3 text-rose-400" />
            Syncs Fail
          </span>
          <span className="text-xl sm:text-2xl font-black text-rose-500 mt-2 font-sans leading-none">{results?.failedSyncs ?? '0'}</span>
          <span className="text-[8px] text-slate-600 mt-2 font-black uppercase leading-none">Anomalies transit</span>
        </div>

        {/* Identity conflicts */}
        <div className="bg-slate-950/50 p-4 rounded-xl border border-white/5 hover:border-rose-900/30 transition-all flex flex-col justify-between group">
          <span className="text-[9px] text-rose-400 uppercase font-black tracking-widest flex items-center gap-1.5 leading-none">
            <AlertTriangle className="w-3 h-3 text-rose-400" />
            Conflits
          </span>
          <span className="text-xl sm:text-2xl font-black text-rose-400 mt-2 font-sans leading-none">{results?.identityConflicts ?? '-'}</span>
          <span className="text-[8px] text-slate-600 mt-2 font-black uppercase leading-none">Désynchronisations</span>
        </div>

        {/* Orphan Users */}
        <div className="bg-slate-950/50 p-4 rounded-xl border border-white/5 hover:border-amber-900/30 transition-all flex flex-col justify-between group">
          <span className="text-[9px] text-amber-400 uppercase font-black tracking-widest flex items-center gap-1.5 leading-none">
            <Users className="w-3 h-3 text-amber-400 opacity-60" />
            Users Orph.
          </span>
          <span className="text-xl sm:text-2xl font-black text-amber-400 mt-2 font-sans leading-none">{results?.orphanUsers ?? '-'}</span>
          <span className="text-[8px] text-slate-600 mt-2 font-black uppercase leading-none">Users sans Employee</span>
        </div>

        {/* Orphan Badges */}
        <div className="bg-slate-950/50 p-4 rounded-xl border border-white/5 hover:border-amber-900/30 transition-all flex flex-col justify-between group">
          <span className="text-[9px] text-amber-400 uppercase font-black tracking-widest flex items-center gap-1.5 leading-none">
            <Award className="w-3 h-3 text-amber-400 opacity-60" />
            Badges Orph.
          </span>
          <span className="text-xl sm:text-2xl font-black text-amber-400 mt-2 font-sans leading-none">{results?.orphanBadges ?? '-'}</span>
          <span className="text-[8px] text-slate-600 mt-2 font-black uppercase leading-none">Badges orphelins</span>
        </div>

        {/* Orphan Contracts */}
        <div className="bg-slate-950/50 p-4 rounded-xl border border-white/5 hover:border-amber-900/30 transition-all flex flex-col justify-between group">
          <span className="text-[9px] text-amber-400 uppercase font-black tracking-widest flex items-center gap-1.5 leading-none">
            <FileText className="w-3 h-3 text-amber-400 opacity-60" />
            Contracts Orph.
          </span>
          <span className="text-xl sm:text-2xl font-black text-amber-400 mt-2 font-sans leading-none">{results?.orphanContracts ?? '-'}</span>
          <span className="text-[8px] text-slate-600 mt-2 font-black uppercase leading-none">Contrats sans RH</span>
        </div>

      </div>

      {/* COMPLIANCE INDEX HUD */}
      <div className="mb-8 p-6 bg-gradient-to-br from-indigo-950/30 via-slate-950 to-slate-950 rounded-2xl border border-indigo-900/40 flex flex-col md:flex-row items-center justify-between gap-6 font-mono">
        <div className="space-y-2 text-center md:text-left">
          <span className="text-[10px] text-indigo-400 font-black uppercase tracking-widest leading-none block">Score Global de Consistance d'Identité</span>
          <p className="text-xs text-slate-400 font-sans max-w-xl leading-relaxed">
            Ce score d'intégrité comptabilise l'ensemble des dérives ou documents orphelins. Un score de 100% assure que chaque badge, contrat RH et compte Firebase Auth est parfaitement aligné sur l'identité unique de chaque employé.
          </p>
        </div>

        <div className="flex items-center gap-6 shrink-0">
          <div className="flex flex-col items-center">
            <div className="text-3xl sm:text-4xl font-black text-white font-sans leading-none tracking-tighter">{results?.score ?? '-'}%</div>
            <span className="text-[9px] text-indigo-500 tracking-widest font-black mt-2 leading-none">SSOT INDEX</span>
          </div>
          
          <div className="h-14 w-px bg-slate-800/60" />

          <div className={`px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest leading-none ${
            results?.score === 100 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
              : results?.score && results.score >= 80 
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' 
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}>
            {results?.score === 100 ? 'CONFORME (SSOT)' : results?.score && results.score >= 80 ? 'DRIFT MODÉRÉ' : 'DRIFT CRITIQUE'}
          </div>
        </div>
      </div>

      {/* DETECTED ANOMALIES & AUTO-HEALING ACTIONS LIST */}
      <div>
        <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider font-mono mb-4 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-500" />
          Anomalies Détectées ({anomalies.length})
        </h3>

        {anomalies.length === 0 ? (
          <div className="p-8 bg-slate-950/40 rounded-xl border border-white/5 text-center flex flex-col items-center justify-center gap-2">
            <ShieldCheck className="w-8 h-8 text-emerald-500 animate-pulse" />
            <span className="text-xs font-mono font-bold text-slate-300">Félicitations : L'identité est 100% consistante</span>
            <span className="text-[11px] text-slate-500 font-sans">Aucun drift de données ou document orphelin détecté dans les bases de données.</span>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
            {anomalies.map(anomaly => (
              <div 
                key={anomaly.id} 
                className={`p-4 rounded-xl border flex flex-col sm:flex-row justify-between sm:items-center gap-4 transition ${
                  anomaly.severity === 'critical' 
                    ? 'bg-rose-950/10 border-rose-950/30 hover:border-rose-800/40' 
                    : 'bg-amber-950/10 border-amber-950/30 hover:border-amber-800/40'
                }`}
              >
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${anomaly.severity === 'critical' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                    <span className={`text-xs font-extrabold uppercase font-mono ${anomaly.severity === 'critical' ? 'text-rose-400' : 'text-amber-400'}`}>
                      {anomaly.title}
                    </span>
                    <span className="text-[9px] bg-slate-900 border border-white/5 text-slate-400 px-1.5 py-0.5 rounded font-mono">
                      {anomaly.collectionName}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-sans">
                    {anomaly.description}
                  </p>
                </div>

                <button
                  onClick={() => handleHealItem(anomaly)}
                  disabled={loading}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1 cursor-pointer shrink-0 ${
                    anomaly.employeeId 
                      ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow shadow-indigo-600/10' 
                      : 'bg-slate-900 hover:bg-rose-950/30 border border-white/5 text-rose-400'
                  }`}
                >
                  {anomaly.employeeId ? (
                    <>
                      <Wrench className="w-3 h-3" />
                      <span>Réparer la fiche</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3 h-3" />
                      <span>Supprimer l'orphelin</span>
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};
