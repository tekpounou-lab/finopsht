import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface EmployeeBadgeCardProps {
  employee: any;
  businessName: string;
  branchName: string;
  departmentName: string;
  badgeToken: string;
  signature: string;
  qrPayload?: string;
}

export const EmployeeBadgeCard = React.forwardRef<HTMLDivElement, EmployeeBadgeCardProps>(
  ({ employee, businessName, branchName, departmentName, badgeToken, signature, qrPayload }, ref) => {
    const stableSignature = signature || `HMAC::${btoa((employee?.id || "") + (employee?.business_id || "")).substring(0, 16).toUpperCase()}`;
    const effectiveQrPayload = qrPayload || JSON.stringify({
      employee_id: employee?.id,
      business_id: employee?.business_id,
      branch_id: employee?.branchId || "BRANCH_DEFAULT",
      department_id: employee?.departmentId || "DEP_DEFAULT",
      role: employee?.role || "EMPLOYEE",
      signature: stableSignature,
    });

    return (
      <div 
        ref={ref} 
        className="w-[85.6mm] h-[54mm] bg-white text-slate-900 overflow-hidden flex shadow-lg relative print:shadow-none print:m-0"
        style={{
          // Standard CR80 badge sizes
          // width: 85.6mm, height: 54mm (Landscape mode)
          // Adjust based on typical thermal printers. Let's do portrait ID card:
          width: '54mm',
          height: '85.6mm',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box'
        }}
      >
        {/* Top Header */}
        <div className="bg-slate-950 px-3 py-2 text-cyan-400 flex flex-col items-center flex-shrink-0">
          <h2 className="text-[12px] font-black uppercase tracking-tight text-center leading-tight">
            {businessName}
          </h2>
          <span className="text-[8px] tracking-widest text-slate-300 font-mono">FINOPS IDENTITY</span>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col justify-between items-center p-3">
          {/* Avatar Area */}
          <div className="w-16 h-16 rounded-full bg-slate-200 border-2 border-slate-950 flex items-center justify-center overflow-hidden flex-shrink-0 mb-1">
            <span className="text-xl font-bold text-slate-500">
              {employee?.name ? employee.name.substring(0, 2).toUpperCase() : '??'}
            </span>
          </div>

          <div className="flex flex-col items-center text-center">
            <h3 className="text-xs font-bold uppercase text-slate-900 leading-tight">
              {employee?.name || 'Nom Inconnu'}
            </h3>
            <p className="text-[9px] text-slate-600 font-bold uppercase mt-0.5">
              {employee?.position || 'Poste'}
            </p>
            <p className="text-[8px] text-slate-500 font-mono mt-0.5">
              {departmentName} · {branchName}
            </p>
          </div>

          {/* QR Code Area - High contrast, compliant quiet zone & optimal module size for optical camera capture */}
          <div className="my-1.5 p-1 bg-white border border-slate-100 rounded-lg flex flex-col items-center shadow-xs">
            <QRCodeSVG 
              value={effectiveQrPayload}
              size={96}
              level={"M"}
              includeMargin={true}
              marginSize={2}
              fgColor="#000000"
              bgColor="#ffffff"
            />
          </div>

          {/* Footer details */}
          <div className="w-full mt-2 pt-1 border-t border-slate-200 flex flex-col items-center">
            <div className="text-[6px] font-mono text-slate-400 text-center uppercase">
              ID: {employee?.id} 
              <br/>
              S/N: {badgeToken}
            </div>
          </div>
        </div>
        
        {/* Bottom Bar */}
        <div className="h-2 bg-cyan-500 w-full flex-shrink-0"></div>
      </div>
    );
  }
);

EmployeeBadgeCard.displayName = 'EmployeeBadgeCard';
