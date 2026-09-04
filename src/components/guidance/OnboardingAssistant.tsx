import React, { useState } from "react";
import {
  Sparkles,
  HelpCircle,
  Building,
  DollarSign,
  Users,
  Clock,
  QrCode,
  FileText,
  BadgeAlert,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { Role } from "../../types";

interface OnboardingAssistantProps {
  currentRole: Role;
  language: "fr" | "ht" | "en";
}

export default function OnboardingAssistant({ currentRole, language }: OnboardingAssistantProps) {
  const [collapsed, setCollapsed] = useState(true);
  const [isHovered, setIsHovered] = useState(false);

  // Content matrices localized for various roles and languages:
  const dict = {
    fr: {
      assistantTitle: "Assistant Onboarding Intuitif",
      roleLabel: "En tant que",
      introSuffix: ", voici les étapes d'onboarding finops indispensables pour amorcer votre gestion intégrée :",
      tips: {
        OWNER: [
          {
            title: "Structurer vos Succursales",
            desc: "Définissez vos établissements pour activer une traçabilité géographique fiable des fiches de temps.",
            icon: Building,
          },
          {
            title: "Configurer la Politique Salariale",
            desc: "Vérifiez que vos cotisations CNSS (6%), CNS (2%) et OFATMA (3%) sont d'équerre avec vos lois locales.",
            icon: DollarSign,
          },
          {
            title: "Inviter votre Équipe",
            desc: "Importez vos salariés pour leur générer instantanément un badge QR unique de pointage sécurisé.",
            icon: Users,
          },
        ],
        MANAGER: [
          {
            title: "Gérer le Planning Annuel",
            desc: "Planifiez les plages de présence de vos équipes par succursale et surveillez l'absentéisme.",
            icon: Clock,
          },
          {
            title: "Superviser les Bulletins",
            desc: "Verrouillez les cycles de paie quinzomadaire et arbitrez les avances sur salaires demandées.",
            icon: FileText,
          },
        ],
        SUPERVISOR: [
          {
            title: "Arbitrer les Pointages en Attente",
            desc: "Approuvez ou corrigez manuellement les anomalies de check-in et check-out du personnel.",
            icon: BadgeAlert,
          },
          {
            title: "Valider les Déclarations",
            desc: "Assurez-vous que l'activité sur site concorde fidèlement avec les feuilles de présence d'équipe.",
            icon: Clock,
          },
        ],
        EMPLOYEE: [
          {
            title: "Flasher votre Badge QR",
            desc: "Présentez votre badge QR intelligent en arrivant sur site pour pointer d'un simple clic.",
            icon: QrCode,
          },
          {
            title: "Consulter votre Solde",
            desc: "Suivez votre salaire brut estimé, commissions perçues et posez vos demandes de congés prévisionnels.",
            icon: DollarSign,
          },
        ],
        SUPER_ADMIN: [
          {
            title: "Superviser les Tenants",
            desc: "Vérifiez les metrics SaaS, provisionnez de nouveaux clients ou basculez les licences.",
            icon: Building,
          }
        ],
      }
    },
    ht: {
      assistantTitle: "Asistan Entegrasyon Entwisyon",
      roleLabel: "Kòm",
      introSuffix: ", men etap entegrasyon finops ki enpòtan anpil pou w kòmanse jere biznis ou :",
      tips: {
        OWNER: [
          {
            title: "Òganize Sikisal yo",
            desc: "Defini etablisman ou yo pou pèmèt yon swivi jeyografik fyab nan fouchèt tan yo.",
            icon: Building,
          },
          {
            title: "Konfigure Politik Salè",
            desc: "Verifye ke kotizasyon CNSS (6%), CNS (2%), ak OFATMA (3%) ou yo an règle ak lwa lokal yo.",
            icon: DollarSign,
          },
          {
            title: "Envite Ekip Ou",
            desc: "Enpòte anplwaye ou yo pou kreye yon badj QR inik pou yo ka anrejistre tan yo an sekirite.",
            icon: Users,
          },
        ],
        MANAGER: [
          {
            title: "Jere Planifikasyon Anyèl",
            desc: "Planifye lè travay ekip ou yo pa sikisal epi kontwole absans yo.",
            icon: Clock,
          },
          {
            title: "Siveye Fich Peman yo",
            desc: "Fèmen peryòd peman kenzèn yo epi evalye avans sou salè ki mande yo.",
            icon: FileText,
          },
        ],
        SUPERVISOR: [
          {
            title: "Regle Pwen ki an Retra",
            desc: "Apwouve oswa korije manyèlman erè nan lè antre ak soti anplwaye yo.",
            icon: BadgeAlert,
          },
          {
            title: "Validate Deklarasyon yo",
            desc: "Asire w ke aktivite sou plas la koresponn nèt ak fèy prezans ekip yo.",
            icon: Clock,
          },
        ],
        EMPLOYEE: [
          {
            title: "Skanne Badj QR Ou",
            desc: "Prezante badj QR entèlijan ou lè w rive pou w ka anrejistre prezans w ak yon senp klik.",
            icon: QrCode,
          },
          {
            title: "Tcheke Balans Ou",
            desc: "Swiv estimasyon salè brit ou, komisyon ou touche ak fè demann konje ou yo.",
            icon: DollarSign,
          },
        ],
        SUPER_ADMIN: [
          {
            title: "Siveye Tenant yo",
            desc: "Verifye metrik SaaS yo, prepare nouvo kliyan oswa chanje lisans yo.",
            icon: Building,
          }
        ],
      }
    },
    en: {
      assistantTitle: "Intuitive Onboarding Assistant",
      roleLabel: "As a",
      introSuffix: ", here are the essential finops onboarding steps to jumpstart your integrated management:",
      tips: {
        OWNER: [
          {
            title: "Structure Your Branches",
            desc: "Define your branches to enable reliable geographical tracking of time sheets.",
            icon: Building,
          },
          {
            title: "Configure Payroll Policy",
            desc: "Verify that your CNSS (6%), CNS (2%), and OFATMA (3%) contributions align with local laws.",
            icon: DollarSign,
          },
          {
            title: "Invite Your Team",
            desc: "Import your employees to instantly generate a unique secure check-in QR badge.",
            icon: Users,
          },
        ],
        MANAGER: [
          {
            title: "Manage Annual Planning",
            desc: "Plan work schedules for your teams by branch and monitor absenteeism.",
            icon: Clock,
          },
          {
            title: "Supervise Payslips",
            desc: "Lock bi-weekly payroll cycles and adjudicate requested salary advances.",
            icon: FileText,
          },
        ],
        SUPERVISOR: [
          {
            title: "Resolve Pending Clocks",
            desc: "Manually approve or correct check-in and check-out anomalies for personnel.",
            icon: BadgeAlert,
          },
          {
            title: "Validate Declarations",
            desc: "Ensure on-site activity aligns faithfully with team attendance sheets.",
            icon: Clock,
          },
        ],
        EMPLOYEE: [
          {
            title: "Scan Your QR Badge",
            desc: "Present your smart QR badge when arriving on-site to clock in with a single click.",
            icon: QrCode,
          },
          {
            title: "Consult Your Balance",
            desc: "Track your estimated gross salary, commissions earned, and submit leave requests.",
            icon: DollarSign,
          },
        ],
        SUPER_ADMIN: [
          {
            title: "Supervise Tenants",
            desc: "Check SaaS metrics, provision new clients, or toggle licenses.",
            icon: Building,
          }
        ],
      }
    }
  };

  const currentLang = dict[language] || dict.en;
  const currentTips = currentLang.tips[currentRole] || currentLang.tips.EMPLOYEE;

  const isExpanded = !collapsed || isHovered;

  return (
    <div 
      className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 font-sans text-xs flex flex-col gap-3 relative overflow-hidden transition-all duration-300 hover:border-cyan-500/40 hover:bg-slate-900/80 group" 
      id="workspace-onboarding-assistant"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-cyan-500/10 transition-all"></div>
      
      <div className="flex justify-between items-center cursor-pointer select-none" onClick={() => setCollapsed(!collapsed)}>
        <div className="flex items-center gap-2 text-cyan-400 font-bold font-mono uppercase tracking-wider">
          <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
          <span>{currentLang.assistantTitle} ({currentRole})</span>
          {!isExpanded && (
            <span className="text-[10px] font-normal text-slate-500 lowercase normal-case opacity-70 group-hover:opacity-100 transition-opacity">
              (Survolez pour afficher)
            </span>
          )}
        </div>
        <button type="button" className="text-slate-500 hover:text-slate-350">
          {!isExpanded ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {isExpanded && (
        <div className="flex flex-col gap-3 mt-1.5 animate-fadeIn">
          <p className="text-[11px] text-slate-400 leading-relaxed font-mono">
            {currentLang.roleLabel} <strong className="text-slate-200">"{currentRole}"</strong>{currentLang.introSuffix}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {currentTips.map((tip, idx) => {
              const Icon = tip.icon;
              return (
                <div key={idx} className="p-3 rounded-lg bg-slate-950 border border-slate-900 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded bg-cyan-950/40 border border-cyan-850/40 text-cyan-400">
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-extrabold text-slate-200 font-mono text-[10px] uppercase truncate">
                      {tip.title}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-snug">
                    {tip.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
