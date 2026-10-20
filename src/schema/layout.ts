import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';
import type { Department, Employee } from '@/core/supabase';

const NODE_W = 200;
const DEPT_H = 64;
const EMP_H = 80;

type PosField = 'pos_org' | 'pos_matrix' | 'pos_free';

function getSavedPos(row: { pos_org: unknown; pos_matrix: unknown; pos_free: unknown }, field: PosField): { x: number; y: number } | null {
  const raw = row[field] as { x?: number; y?: number } | null;
  if (raw && typeof raw.x === 'number' && typeof raw.y === 'number') return { x: raw.x, y: raw.y };
  return null;
}

export function layoutOrgChart(
  depts: Department[],
  employees: Employee[],
  collapsed: Set<string>,
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 60, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  const visibleDepts = depts.filter((d) => {
    // Hide if ancestor is collapsed
    let parent = d.parent_id;
    while (parent) {
      if (collapsed.has(parent)) return false;
      const parentNode = depts.find((x) => x.id === parent);
      parent = parentNode?.parent_id ?? null;
    }
    return true;
  });

  for (const d of visibleDepts) {
    g.setNode(`dept:${d.id}`, { width: NODE_W, height: DEPT_H });
    if (d.parent_id) {
      const parentVisible = visibleDepts.some((x) => x.id === d.parent_id);
      if (parentVisible) {
        g.setEdge(`dept:${d.parent_id}`, `dept:${d.id}`);
      }
    }
  }

  // Employees shown under their department (if dept not collapsed)
  const visibleEmps = employees.filter(
    (e) => e.department_id && visibleDepts.some((d) => d.id === e.department_id && !collapsed.has(d.id)),
  );
  for (const e of visibleEmps) {
    g.setNode(`emp:${e.id}`, { width: NODE_W, height: EMP_H });
    if (e.department_id) g.setEdge(`dept:${e.department_id}`, `emp:${e.id}`);
  }

  dagre.layout(g);

  const nodes: Node[] = [];
  for (const d of visibleDepts) {
    const pos = g.node(`dept:${d.id}`);
    const saved = getSavedPos(d, 'pos_org');
    if (pos) nodes.push({ id: `dept:${d.id}`, type: 'deptNode', position: saved ?? { x: pos.x - NODE_W / 2, y: pos.y - DEPT_H / 2 }, data: { deptId: d.id } });
  }
  for (const e of visibleEmps) {
    const pos = g.node(`emp:${e.id}`);
    const saved = getSavedPos(e, 'pos_org');
    if (pos) nodes.push({ id: `emp:${e.id}`, type: 'empNode', position: saved ?? { x: pos.x - NODE_W / 2, y: pos.y - EMP_H / 2 }, data: { empId: e.id } });
  }

  const edges: Edge[] = [];
  g.edges().forEach((edgeObj) => {
    const sourceLabel = g.node(edgeObj.v).label as string;
    const targetLabel = g.node(edgeObj.w).label as string;
    void sourceLabel; void targetLabel;
    edges.push({
      id: `e:${edgeObj.v}-${edgeObj.w}`,
      source: edgeObj.v,
      target: edgeObj.w,
      type: 'smoothstep',
      style: { stroke: '#94a3b8', strokeWidth: 1.5 },
    });
  });

  return { nodes, edges };
}

export function layoutMatrix(
  employees: Employee[],
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 70, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const e of employees) {
    g.setNode(`emp:${e.id}`, { width: NODE_W, height: EMP_H });
  }
  for (const e of employees) {
    if (e.manager_id && employees.some((m) => m.id === e.manager_id)) {
      g.setEdge(`emp:${e.manager_id}`, `emp:${e.id}`);
    }
  }

  dagre.layout(g);

  const nodes: Node[] = employees.map((e) => {
    const pos = g.node(`emp:${e.id}`);
    const saved = getSavedPos(e, 'pos_matrix');
    return {
      id: `emp:${e.id}`,
      type: 'empNode',
      position: saved ?? (pos ? { x: pos.x - NODE_W / 2, y: pos.y - EMP_H / 2 } : { x: 0, y: 0 }),
      data: { empId: e.id },
    };
  });

  const edges: Edge[] = [];
  for (const e of employees) {
    if (e.manager_id && employees.some((m) => m.id === e.manager_id)) {
      edges.push({
        id: `mgr:${e.manager_id}-${e.id}`,
        source: `emp:${e.manager_id}`,
        target: `emp:${e.id}`,
        type: 'smoothstep',
        style: { stroke: '#2563eb', strokeWidth: 2 },
      });
    }
    if (e.project_manager_id && employees.some((m) => m.id === e.project_manager_id)) {
      edges.push({
        id: `pm:${e.project_manager_id}-${e.id}`,
        source: `emp:${e.project_manager_id}`,
        target: `emp:${e.id}`,
        type: 'smoothstep',
        style: { stroke: '#d97706', strokeWidth: 1.5, strokeDasharray: '5 5' },
      });
    }
  }

  return { nodes, edges };
}
