import React from "react";
import { ERPEvent, Role } from "../types";
import { NotificationCenter } from "./notifications/NotificationCenter";

export interface NotificationsProps {
  currentRole: Role;
  currentUser?: { name: string; id: string };
  current_business_id: string;
  events?: ERPEvent[];
  onAddEvent?: (ev: ERPEvent) => void;
  readIds: string[];
  setReadIds: (updateFn: (prev: string[]) => string[]) => void;
}

export default function NotificationsCenter(props: NotificationsProps) {
  return <NotificationCenter {...props} />;
}
