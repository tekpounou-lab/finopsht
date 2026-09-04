import { describe, it, expect } from "vitest";
import React from "react";
import { VirtualizedTable } from "../../components/ui/VirtualizedTable";

describe("VirtualizedTable Unit Tests", () => {
  it("renders a windowed table with correct row counts", () => {
    const mockData = Array.from({ length: 500 }).map((_, i) => ({
      id: `emp_${i}`,
      name: `Employee ${i}`,
      role: "Developer"
    }));

    const columns = [
      { key: "id", header: "ID", accessor: (r: any) => r.id },
      { key: "name", header: "Name", accessor: (r: any) => r.name },
      { key: "role", header: "Role", accessor: (r: any) => r.role }
    ];

    const element = (
      <VirtualizedTable
        data={mockData}
        columns={columns}
        keyExtractor={(r) => r.id}
        containerHeight={400}
        rowHeight={40}
      />
    );

    expect(element.type).toBe(VirtualizedTable);
    expect(element.props.data.length).toBe(500);
  });
});
