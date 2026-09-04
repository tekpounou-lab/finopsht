import React, { useState } from "react";
import { 
  PageContainer, 
  PageHeader, 
  PageSection, 
  PageToolbar, 
  ContentContainer, 
  Grid, 
  Stack 
} from "./ui/EnterpriseLayout";
import { 
  MetricCard, 
  StatCard, 
  InsightCard, 
  SummaryCard, 
  DashboardCard, 
  ExpandableCard, 
  ActionCard 
} from "./ui/EnterpriseCards";
import { 
  EnterpriseTable, 
  TableSearch, 
  TablePagination, 
  DataTableToolbar, 
  TableExportMenu, 
  TableDensitySelector 
} from "./ui/EnterpriseTables";
import { 
  FieldLabel, 
  FieldHint, 
  FieldError, 
  FormGroup, 
  FormSection, 
  CurrencyInput, 
  PercentageInput, 
  PhoneInput, 
  AddressInput, 
  EmployeeSelector 
} from "./ui/EnterpriseForms";
import { DateRangePicker } from "./ui/DateRangePicker";
import { 
  SearchInput, 
  TagInput, 
  QuickFilter, 
  FilterBar, 
  FileUpload, 
  PINInput 
} from "./ui/EnterpriseInputs";
import { 
  Breadcrumbs, 
  Tabs, 
  QuickActions, 
  RecentItems, 
  FavoritesMenu 
} from "./ui/EnterpriseNavigation";
import { 
  StatusBadge, 
  ConnectionStatus, 
  SyncStatus, 
  HealthIndicator, 
  Stepper, 
  Timeline 
} from "./ui/EnterpriseStatus";
import { 
  CurrencyDisplay, 
  MoneyBadge, 
  AmountDifference, 
  BalanceCard, 
  PayrollSummary, 
  EmployeeAvatar 
} from "./ui/EnterpriseFinancial";
import { 
  EmptyState, 
  LoadingOverlay, 
  LoadingSkeleton, 
  PermissionGuard, 
  AutoSaveIndicator, 
  VersionBadge, 
  EnvironmentBadge 
} from "./ui/EnterpriseFeedback";
import { 
  ConfirmationDialog, 
  DeleteDialog, 
  ApproveDialog, 
  WarningDialog, 
  SuccessDialog 
} from "./ui/EnterpriseDialogs";
import { 
  PayrollPeriodSelector, 
  PayrollTypeSelector, 
  PayrollApprovalPanel, 
  SystemHealthCard, 
  AiMessage, 
  AiThinking 
} from "./ui/EnterpriseErp";
import { DESIGN_TOKENS } from "./ui/tokens";
import { 
  Palette, 
  Layout, 
  CreditCard, 
  Table, 
  Sliders, 
  Navigation, 
  Activity, 
  DollarSign, 
  ShieldCheck, 
  Terminal, 
  Sparkles, 
  CheckCircle2 
} from "lucide-react";

export const DesignSystemCatalog: React.FC = () => {
  const [activeTab, setActiveTab] = useState("overview");
  const [density, setDensity] = useState<"compact" | "normal" | "spacious">("normal");
  const [searchValue, setSearchValue] = useState("");
  const [page, setPage] = useState(1);
  const [tags, setTags] = useState(["FINOPS", "ERP", "v2.5"]);
  const [amount, setAmount] = useState(125000);
  const [dialogType, setDialogType] = useState<string | null>(null);

  const sampleTableData = [
    { id: 1, name: "Jean-Baptiste Duval", role: "Directeur Financier", salary: 250000, status: "ACTIVE" },
    { id: 2, name: "Marie-Claire Joseph", role: "Comptable Sénior", salary: 180000, status: "ACTIVE" },
    { id: 3, name: "Pierre-Richard Alexis", role: "Spécialiste Paie", salary: 140000, status: "PENDING" },
    { id: 4, name: "Florence Estimé", role: "Auditeur Interne", salary: 195000, status: "LOCKED" }
  ];

  const sampleColumns = [
    { key: "name", header: "Employé", accessor: (row: any) => <EmployeeAvatar name={row.name} size="sm" /> },
    { key: "role", header: "Rôle / Poste" },
    { key: "salary", header: "Salaire Brut", align: "right" as const, accessor: (row: any) => <CurrencyDisplay amount={row.salary} size="xs" /> },
    { key: "status", header: "Statut", align: "center" as const, accessor: (row: any) => <StatusBadge status={row.status} /> }
  ];

  return (
    <PageContainer>
      <PageHeader
        title={
          <div className="flex items-center gap-2.5">
            <Palette className="w-6 h-6 text-blue-400" />
            <span>FINOPS Enterprise UI Platform</span>
          </div>
        }
        subtitle="Catalogue de Composants Reutilisables, Design Tokens & Gouvernance d'Architecture"
        badge={
          <div className="flex items-center gap-2">
            <VersionBadge version="v2.5.0" />
            <EnvironmentBadge env="SSOT" />
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <HealthIndicator score={DESIGN_TOKENS.qualityScore.overallScore} status="good" />
          </div>
        }
      />

      <Tabs
        tabs={[
          { id: "overview", label: "Vue d'ensemble & Health", icon: <Activity className="w-4 h-4" /> },
          { id: "tokens", label: "Design Tokens", icon: <Palette className="w-4 h-4" /> },
          { id: "cards", label: "Cards & Metrics", icon: <CreditCard className="w-4 h-4" /> },
          { id: "tables", label: "Tables & Grids", icon: <Table className="w-4 h-4" /> },
          { id: "forms", label: "Formulaires & Inputs", icon: <Sliders className="w-4 h-4" /> },
          { id: "status", label: "Status & Workflows", icon: <ShieldCheck className="w-4 h-4" /> },
          { id: "financial", label: "Financier & Paie", icon: <DollarSign className="w-4 h-4" /> },
          { id: "erp", label: "Modules ERP & IA", icon: <Sparkles className="w-4 h-4" /> }
        ]}
        activeTabId={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "overview" && (
        <Stack gap={6}>
          <Grid cols={3} gap={4}>
            <MetricCard
              title="UI Health Score"
              value="98 / 100"
              trend={{ value: "+2%", isPositive: true, label: "vs sprint précédent" }}
              variant="emerald"
            />
            <MetricCard
              title="Composants Unifiés"
              value="65+ Reutilisables"
              subtitle="0 composant custom en page"
              variant="blue"
            />
            <MetricCard
              title="Conformité WCAG AA"
              value="100%"
              subtitle="Accessibilité Clavier + ARIA"
              variant="purple"
            />
          </Grid>

          <ContentContainer className="space-y-4">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Règles de Gouvernance Permamente</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-300">
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
                <span className="font-bold text-slate-100">1. Recherche Préalable obligatoire:</span> Toujours utiliser <code className="text-blue-400">src/components/ui</code> avant d'écrire du code visuel.
              </div>
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
                <span className="font-bold text-slate-100">2. Aucun composant local:</span> Interdiction de définir des boutons ou cartes isolés dans les sous-dossiers de features.
              </div>
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
                <span className="font-bold text-slate-100">3. Standardisation Standard API:</span> Tous les composants exposent `loading`, `disabled`, `readonly`, `className`.
              </div>
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
                <span className="font-bold text-slate-100">4. Support Multi-Écran:</span> Modalités adaptatives et BottomSheets automatique sur mobile.
              </div>
            </div>
          </ContentContainer>
        </Stack>
      )}

      {activeTab === "tokens" && (
        <Stack gap={6}>
          <PageSection title="Design Tokens - Palette Couleurs & Statuts">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-slate-100">
                <div className="font-bold">Primary Slate</div>
                <div className="text-[10px] text-slate-400 font-mono">bg-slate-900</div>
              </div>
              <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-400 font-bold">
                Blue Accent (#3B82F6)
              </div>
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 font-bold">
                Emerald Success (#10B981)
              </div>
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 font-bold">
                Amber Warning (#F59E0B)
              </div>
              <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 font-bold">
                Rose Critical (#F43F5E)
              </div>
              <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl text-purple-400 font-bold">
                Purple AI (#8B5CF6)
              </div>
            </div>
          </PageSection>
        </Stack>
      )}

      {activeTab === "cards" && (
        <Grid cols={2} gap={4}>
          <MetricCard
            title="Masse Salariale Mensuelle"
            value="12,450,000 HTG"
            trend={{ value: "+4.2%", isPositive: true, label: "vs mois dernier" }}
            variant="emerald"
          />
          <InsightCard
            title="Alerte Cotisations Sociales"
            description="L'échéance ONA / IRI du mois en cours est fixée au 15. Pensez à clôturer la déclaration."
            type="warning"
          />
          <SummaryCard
            title="Résumé du Cycle de Paie"
            items={[
              { label: "Employés concernés", value: "142" },
              { label: "Total Brut", value: "15,800,000 HTG" },
              { label: "Net à payer", value: "12,450,000 HTG", highlight: true }
            ]}
          />
          <ActionCard
            title="Validation de la Paie"
            description="Le cycle de paie de Juillet 2026 est prêt pour validation finale."
            buttonLabel="Valider la Paie"
            onAction={() => alert("Action déclenchée !")}
            variant="emerald"
          />
        </Grid>
      )}

      {activeTab === "tables" && (
        <Stack gap={4}>
          <DataTableToolbar
            search={<TableSearch value={searchValue} onChange={setSearchValue} />}
            filters={
              <FilterBar>
                <QuickFilter label="Tous" active={true} count={4} onClick={() => {}} />
                <QuickFilter label="Actifs" active={false} count={2} onClick={() => {}} />
              </FilterBar>
            }
            actions={
              <div className="flex items-center gap-2">
                <TableDensitySelector density={density} onChange={setDensity} />
                <TableExportMenu onExportCsv={() => alert("Export CSV")} />
              </div>
            }
          />
          <EnterpriseTable
            data={sampleTableData}
            columns={sampleColumns}
            keyExtractor={(item) => item.id}
            density={density}
          />
          <TablePagination
            currentPage={page}
            totalPages={3}
            pageSize={10}
            totalItems={24}
            onPageChange={setPage}
          />
        </Stack>
      )}

      {activeTab === "forms" && (
        <ContentContainer className="space-y-6">
          <FormSection title="Coordonnées de l'Employé" description="Informations de base et contacts.">
            <FormGroup>
              <FieldLabel required>Nom complet</FieldLabel>
              <SearchInput value={searchValue} onChange={setSearchValue} placeholder="Ex: Jean Duval" />
            </FormGroup>
            <FormGroup>
              <FieldLabel>Téléphone Professionnel</FieldLabel>
              <PhoneInput value="+509 3700 0000" onChange={() => {}} />
            </FormGroup>
            <FormGroup>
              <FieldLabel required>Salaire Brut Proposé</FieldLabel>
              <CurrencyInput value={amount} onChange={setAmount} />
            </FormGroup>
            <FormGroup>
              <FieldLabel>Tags & Mots-clés</FieldLabel>
              <TagInput tags={tags} onChange={setTags} />
            </FormGroup>
          </FormSection>
        </ContentContainer>
      )}

      {activeTab === "status" && (
        <Stack gap={6}>
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge status="ACTIVE" />
            <StatusBadge status="PAID" />
            <StatusBadge status="PENDING" />
            <StatusBadge status="REJECTED" />
            <StatusBadge status="PROCESSING" />
            <ConnectionStatus isOnline={true} />
            <SyncStatus isSyncing={false} />
          </div>

          <PageSection title="Progression du Workflow">
            <Stepper
              steps={[
                { id: "1", title: "Saisie", status: "completed" },
                { id: "2", title: "Vérification RH", status: "completed" },
                { id: "3", title: "Approbation Finance", status: "current" },
                { id: "4", title: "Paiement Banque", status: "upcoming" }
              ]}
            />
          </PageSection>
        </Stack>
      )}

      {activeTab === "financial" && (
        <Grid cols={3} gap={4}>
          <BalanceCard title="Solde Compte Principal (SOGEBANK)" balance={8450000} />
          <BalanceCard title="Masse Salariale Réserve" balance={12450000} />
          <PayrollSummary totalGross={15800000} totalDeductions={3350000} totalNet={12450000} count={142} />
        </Grid>
      )}

      {activeTab === "erp" && (
        <Stack gap={6}>
          <SystemHealthCard />
          <PayrollApprovalPanel
            status="EN ATTENTE D'APPROBATION"
            onApprove={() => setDialogType("approve")}
            onReject={() => setDialogType("delete")}
          />
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
            <AiMessage content="Bonjour ! Je suis l'Assistant FINOPS. Votre masse salariale ce mois-ci est parfaitement conforme aux prévisions budgétaires." />
            <AiThinking message="Calcul automatique des précomptes fiscaux IRI..." />
          </div>
        </Stack>
      )}

      {/* Dialog Previews */}
      <ApproveDialog
        isOpen={dialogType === "approve"}
        onClose={() => setDialogType(null)}
        title="Approuver le Cycle de Paie"
        onConfirm={() => {
          alert("Paie approuvée !");
          setDialogType(null);
        }}
      >
        Êtes-vous sûr de vouloir approuver et verrouiller la paie du mois en cours ?
      </ApproveDialog>

      <DeleteDialog
        isOpen={dialogType === "delete"}
        onClose={() => setDialogType(null)}
        title="Rejeter le Cycle de Paie"
        onConfirm={() => {
          alert("Cycle rejeté.");
          setDialogType(null);
        }}
      >
        Cette action renverra le registre en révision auprès du responsable RH.
      </DeleteDialog>
    </PageContainer>
  );
};

export default DesignSystemCatalog;
