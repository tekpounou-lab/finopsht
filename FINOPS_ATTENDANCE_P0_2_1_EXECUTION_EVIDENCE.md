# FINOPS ERP — ATTENDANCE P0.2.1 EXECUTION EVIDENCE LOG

**Validation ID:** `FINOPS-ATTENDANCE-P0.2.1`  
**Date (UTC):** `2026-11-24T15:15:00Z` – `2026-11-24T15:23:36Z`  
**Container Environment:** Debian GNU/Linux 12 (`bookworm`), Linux `4.19.0-gvisor`, Node.js `v22.23.5`, `firebase-tools` `15.36.0`  
**Evidence Classification:** `PROVEN_INTEGRATION` (Isolated local Firestore Emulator execution only; **ZERO** production connections, **ZERO** rule deployments)

---

## 1. Isolated CI Execution Environment Setup (`/tmp/p021-ci-emulator`)

Per strict safety constraints (*do not install Java in the original application workspace; do not modify `/firestore.rules`, `/src/**`, `/firebase.json`, or `/package.json`*), all runtime tooling was staged inside `/tmp/p021-ci-emulator`:

- **JDK Runtime (Isolated):** Eclipse Temurin JRE `21.0.13.1+2-LTS`
  - Path: `/tmp/p021-ci-emulator/jdk`
  - Verification output (`java -version`):
    ```text
    openjdk version "21.0.13.1" 2026-11-17 LTS
    OpenJDK Runtime Environment Temurin-21.0.13.1+2 (build 21.0.13.1+2-LTS)
    OpenJDK 64-Bit Server VM Temurin-21.0.13.1+2 (build 21.0.13.1+2-LTS, mixed mode, sharing)
    ```
- **Firebase CLI & Emulator Binary:**
  - `firebase --version`: `15.36.0`
  - Emulator JAR: `/tmp/p021-ci-emulator/home/.cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar` (`136,707,194` bytes)
  - Emulator Config: `/tmp/p021-ci-emulator/firebase.json` (port `8088` to avoid AI Studio preview `nginx` on `8080`, UI disabled)
  - Rules Symlink (Read-Only): `/tmp/p021-ci-emulator/firestore.rules -> /app/applet/firestore.rules`
- **Rules Testing SDK:** `@firebase/rules-unit-testing@^5.0.2` (resolved from `/app/applet/package.json`)

---

## 2. Integrity Verification of Application Workspace (`/app/applet`)

- **Rules File SHA256 (verified before & after all emulator runs):**
  ```text
  d460959d3547383bb7825a01a974aa9a1207597de18d02283acc3bf636224d98  /app/applet/firestore.rules
  ```
- **Process Hygiene Check:**
  - `ps aux | grep -E "java|firebase|emulator" | grep -v grep` -> `NO_STRAY_PROCESSES`
- **Workspace Files Modified:** `0` source, rules, or config files modified (only the 4 required P0.2.1 report deliverables added in workspace root).

---

## 3. Exact Commands & Observed Outputs

### Command 1 — P0.2.1 Attendance Security Rules Suite (`45` Tests + `2` Observations)
```bash
HOME=/tmp/p021-ci-emulator/home \
JAVA_HOME=/tmp/p021-ci-emulator/jdk \
PATH=/tmp/p021-ci-emulator/jdk/bin:$PATH \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8088 \
firebase emulators:exec --only firestore --project finops-p021-emulator-test \
  "node /tmp/p021-ci-emulator/run_rules_suite.mjs"
```
- **Exit Code:** `1`
- **Observed Summary (`results.json`):**
  ```text
  SUMMARY: total=45 passed=36 failed=9 skipped=0
  ```
- **Failed Test IDs (`9`):**
  - `T-01-06`: `Expected request to fail, but it succeeded.` (`MANAGER` self-updating `authorizedBranchIds` & `authorizedBranches` on `employees/{empId}`)
  - `M-01`, `M-02`, `M-03`, `M-04`, `M-06`, `M-07`, `M-08`, `M-09`:
    `7 PERMISSION_DENIED: Unable to evaluate the expression as the maximum of 1000 expressions to evaluate has been reached. for 'create' @ L541`
- **Explicit Diagnostic Observations Logged (`results.json`):**
  - `OBS-04-03`: `payroll_cycles/{cycleId} update when status == PESSIMISTIC_LOCKED: actual=ALLOWED (firestore.rules:1540 lists SEALED, LOCKED, VALIDATED, PAID — omitting PESSIMISTIC_LOCKED, whereas ServerAttendanceService enforces PESSIMISTIC_LOCKED on attendance writes).`
  - `OBS-M-11`: `UNKNOWN role ('MYSTERY_ROLE') self-justification create: actual=DENIED (canWriteAttendanceForEmployee falls back to isAttendanceSelfTarget(empId) when role is not in auditor/guest/unassigned/accountant, whereas ServerAttendanceService denies unknown roles via normalizeCanonicalAttendanceRole -> INVALID_OR_MISSING_ROLE). Third-party DENIED.`

### Command 2 — Focused Diagnostic Probes (`probe_details.mjs`)
```bash
HOME=/tmp/p021-ci-emulator/home \
JAVA_HOME=/tmp/p021-ci-emulator/jdk \
PATH=/tmp/p021-ci-emulator/jdk/bin:$PATH \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8088 \
firebase emulators:exec --only firestore --project finops-p021-emulator-test \
  "node /tmp/p021-ci-emulator/probe_details.mjs" | grep -E "PROBE\||SUMMARY"
```
- **Observed Probe Results (verbatim):**
  ```text
  PROBE|MGR_SELF_AUTH_BRANCHES|ALLOWED
  PROBE|MGR_SELF_ESCALATE_ROLE_OWNER|ALLOWED
  PROBE|MGR_SELF_DELEG_EMP|ALLOWED
  PROBE|MGR_USERS_SELF_ESCALATE|DENIED|hit1000=false|7 PERMISSION_DENIED:  evaluation error at L580:24 for 'update' @ L580, false for 'update' @ L2156, false for 'update' @ L580, false for 'update' @ L2156
  PROBE|SA_JUST_CREATE|ALLOWED
  PROBE|OWN_JUST_CREATE|DENIED|hit1000=true|7 PERMISSION_DENIED:  Unable to evaluate the expression as the maximum of 1000 expressions to evaluate has been reached. for 'create' @ L541, Unable to evaluate the expression as the maximum of 1000 expressions to evalua
  PROBE|EMP_JUST_NO_RECORDBY|DENIED|hit1000=true|7 PERMISSION_DENIED:  Unable to evaluate the expression as the maximum of 1000 expressions to evaluate has been reached. for 'create' @ L541, Unable to evaluate the expression as the maximum of 1000 expressions to evalua
  PROBE|EMP_JUST_APPROVED|DENIED|hit1000=true|7 PERMISSION_DENIED:  Unable to evaluate the expression as the maximum of 1000 expressions to evaluate has been reached. for 'create' @ L541, Unable to evaluate the expression as the maximum of 1000 expressions to evalua
  PROBE|OWN_JUST_CONFLICT_BIZ|DENIED|hit1000=true|7 PERMISSION_DENIED:  false for 'create' @ L541, false for 'create' @ L2156, Unable to evaluate the expression as the maximum of 1000 expressions to evaluate has been reached. for 'update' @ L543, Unable to evaluate the 
  PROBE|OWN_JUST_CAMEL_ONLY|DENIED|hit1000=true|7 PERMISSION_DENIED:  false for 'create' @ L541, false for 'create' @ L2156, Unable to evaluate the expression as the maximum of 1000 expressions to evaluate has been reached. for 'update' @ L543, Unable to evaluate the 
  PROBE|AUD_JUST_SELF|DENIED|hit1000=true|7 PERMISSION_DENIED:  false for 'create' @ L541, false for 'create' @ L2156, Unable to evaluate the expression as the maximum of 1000 expressions to evaluate has been reached. for 'update' @ L543, Unable to evaluate the 
  ```
  *(Note: In `OWN_JUST_CONFLICT_BIZ`, `OWN_JUST_CAMEL_ONLY`, and `AUD_JUST_SELF`, `'create' @ L541` evaluated cleanly to `false`; the `1000 expressions` string came from the emulator's diagnostic check on `'update' @ L543`.)*

### Command 3 — Existing Repository Emulator Suite (`src/tests/emulator/firestoreRules.test.ts`)
1. Default hook timeout (`10000ms`): **FAILED** (`Hook timed out in 10000ms` in `beforeAll` compiling `2162`-line `firestore.rules`; `7 skipped`).
2. With `--hookTimeout=30000`:
   ```bash
   HOME=/tmp/p021-ci-emulator/home \
   JAVA_HOME=/tmp/p021-ci-emulator/jdk \
   PATH=/tmp/p021-ci-emulator/jdk/bin:$PATH \
   FIRESTORE_EMULATOR_HOST=127.0.0.1:8088 \
   firebase emulators:exec --only firestore --project test-finops-rules-emulator \
     "npx --prefix /app/applet vitest run --root /app/applet --hookTimeout=30000 src/tests/emulator/firestoreRules.test.ts"
   ```
   - **Exit Code:** `1` (`6 passed | 1 failed`)
   - **Failed Test:** `4. Direct client SDK writes to teller_transactions and forensic_logs are DENIED` (`forensic_logs` `set` succeeded at `firestoreRules.test.ts:134` via `canCreateAuditLog` at `firestore.rules:513`).
   - **Emulator Warnings Observed:** `Unable to evaluate the expression as the maximum of 1000 expressions to evaluate has been reached` on `branch_safes` (`L1033`), `exchange_rates` (`L971`), and `cash_tills` (`L1001`).

---

## 4. Explicit Limitations

1. **No Production Runtime Check:** Production project `finopsht`, named database `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a`, live Firebase Auth ID tokens (`checkRevoked=true`), and Vercel `/api/attendance/*` functions were NOT touched or verified (`NOT_TESTED`).
2. **Backend API Routes Not Re-Executed Here:** Express `/api/attendance/*` and `ServerAttendanceService` rely on the previously reported P0.2 mocked Admin SDK test run (`95/95`); this P0.2.1 phase strictly validated `/firestore.rules` in the Firestore Emulator.
3. **No Git Metadata Available:** `git status` returned `fatal: not a git repository`. Workspace integrity was verified via `sha256sum /app/applet/firestore.rules`.
