import { describe, it, expect, vi } from "vitest";
import Papa from "papaparse";
import {
  BulkEmployeeImportService,
  EMPLOYEE_IMPORT_TEMPLATE_COLUMNS,
  generateEmployeeImportTemplateCsv
} from "../../services/workforce/BulkEmployeeImportService";
import { EmployeeRepository } from "../../repositories/EmployeeRepository";

describe("Canonical 12-Column Employee Import Template Model", () => {
  const CANONICAL_DATASET_TSV = [
    "displayName\temail\tphone\tposition\trole\tcontract_type\tpay_regime\tsalary_base_htg\tcommission_rate\tbranch_name\tdepartment_name\thire_date",
    "Rodson Charles\trodsoncharles629@gmail.com\t50936907553\tBarber\tEMPLOYEE\tcdd\tCommission\t0\t0.45\tBureau Central\tBarber Shop\t2026-01-01",
    "Steevenson Mizaine\tsteevensonmizaine96@gmail.com\t50934704336\tBarber\tEMPLOYEE\tcdd\tCommission\t0\t0.4\tBureau Central\tBarber Shop\t2026-01-01",
    "Jhenson Bellevue\tjbellevue84@gmail.com\t50949350952\tBarber\tEMPLOYEE\tcdd\tCommission\t0\t0.4\tBureau Central\tBarber Shop\t2026-01-01",
    "Sheelove Pierre\tpierreshelove02@gmail.com\t50944411183\tCaisse\tEMPLOYEE\tcdd\tHybrid\t20000\t0.05\tBureau Central\tTransfer\t2026-01-01",
    "Esther Marcellus Marcelin\testhermarcellus20@icloud.com\t50939218951\tCaisse\tSUPERVISOR\tcdd\tHybrid\t14000\t0.05\tBureau Central\tSupervision\t2026-01-01",
    "Estaelle Excellent\tstaeleexcellent2033@gmail.com\t50934776099\tCaisse\tEMPLOYEE\tcdd\tHybrid\t14000\t0.05\tBureau Central\tRorose B.\t2026-01-01",
    "Guetchina Millien\tmillienguetchina53@gmail.com\t50948176493\tNail Tech\tEMPLOYEE\tcdd\tHybrid\t11000\t0.11\tBureau Central\tNail Studio\t2026-01-01",
    "Elianne Gauthier\teliannegauthier@gmail.com\t50947515151\tNail Tech\tEMPLOYEE\tcdd\tHybrid\t5000\t0.11\tBureau Central\tNail Studio\t2026-01-01",
    "Vahisha Poliphca\tvahishapoliphca@gmail.com\t50947515151\tNail Tech\tEMPLOYEE\tcdd\tHybrid\t5000\t0.11\tBureau Central\tNail Studio\t2026-01-01",
    "Nehemie Maxi\tnehemiemaxi@gmail.com\t50941985102\tNail Tech\tEMPLOYEE\tcdd\tHybrid\t12000\t0.14\tBureau Central\tNail Studio\t2026-01-01",
    "Sophia Ycla Lalanne\tsophiayclalalanne@gmail.com\t50938541949\tNail Tech\tEMPLOYEE\tcdd\tHybrid\t11000\t0.11\tBureau Central\tNail Studio\t2026-01-01",
    "Yvonia Neolien\tyvonianeolien@gmail.com\t50948539661\tNail Tech\tEMPLOYEE\tcdd\tHybrid\t15000\t0.15\tBureau Central\tNail Studio\t2026-01-01",
    "Jennifer Naïly\tjennifernaïly@gmail.com\t50947515151\tNail Tech\tEMPLOYEE\tcdd\tHybrid\t5000\t0.11\tBureau Central\tNail Studio\t2026-01-01",
    "Roseline Jean\troselinejean@gmail.com\t50947515151\tNail Tech\tEMPLOYEE\tcdd\tFixe\t8500\t\tBureau Central\tLogistic & Securite\t2026-01-01",
    "Clifford Cajusma\tcliffordcajusma@gmail.com\t50947515151\tNail Tech\tEMPLOYEE\tcdd\tHybrid\t5000\t0.11\tBureau Central\tNail Studio\t2026-01-01",
    "Josela Jeudi\tjoselajeudi@gmail.com\t50947007167\tNail Tech\tMANAGER\tcdd\tHybrid\t0\t0\tBureau Central\tAdministration\t2026-01-01",
    "Stacy Etienne\tstacyetienne@gmail.com\t50944429130\tNail Tech\tEMPLOYEE\tcdd\tHybrid\t10000\t0.17\tBureau Central\tNail Studio\t2026-01-01",
    "Vercira Lorveda\tverciralorveda@gmail.com\t50934703819\tNail Tech\tEMPLOYEE\tcdd\tHybrid\t14000\t0.05\tBureau Central\tNail Studio\t2026-01-01",
    "Nathalie Fleury\tfleurynathalie209@gmail.com\t50946910597\tNail Tech\tEMPLOYEE\tcdd\tHybrid\t25000\t0.05\tBureau Central\tNail Studio\t2026-01-01",
    "Marie Perpétua Stephanie\ttmarieperpetuastephanie@gmail.com\t50948619943\tManager\tEMPLOYEE\tcdd\tFixe\t23000\t\tBureau Central\tSupervision\t2026-01-01",
    "Rachelle Louis Charles\trachellelouischarles8@gmail.com\t50931766583\tCaisse\tEMPLOYEE\tcdd\tHybrid\t15000\t0.05\tBureau Central\tSupervision\t2026-01-01",
    "Frantzo Guerrier\tguerrierfrantzo509@gmail.com\t50939102393\tLogistic\tEMPLOYEE\tcdd\tFixe\t10500\t\tBureau Central\tLogistic & Securite\t2026-01-01"
  ].join("\n");

  it("exports the exact 12 canonical template headers and generates a valid round-trip CSV", () => {
    expect(EMPLOYEE_IMPORT_TEMPLATE_COLUMNS).toEqual([
      "displayName",
      "email",
      "phone",
      "position",
      "role",
      "contract_type",
      "pay_regime",
      "salary_base_htg",
      "commission_rate",
      "branch_name",
      "department_name",
      "hire_date"
    ]);

    const csv = generateEmployeeImportTemplateCsv();
    const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
    expect(parsed.meta.fields).toEqual([...EMPLOYEE_IMPORT_TEMPLATE_COLUMNS]);

    const plan = BulkEmployeeImportService.resolveImportPlan("biz_tpl", parsed.data, [], [], []);
    expect(plan.validationErrors).toEqual([]);
    expect(plan.summary.totalRows).toBe(parsed.data.length);
    expect(plan.summary.validRows).toBe(parsed.data.length);
  });

  it("parses and validates all 22 rows from the canonical template dataset without errors", () => {
    const parsed = Papa.parse(CANONICAL_DATASET_TSV, { header: true, skipEmptyLines: true });
    const plan = BulkEmployeeImportService.resolveImportPlan("biz_salon", parsed.data, [], [], []);

    expect(plan.validationErrors).toEqual([]);
    expect(plan.summary.totalRows).toBe(22);
    expect(plan.summary.validRows).toBe(22);
    expect(plan.branchesToCreate).toHaveLength(1);
    expect(plan.branchesToCreate[0].name).toBe("Bureau Central");

    const deptNames = plan.departmentsToCreate.map((d) => d.name);
    expect(deptNames).toEqual([
      "Barber Shop",
      "Transfer",
      "Supervision",
      "Rorose B.",
      "Nail Studio",
      "Logistic & Securite",
      "Administration"
    ]);

    // Row 0: Rodson Charles (Barber, EMPLOYEE, cdd, Commission, 0, 0.45)
    const rodson = plan.parsedRows[0];
    expect(rodson.name).toBe("Rodson Charles");
    expect(rodson.role).toBe("EMPLOYEE");
    expect(rodson.operational_profile).toBe("polyvalent");
    expect(rodson.contractType).toBe("cdd");
    expect(rodson.payRegime).toBe("commission");
    expect(rodson.paymentModel).toBe("COMMISSION");
    expect(rodson.baseSalary).toBe(0);
    expect(rodson.commissionRate).toBe(45);
    expect(rodson.commission_rate).toBe(0.45);
    expect(rodson.hireDate).toBe("2026-01-01");

    // Row 3: Sheelove Pierre (Caisse, EMPLOYEE, cdd, Hybrid, 20000, 0.05)
    const sheelove = plan.parsedRows[3];
    expect(sheelove.role).toBe("EMPLOYEE");
    expect(sheelove.operational_profile).toBe("vendeur");
    expect(sheelove.payRegime).toBe("hybrid");
    expect(sheelove.baseSalary).toBe(20000);
    expect(sheelove.commissionRate).toBe(5);
    expect(sheelove.commission_rate).toBe(0.05);

    // Row 4: Esther Marcellus Marcelin (SUPERVISOR -> null operational_profile)
    const esther = plan.parsedRows[4];
    expect(esther.role).toBe("SUPERVISOR");
    expect(esther.operational_profile).toBeNull();
    expect(esther.baseSalary).toBe(14000);
    expect(esther.commissionRate).toBe(5);

    // Row 13: Roseline Jean (Fixe, 8500, blank commission_rate)
    const roseline = plan.parsedRows[13];
    expect(roseline.payRegime).toBe("fixe");
    expect(roseline.paymentModel).toBe("FIXED");
    expect(roseline.baseSalary).toBe(8500);
    expect(roseline.commissionRate).toBeUndefined();
    expect(roseline.commission_rate).toBeUndefined();

    // Row 15: Josela Jeudi (MANAGER, Hybrid, 0, 0 -> explicit 0 preserved, null profile)
    const josela = plan.parsedRows[15];
    expect(josela.role).toBe("MANAGER");
    expect(josela.operational_profile).toBeNull();
    expect(josela.payRegime).toBe("hybrid");
    expect(josela.baseSalary).toBe(0);
    expect(josela.commissionRate).toBe(0);
    expect(josela.commission_rate).toBe(0);
  });

  it("produces Firestore-compatible employee, invitation, badge, and contract payloads on execution", async () => {
    const parsed = Papa.parse(CANONICAL_DATASET_TSV, { header: true, skipEmptyLines: true });
    const plan = BulkEmployeeImportService.resolveImportPlan("biz_salon", parsed.data, [], [], []);

    const batchSpy = vi.spyOn(EmployeeRepository, "createBulkImportBatch").mockResolvedValueOnce({
      committedBatches: 2,
      totalBatches: 2
    });

    const result = await BulkEmployeeImportService.executeImportPlan(plan);

    expect(result.success).toBe(true);
    expect(result.importedEmployeesCount).toBe(22);
    expect(result.createdEmployees[0].displayName).toBe("Rodson Charles");
    expect(result.createdEmployees[0].operational_profile).toBe("polyvalent");
    expect(result.createdEmployees[15].operational_profile).toBeUndefined();
    expect(result.createdContracts[15].commissionRate).toBe(0);
    expect(result.createdEmployees[13].hireDate).toBe("2026-01-01");

    batchSpy.mockRestore();
  });

  it("does not fabricate a 28000 HTG default salary when salary_base_htg is empty", () => {
    const plan = BulkEmployeeImportService.resolveImportPlan(
      "biz_salon",
      [
        {
          displayName: "Barber Sans Salaire",
          email: "barber@finops.ht",
          phone: "50936000000",
          position: "Barber",
          role: "EMPLOYEE",
          contract_type: "cdd",
          pay_regime: "Commission",
          salary_base_htg: "",
          commission_rate: "0.45",
          branch_name: "Bureau Central",
          department_name: "Barber Shop",
          hire_date: "2026-01-01"
        }
      ],
      [],
      [],
      []
    );

    expect(plan.summary.validRows).toBe(1);
    expect(plan.parsedRows[0].baseSalary).toBe(0);
    expect(plan.parsedRows[0].commissionRate).toBe(45);
  });
});
