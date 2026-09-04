/**
 * Global infrastructure helpers to resolve department, branch, and cost-allocation names.
 * This ensures we never display Firebase IDs or raw technical keys in the executive dashboards.
 */

export function resolveDepartmentName(
  deptId: string,
  deptNameFromDB?: string,
  departmentsList: any[] = []
): string {
  const idClean = (deptId || '').trim();
  if (!idClean || idClean.toLowerCase() === 'unassigned') {
    return 'Non Assigné';
  }

  const targetId = idClean.toLowerCase();
  
  // 1. Try to find the department object in the database-backed list
  const dept = departmentsList.find(d => {
    const dId = (d.id || '').toLowerCase();
    const dName = (d.name || '').toLowerCase();
    const dCode = (d.code || '').toLowerCase();
    return dId === targetId || 
           dName === targetId ||
           (dCode && dCode === targetId) ||
           (dId.includes('dbk') && targetId.includes('dbk')) || 
           (dId.includes('d_b_k') && targetId.includes('d_b_k'));
  });

  // If a valid department record is found, check if its name is genuine (not equal to raw ID or technical placeholder)
  if (dept && dept.name) {
    const dNameTrimmed = dept.name.trim();
    const dNameLower = dNameTrimmed.toLowerCase();
    if (
      dNameTrimmed &&
      dNameLower !== targetId &&
      !dNameLower.startsWith("d_") &&
      !dNameLower.startsWith("dept_") &&
      !dNameLower.includes("departement d_")
    ) {
      return dNameTrimmed;
    }
  }

  // 2. If a genuine department name was passed from DB metadata, use it
  if (deptNameFromDB) {
    const dbNameTrimmed = deptNameFromDB.trim();
    const dbNameLower = dbNameTrimmed.toLowerCase();
    if (
      dbNameTrimmed &&
      dbNameLower !== targetId &&
      !dbNameLower.startsWith("d_") &&
      !dbNameLower.startsWith("dept_") &&
      !dbNameLower.includes("departement d_")
    ) {
      return dbNameTrimmed;
    }
  }

  // 3. Fallback resolution for known technical keys, codes, or legacy IDs
  if (targetId.includes('eng') || targetId.includes('tech') || targetId.includes('dev') || targetId.includes('it') || targetId.includes('soft') || targetId.includes('infra')) {
    return "Ingénierie & Technologie";
  } else if (targetId.includes('d_b_k') || targetId.includes('dbk') || targetId.includes('barber')) {
    return "Barber Shop & Coiffure";
  } else if (targetId.includes('qmy') || targetId.includes('nail')) {
    return "Nail Studio & Beauté";
  } else if (targetId.includes('admin') || targetId.includes('fin') || targetId === 'd1') {
    return "Administration & Finance";
  } else if (targetId.includes('oper') || targetId.includes('log') || targetId === 'd2') {
    return "Opérations & Logistique";
  } else if (targetId.includes('marketing') || targetId.includes('ventes') || targetId.includes('sales') || targetId === 'd3') {
    return "Ventes & Marketing";
  } else if (targetId.includes('rh') || targetId.includes('hr') || targetId.includes('ressources') || targetId === 'd4') {
    return "Ressources Humaines";
  } else if (targetId.includes('support') || targetId.includes('service') || targetId === 'd5') {
    return "Support Client & Service";
  } else if (targetId.includes('resto') || targetId.includes('drink') || targetId === 'a12') {
    return "Restauration & Boissons";
  }

  // If targetId is not a raw technical prefix, capitalize it nicely
  if (idClean.length > 0 && !targetId.startsWith("d_") && !targetId.startsWith("dept_")) {
    return idClean.charAt(0).toUpperCase() + idClean.slice(1);
  }

  return "Administration & Finance";
}

export function resolveBranchName(
  branchId: string,
  branchNameFromDB?: string,
  branchesList: any[] = []
): string {
  const idClean = (branchId || '').trim();
  if (!idClean || idClean.toLowerCase() === 'unassigned') {
    return 'Non Assigné';
  }

  const targetId = idClean.toLowerCase();

  // Try to find the branch object in the database-backed list
  const branch = branchesList.find(b => {
    const bId = (b.id || '').toLowerCase();
    const bName = (b.name || '').toLowerCase();
    return bId === targetId || bName === targetId;
  });

  const name = branch?.name || branchNameFromDB || '';
  const lowerName = name.toLowerCase();

  // Resolve technical / default keys
  if (
    !name || 
    lowerName.includes("branch") || 
    lowerName.includes("succursale") || 
    lowerName === targetId
  ) {
    if (targetId === 'br1' || targetId.includes('hq') || targetId.includes('siege') || targetId.includes('delmas')) {
      return "Delmas - Siège Social";
    } else if (targetId === 'br2' || targetId.includes('petion')) {
      return "Succursale Pétion-Ville";
    } else if (targetId === 'br3' || targetId.includes('cap')) {
      return "Succursale Cap-Haïtien";
    } else {
      return branchNameFromDB || branchId || "Succursale Principale";
    }
  }

  return name;
}

export function resolveCostCenterName(
  costCenterId: string,
  costCentersList: any[] = []
): string {
  const idClean = (costCenterId || '').trim();
  if (!idClean || idClean.toLowerCase() === 'unassigned') {
    return 'Général';
  }

  const targetId = idClean.toLowerCase();

  const found = costCentersList.find(cc => {
    const ccId = (cc.id || '').toLowerCase();
    const ccName = (cc.name || '').toLowerCase();
    return ccId === targetId || ccName === targetId;
  });

  if (found) return found.name;

  // Translate common technical keys to human readable names
  if (targetId === 'cc1' || targetId.includes('hq') || targetId.includes('admin') || targetId.includes('corp')) {
    return "Siège Corporate / Administration";
  } else if (targetId === 'cc2' || targetId.includes('prod') || targetId.includes('oper')) {
    return "Production & Opérations de Logistique";
  } else if (targetId === 'cc3' || targetId.includes('retail') || targetId.includes('sales')) {
    return "Distribution Retail & Ventes Directes";
  }

  return costCenterId;
}
