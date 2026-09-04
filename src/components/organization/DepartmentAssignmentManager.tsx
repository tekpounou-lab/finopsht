import React, { useState } from "react";
import { Employee, Department, EmployeeDepartmentAssignment } from "../../types";
import { DepartmentAssignmentEngine } from "../../domains/organization/services/DepartmentAssignmentEngine";
import { DepartmentAliasEngine } from "../../domains/organization/services/DepartmentAliasEngine";
import { Building2, Plus, Trash2, CheckCircle2, AlertCircle, Tag, Shield, Percent, Calendar } from "lucide-react";

interface DepartmentAssignmentManagerProps {
  employee: Employee;
  departments: Department[];
  onSaveAssignments: (updatedEmployee: Employee) => Promise<void>;
  onUpdateDepartmentAliases?: (departmentId: string, updatedAliases: string[]) => Promise<void>;
}

export const DepartmentAssignmentManager: React.FC<DepartmentAssignmentManagerProps> = ({
  employee,
  departments,
  onSaveAssignments,
  onUpdateDepartmentAliases
}) => {
  const [assignments, setAssignments] = useState<EmployeeDepartmentAssignment[]>(() => {
    return DepartmentAssignmentEngine.getActiveAssignments(employee);
  });

  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"ASSIGNMENTS" | "ALIASES">("ASSIGNMENTS");
  const [selectedDeptForAlias, setSelectedDeptForAlias] = useState<string>(departments[0]?.id || "");
  const [newAliasInput, setNewAliasInput] = useState("");

  const validation = DepartmentAssignmentEngine.validateAssignments(assignments);

  const primaryDeptId = assignments.find(a => a.primary)?.department_id;

  const handleSetPrimary = (deptId: string) => {
    setAssignments(prev => {
      return prev.map(a => ({
        ...a,
        primary: a.department_id === deptId
      }));
    });
  };

  const handleAllocationChange = (deptId: string, percentage: number) => {
    const val = Math.max(0, Math.min(100, percentage));
    setAssignments(prev => {
      return prev.map(a => (a.department_id === deptId ? { ...a, allocation_percentage: val } : a));
    });
  };

  const handleAddSecondaryDepartment = (deptId: string) => {
    if (!deptId || assignments.some(a => a.department_id === deptId)) return;

    const newAssignment: EmployeeDepartmentAssignment = {
      id: `assign_${employee.id}_${deptId}_${Date.now()}`,
      employee_id: employee.id,
      department_id: deptId,
      primary: false,
      allocation_percentage: 0,
      status: "ACTIVE",
      start_date: new Date().toISOString().split("T")[0]
    };

    setAssignments(prev => [...prev, newAssignment]);
  };

  const handleRemoveDepartment = (deptId: string) => {
    const target = assignments.find(a => a.department_id === deptId);
    if (target?.primary) return; // Cannot remove primary department

    setAssignments(prev => prev.filter(a => a.department_id !== deptId));
  };

  const handleSave = async () => {
    if (!validation.isValid) return;

    setSaving(true);
    try {
      const primaryAssignment = assignments.find(a => a.primary);
      const updatedEmployee: Employee = {
        ...employee,
        departmentId: primaryAssignment ? primaryAssignment.department_id : employee.departmentId,
        primaryDepartmentId: primaryAssignment ? primaryAssignment.department_id : employee.departmentId,
        departmentAssignments: assignments
      };

      await onSaveAssignments(updatedEmployee);
    } finally {
      setSaving(false);
    }
  };

  const handleAddAlias = async () => {
    if (!newAliasInput.trim() || !selectedDeptForAlias || !onUpdateDepartmentAliases) return;

    const dept = departments.find(d => d.id === selectedDeptForAlias);
    if (!dept) return;

    const updatedDept = DepartmentAliasEngine.addAlias(dept, newAliasInput.trim());
    await onUpdateDepartmentAliases(dept.id, updatedDept.aliases || []);
    setNewAliasInput("");
  };

  const handleRemoveAlias = async (deptId: string, alias: string) => {
    if (!onUpdateDepartmentAliases) return;
    const dept = departments.find(d => d.id === deptId);
    if (!dept) return;

    const updatedDept = DepartmentAliasEngine.removeAlias(dept, alias);
    await onUpdateDepartmentAliases(dept.id, updatedDept.aliases || []);
  };

  const totalAllocation = assignments.reduce((sum, a) => sum + (Number(a.allocation_percentage) || 0), 0);
  const currentDeptObj = departments.find(d => d.id === selectedDeptForAlias);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              Gestion Multi-Départements
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                {employee.name}
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Affectation aux départements analytiques et répartition des coûts de paie.
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 font-mono text-xs">
          <button
            onClick={() => setActiveTab("ASSIGNMENTS")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === "ASSIGNMENTS" ? "bg-slate-800 text-emerald-400 font-bold shadow" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Affectations (% Allocation)
          </button>
          <button
            onClick={() => setActiveTab("ALIASES")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === "ALIASES" ? "bg-slate-800 text-emerald-400 font-bold shadow" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Gestion des Alias SSOT
          </button>
        </div>
      </div>

      {activeTab === "ASSIGNMENTS" && (
        <div className="space-y-5">
          {/* Validation Notice */}
          <div className="flex items-center justify-between p-3.5 bg-slate-950 border border-slate-800 rounded-xl">
            <div className="flex items-center gap-2 text-xs">
              <Percent className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-300 font-medium">Somme des allocations :</span>
              <span
                className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${
                  Math.abs(totalAllocation - 100) < 0.1
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                }`}
              >
                {totalAllocation}% / 100%
              </span>
            </div>

            {!validation.isValid && (
              <div className="text-[11px] text-amber-400 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {validation.errors[0]}
              </div>
            )}
          </div>

          {/* Department List */}
          <div className="space-y-3">
            {assignments.map(a => {
              const dept = departments.find(d => d.id === a.department_id);
              const isPrimary = a.primary;

              return (
                <div
                  key={a.department_id}
                  className={`p-4 rounded-xl border transition-all ${
                    isPrimary
                      ? "bg-emerald-950/20 border-emerald-500/30 shadow-md"
                      : "bg-slate-950/40 border-slate-800"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleSetPrimary(a.department_id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-all ${
                          isPrimary
                            ? "bg-emerald-500 text-slate-950 font-bold"
                            : "bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700"
                        }`}
                      >
                        <Shield className="w-3.5 h-3.5" />
                        {isPrimary ? "Département Principal" : "Définir comme Principal"}
                      </button>

                      <div>
                        <div className="text-sm font-semibold text-slate-100">{dept?.name || a.department_id}</div>
                        <div className="text-[10px] text-slate-500 font-mono">ID: {a.department_id}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Allocation percentage control */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 font-mono">Allocation:</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={a.allocation_percentage}
                          onChange={e => handleAllocationChange(a.department_id, parseFloat(e.target.value) || 0)}
                          className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-100 font-mono text-center focus:ring-2 focus:ring-emerald-500/40 focus:outline-none"
                        />
                        <span className="text-xs text-slate-400">%</span>
                      </div>

                      {!isPrimary && (
                        <button
                          type="button"
                          onClick={() => handleRemoveDepartment(a.department_id)}
                          className="p-1.5 text-slate-500 hover:text-red-400 transition-colors rounded-lg hover:bg-slate-800"
                          title="Supprimer la sous-affectation"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add Secondary Department Dropdown */}
          <div className="flex items-center gap-3 pt-2">
            <select
              onChange={e => {
                if (e.target.value) {
                  handleAddSecondaryDepartment(e.target.value);
                  e.target.value = "";
                }
              }}
              defaultValue=""
              className="bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 px-3.5 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              <option value="" disabled>
                + Ajouter un département secondaire...
              </option>
              {departments
                .filter(d => !assignments.some(a => a.department_id === d.id))
                .map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code || d.id})
                  </option>
                ))}
            </select>
          </div>

          {/* Action Save */}
          <div className="pt-4 border-t border-slate-800 flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={!validation.isValid || saving}
              className="px-5 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-lg shadow-emerald-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              {saving ? "Enregistrement..." : "Sauvegarder les Affectations SSOT"}
            </button>
          </div>
        </div>
      )}

      {activeTab === "ALIASES" && (
        <div className="space-y-5">
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
            <label className="text-xs font-mono text-slate-400 block">Sélectionner un Département pour gérer ses Alias :</label>
            <select
              value={selectedDeptForAlias}
              onChange={e => setSelectedDeptForAlias(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-200 px-3.5 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              {departments.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code || d.id})
                </option>
              ))}
            </select>
          </div>

          {currentDeptObj && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Ex: Barber Shop, Hair Salon, Coiffure..."
                  value={newAliasInput}
                  onChange={e => setNewAliasInput(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
                <button
                  type="button"
                  onClick={handleAddAlias}
                  disabled={!newAliasInput.trim()}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded-xl text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 transition-all border border-slate-700"
                >
                  <Plus className="w-4 h-4" />
                  Ajouter Alias
                </button>
              </div>

              {/* Existing Aliases Chips */}
              <div className="space-y-2">
                <div className="text-xs font-mono text-slate-400">Alias Enregistrés ({currentDeptObj.aliases?.length || 0}) :</div>
                <div className="flex flex-wrap gap-2">
                  {(!currentDeptObj.aliases || currentDeptObj.aliases.length === 0) ? (
                    <span className="text-xs text-slate-500 italic">Aucun alias enregistré pour ce département.</span>
                  ) : (
                    currentDeptObj.aliases.map(alias => (
                      <span
                        key={alias}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-200"
                      >
                        <Tag className="w-3 h-3 text-emerald-400" />
                        {alias}
                        <button
                          type="button"
                          onClick={() => handleRemoveAlias(currentDeptObj.id, alias)}
                          className="hover:text-red-400 text-slate-500 ml-1"
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
