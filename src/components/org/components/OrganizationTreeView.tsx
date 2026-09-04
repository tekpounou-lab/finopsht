import React, { useState } from "react";
import { TreeNode } from "../hooks/useOrganizationTree";
import { 
  Building2, 
  MapPin, 
  Layers, 
  Users, 
  ChevronRight, 
  ChevronDown, 
  Briefcase, 
  ShieldCheck, 
  UserCheck 
} from "lucide-react";

interface OrganizationTreeViewProps {
  treeData: TreeNode;
  selectedNode: TreeNode | null;
  onSelectNode: (node: TreeNode) => void;
  searchQuery?: string;
}

export const OrganizationTreeView: React.FC<OrganizationTreeViewProps> = ({
  treeData,
  selectedNode,
  onSelectNode,
  searchQuery = "",
}) => {
  return (
    <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 overflow-y-auto max-h-[680px]">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-indigo-400" />
          <span className="font-semibold text-white text-sm">Arborescence Organisationnelle</span>
        </div>
        <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
          {treeData.children?.length || 0} Succursale(s)
        </span>
      </div>

      <div className="space-y-1">
        <TreeNodeItem
          node={treeData}
          selectedNode={selectedNode}
          onSelectNode={onSelectNode}
          searchQuery={searchQuery}
          depth={0}
        />
      </div>
    </div>
  );
};

interface TreeNodeItemProps {
  node: TreeNode;
  selectedNode: TreeNode | null;
  onSelectNode: (node: TreeNode) => void;
  searchQuery: string;
  depth: number;
}

const TreeNodeItem: React.FC<TreeNodeItemProps> = ({
  node,
  selectedNode,
  onSelectNode,
  searchQuery,
  depth,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(depth < 2);
  const isSelected = selectedNode?.id === node.id && selectedNode?.type === node.type;

  const matchesSearch =
    !searchQuery ||
    node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (node.code && node.code.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (node.position && node.position.toLowerCase().includes(searchQuery.toLowerCase()));

  const hasChildren = node.children && node.children.length > 0;

  const getNodeIcon = () => {
    switch (node.type) {
      case "BUSINESS":
        return <Building2 className="w-4 h-4 text-indigo-400 shrink-0" />;
      case "BRANCH":
        return <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />;
      case "DEPARTMENT":
        return <Layers className="w-4 h-4 text-sky-400 shrink-0" />;
      case "EMPLOYEE":
        return node.role === "OWNER" ? (
          <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
        ) : (
          <UserCheck className="w-4 h-4 text-slate-400 shrink-0" />
        );
      default:
        return <Users className="w-4 h-4 text-slate-400 shrink-0" />;
    }
  };

  const getNodeBadge = () => {
    if (node.type === "BRANCH" && typeof node.count === "number") {
      return (
        <span className="text-[10px] text-emerald-400/80 bg-emerald-500/10 px-1.5 py-0.5 rounded ml-auto">
          {node.count} dép.
        </span>
      );
    }
    if (node.type === "DEPARTMENT" && typeof node.count === "number") {
      return (
        <span className="text-[10px] text-sky-400/80 bg-sky-500/10 px-1.5 py-0.5 rounded ml-auto">
          {node.count} staff
        </span>
      );
    }
    if (node.type === "EMPLOYEE" && node.role) {
      return (
        <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded ml-auto">
          {node.role}
        </span>
      );
    }
    return null;
  };

  if (!matchesSearch && !hasChildren) {
    return null;
  }

  return (
    <div>
      <div
        onClick={() => onSelectNode(node)}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
        className={`group flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer text-xs transition-colors ${
          isSelected
            ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-medium"
            : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
        }`}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="p-0.5 rounded hover:bg-slate-700/50 text-slate-400 hover:text-white"
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
        ) : (
          <span className="w-3.5" />
        )}

        {getNodeIcon()}

        <span className="truncate max-w-[180px]">{node.name}</span>

        {node.code && (
          <span className="text-[10px] text-slate-500 font-mono">[{node.code}]</span>
        )}

        {getNodeBadge()}
      </div>

      {hasChildren && isExpanded && (
        <div className="space-y-0.5 mt-0.5">
          {node.children!.map((child) => (
            <TreeNodeItem
              key={`${child.type}_${child.id}`}
              node={child}
              selectedNode={selectedNode}
              onSelectNode={onSelectNode}
              searchQuery={searchQuery}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};
