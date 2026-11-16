import React from "react";
import { ExecutiveIntelligenceCenter as ExecutiveIntelligenceCenterImpl } from "../../../components/executive/ExecutiveIntelligenceCenter";

export const ExecutiveIntelligenceCenter: React.FC<{ usdToHtgRate?: number }> = (props) => {
  return <ExecutiveIntelligenceCenterImpl {...props} />;
};

export default ExecutiveIntelligenceCenter;
