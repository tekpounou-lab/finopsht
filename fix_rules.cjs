const fs = require('fs');
let code = fs.readFileSync('firestore.rules', 'utf8');

// For attendance_sessions
code = code.replace(
`    match /attendance_sessions/{id} {
      allow read: if isAuthenticated() && (
        isSuperAdmin() || 
        getUserRole() in ['ADMIN', 'MANAGER', 'OWNER'] || 
        (resource != null && (resource.data.get('employeeId', 'none') == request.auth.uid || resource.data.get('employeeId', 'none') == getUserEmployeeId()))
      );
      allow create, update: if isAuthenticated() && (checkRequestBusinessId(getUserBusinessId()) || isSuperAdmin());
      allow delete: if false;
    }`,
`    match /attendance_sessions/{id} {
      allow read: if isSuperAdmin();
      allow read: if isAuthenticated() && getUserRole() in ['ADMIN', 'MANAGER', 'OWNER'] && (resource.data.businessId == getUserBusinessId() || resource.data.business_id == getUserBusinessId());
      allow read: if isAuthenticated() && resource.data.employeeId == request.auth.uid;
      allow read: if isAuthenticated() && resource.data.employeeId == getUserEmployeeId();
      allow create, update: if isAuthenticated() && (checkRequestBusinessId(getUserBusinessId()) || isSuperAdmin());
      allow delete: if false;
    }`
);

// For attendance_logs
code = code.replace(
`    match /attendance_logs/{recordId} {
      allow read: if isAuthenticated() && (
        isSuperAdmin() || 
        getUserRole() in ['ADMIN', 'MANAGER', 'OWNER'] || 
        (resource != null && (resource.data.get('employeeId', 'none') == request.auth.uid || resource.data.get('employeeId', 'none') == getUserEmployeeId()))
      );
      allow create, update: if isAuthenticated() && (checkRequestBusinessId(getUserBusinessId()) || isSuperAdmin());
      allow delete: if false;
    }`,
`    match /attendance_logs/{recordId} {
      allow read: if isSuperAdmin();
      allow read: if isAuthenticated() && getUserRole() in ['ADMIN', 'MANAGER', 'OWNER'] && (resource.data.businessId == getUserBusinessId() || resource.data.business_id == getUserBusinessId());
      allow read: if isAuthenticated() && resource.data.employeeId == request.auth.uid;
      allow read: if isAuthenticated() && resource.data.employeeId == getUserEmployeeId();
      allow create, update: if isAuthenticated() && (checkRequestBusinessId(getUserBusinessId()) || isSuperAdmin());
      allow delete: if false;
    }`
);

// For attendance_events
code = code.replace(
`    match /attendance_events/{id} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated() && (checkRequestBusinessId(getUserBusinessId()) || isSuperAdmin());
      allow update, delete: if false; // Tamper-proof audit events
    }`,
`    match /attendance_events/{id} {
      allow read: if isSuperAdmin();
      allow read: if isAuthenticated() && getUserRole() in ['ADMIN', 'MANAGER', 'OWNER'] && (resource.data.businessId == getUserBusinessId() || resource.data.business_id == getUserBusinessId());
      allow create: if isAuthenticated() && (checkRequestBusinessId(getUserBusinessId()) || isSuperAdmin());
      allow update, delete: if false; // Tamper-proof audit events
    }`
);

// For attendance
code = code.replace(
`    match /attendance/{id} {
      allow read: if isAuthenticated();
      allow create, update: if isAuthenticated() && (checkRequestBusinessId(getUserBusinessId()) || isSuperAdmin());
      allow delete: if false;
    }`,
`    match /attendance/{id} {
      allow read: if isSuperAdmin();
      allow read: if isAuthenticated() && getUserRole() in ['ADMIN', 'MANAGER', 'OWNER'] && (resource.data.businessId == getUserBusinessId() || resource.data.business_id == getUserBusinessId());
      allow create, update: if isAuthenticated() && (checkRequestBusinessId(getUserBusinessId()) || isSuperAdmin());
      allow delete: if false;
    }
    
    match /attendance_status/{id} {
      allow read: if isSuperAdmin();
      allow read: if isAuthenticated() && getUserRole() in ['ADMIN', 'MANAGER', 'OWNER'];
      allow read: if isAuthenticated() && id == request.auth.uid;
      allow read: if isAuthenticated() && id == getUserEmployeeId();
      allow create, update: if isAuthenticated();
      allow delete: if false;
    }`
);

fs.writeFileSync('firestore.rules', code);
