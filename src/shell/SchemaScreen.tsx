import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  useNodesState, useEdgesState, type Node, type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Loader2, Search, Workflow, Table, Network, Boxes, Sparkles, FileText } from 'lucide-react';
import { supabase, type Department, type Employee, type FreeNode, type FreeEdge } from '@/core/supabase';
import { extractDbError } from '@/core/dbErrors';
import { toastError, toastSuccess, toastInfo } from '@/core/toast';
import { layoutOrgChart, layoutMatrix } from '@/schema/layout';
import { DeptNodeFactory } from '@/schema/DeptNode';
import { EmpNodeFactory } from '@/schema/EmpNode';
import { SidePanel } from '@/schema/SidePanel';
import { TEMPLATES } from '@/schema/templates';
import type { SchemaTab } from '@/schema/types';

interface SchemaData {
  depts: Department[];
  emps: Employee[];
  freeNodes: FreeNode[];
  freeEdges: FreeEdge[];
}

export function SchemaScreen() {
  return (
    <ReactFlowProvider>
      <SchemaScreenInner />
    </ReactFlowProvider>
  );
}

function SchemaScreenInner() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<SchemaTab>('org');
  const [data, setData] = useState<SchemaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [dRes, eRes, fnRes, feRes] = await Promise.all([
      supabase.from('departments').select('*').order('name'),
      supabase.from('employees').select('*').order('full_name'),
      supabase.from('free_nodes').select('*'),
      supabase.from('free_edges').select('*'),
    ]);
    if (dRes.error) { setError(t(extractDbError(dRes.error))); setLoading(false); return; }
    if (eRes.error) { setError(t(extractDbError(eRes.error))); setLoading(false); return; }
    setData({
      depts: (dRes.data as Department[]) ?? [],
      emps: (eRes.data as Employee[]) ?? [],
      freeNodes: (fnRes.data as FreeNode[]) ?? [],
      freeEdges: (feRes.data as FreeEdge[]) ?? [],
    });
    setLoading(false);
  }, [t]);

  useEffect(() => { void loadData(); }, [loadData]);

  // Build highlight set from search
  const highlightIds = useMemo(() => {
    if (!data || !search.trim()) return null;
    const q = search.toLowerCase();
    const ids = new Set<string>();
    for (const d of data.depts) {
      if (d.name.toLowerCase().includes(q)) ids.add(d.id);
    }
    for (const e of data.emps) {
      if (e.full_name.toLowerCase().includes(q) || e.position.toLowerCase().includes(q)) {
        ids.add(e.id);
      }
    }
    return ids;
  }, [data, search]);

  const handleSelectDept = useCallback((id: string) => {
    setSelectedDeptId(id);
    setSelectedEmpId(null);
    setPanelOpen(true);
  }, []);

  const handleSelectEmp = useCallback((id: string) => {
    setSelectedEmpId(id);
    setSelectedDeptId(null);
    setPanelOpen(true);
  }, []);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Build node types with current data
  const nodeTypes = useMemo(() => {
    if (!data) return undefined;
    return {
      deptNode: DeptNodeFactory(data.depts, data.emps, handleSelectDept, toggleCollapse, collapsed, highlightIds),
      empNode: EmpNodeFactory(data.emps, data.depts, handleSelectEmp, highlightIds),
      freeNode: FreeNodeFactory(data.freeNodes),
    };
  }, [data, handleSelectDept, handleSelectEmp, toggleCollapse, collapsed, highlightIds]);

  // Update layout when tab/data/collapsed changes
  useEffect(() => {
    if (!data) return;
    if (tab === 'org') {
      const { nodes: ns, edges: es } = layoutOrgChart(data.depts, data.emps, collapsed);
      setNodes(ns);
      setEdges(es);
    } else if (tab === 'matrix') {
      const { nodes: ns, edges: es } = layoutMatrix(data.emps);
      setNodes(ns);
      setEdges(es);
    } else if (tab === 'free') {
      const ns: Node[] = data.freeNodes.map((n) => {
        const pos = (n.pos as { x?: number; y?: number } | null) ?? { x: 0, y: 0 };
        return { id: n.id, type: 'freeNode', position: { x: pos.x ?? 0, y: pos.y ?? 0 }, data: { nodeId: n.id } };
      });
      const es: Edge[] = data.freeEdges.map((e) => ({
        id: e.id, source: e.source, target: e.target,
        style: e.kind === 'dashed' ? { stroke: '#94a3b8', strokeDasharray: '5 5' } : { stroke: '#94a3b8' },
      }));
      setNodes(ns);
      setEdges(es);
    }
  }, [data, tab, collapsed, setNodes, setEdges]);

  const selectedDept = data?.depts.find((d) => d.id === selectedDeptId) ?? null;
  const selectedEmp = data?.emps.find((e) => e.id === selectedEmpId) ?? null;

  const hasOrgData = data ? data.depts.length > 0 || data.emps.length > 0 : false;
  const hasFreeData = data ? data.freeNodes.length > 0 : false;

  const tabs: { id: SchemaTab; label: string; icon: typeof Network }[] = [
    { id: 'org', label: t('schema.tab_org'), icon: Network },
    { id: 'matrix', label: t('schema.tab_matrix'), icon: Workflow },
    { id: 'list', label: t('schema.tab_list'), icon: Table },
    { id: 'free', label: t('schema.tab_free'), icon: Boxes },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Workflow className="h-6 w-6 text-brand-600" />
            {t('schema.title')}
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{t('schema.subtitle')}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-ink-100 p-1 dark:bg-ink-800">
        {tabs.map((tb) => {
          const Icon = tb.icon;
          return (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors min-h-[44px] ${
                tab === tb.id
                  ? 'bg-white text-brand-700 shadow-sm dark:bg-ink-900 dark:text-brand-200'
                  : 'text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-100'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tb.label}</span>
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-ink-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}

      {error && !loading && (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <p className="mb-3 text-sm text-danger-600">{error}</p>
          <button onClick={() => void loadData()} className="btn-secondary">{t('common.retry')}</button>
        </div>
      )}

      {/* Empty schema */}
      {data && !loading && !error && !hasOrgData && tab !== 'free' && (
        <EmptySchema data={data} onCreated={loadData} />
      )}

      {/* Empty free-form */}
      {data && !loading && !error && tab === 'free' && !hasFreeData && !hasOrgData && (
        <EmptyFreeForm />
      )}

      {/* Search bar (for org/matrix/free) */}
      {data && !loading && !error && tab !== 'list' && (hasOrgData || hasFreeData) && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            className="input pl-10"
            placeholder={t('schema.search_placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Canvas (org/matrix/free) */}
      {data && !loading && !error && tab !== 'list' && (
        (tab === 'free' ? hasFreeData : hasOrgData) && (
          <div className="relative h-[70vh] min-h-[400px] overflow-hidden rounded-xl border border-ink-200 bg-ink-50 dark:border-ink-800 dark:bg-ink-950" dir="ltr">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              minZoom={0.1}
              maxZoom={2}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable
              proOptions={{ hideAttribution: true }}
              panOnDrag
              selectionOnDrag={false}
              panOnScroll={false}
              zoomOnPinch
              preventScrolling
            >
              <Background gap={16} size={1} />
              <Controls showInteractive={false} />
              <MiniMap
                pannable
                zoomable
                className="!bg-white dark:!bg-ink-900"
                nodeColor={(n) => {
                  if (n.type === 'deptNode') {
                    const dept = data.depts.find((d) => d.id === (n.data as { deptId: string }).deptId);
                    return dept?.color ?? '#94a3b8';
                  }
                  return '#2563eb';
                }}
              />
            </ReactFlow>
          </div>
        )
      )}

      {/* List tab */}
      {data && !loading && !error && tab === 'list' && (
        <ListTab depts={data.depts} emps={data.emps} onSelectEmp={handleSelectEmp} />
      )}

      {/* Auto-layout button for org chart */}
      {data && !loading && !error && tab === 'org' && hasOrgData && (
        <div className="flex justify-end">
          <button
            onClick={() => setCollapsed(new Set())}
            className="btn-secondary"
          >
            <Sparkles className="h-4 w-4" />
            {t('schema.auto_layout')}
          </button>
        </div>
      )}

      <SidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        selectedDept={selectedDept}
        selectedEmp={selectedEmp}
        depts={data?.depts ?? []}
        employees={data?.emps ?? []}
        onSelectEmp={handleSelectEmp}
        onSelectDept={handleSelectDept}
      />
    </div>
  );
}

function FreeNodeFactory(freeNodes: FreeNode[]) {
  const Component = memo(({ data }: { data: { nodeId: string } }) => {
    const node = freeNodes.find((n) => n.id === data.nodeId);
    if (!node) return null;
    return (
      <div
        className="flex min-w-[120px] flex-col rounded-lg border-2 border-ink-300 bg-white px-3 py-2 dark:border-ink-700 dark:bg-ink-900"
        dir="ltr"
      >
        <span className="text-xs font-medium capitalize text-ink-600 dark:text-ink-300">{node.type}</span>
        <span className="truncate text-sm font-semibold">{node.label}</span>
      </div>
    );
  });
  return Component;
}

function ListTab({
  depts, emps, onSelectEmp,
}: {
  depts: Department[];
  emps: Employee[];
  onSelectEmp: (id: string) => void;
}) {
  const { t } = useTranslation();
  const deptName = (id: string | null) => depts.find((d) => d.id === id)?.name ?? '—';
  const managerName = (id: string | null) => {
    if (!id) return '—';
    const m = emps.find((e) => e.id === id);
    return m ? (m.is_vacancy ? t('employees.vacancy_label') : m.full_name) : '—';
  };

  if (emps.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center py-12 text-center">
        <Table className="mb-3 h-10 w-10 text-ink-300" />
        <p className="text-sm text-ink-400">{t('schema.empty_list')}</p>
      </div>
    );
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-200 dark:border-ink-800">
            <th className="px-4 py-2 text-left font-medium text-ink-400">{t('employees.full_name')}</th>
            <th className="px-4 py-2 text-left font-medium text-ink-400">{t('employees.position')}</th>
            <th className="px-4 py-2 text-left font-medium text-ink-400">{t('employees.department')}</th>
            <th className="px-4 py-2 text-left font-medium text-ink-400">{t('employees.manager')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
          {emps.map((e) => (
            <tr
              key={e.id}
              onClick={() => onSelectEmp(e.id)}
              className="cursor-pointer hover:bg-ink-50 dark:hover:bg-ink-800/50"
            >
              <td className="px-4 py-2.5 font-medium">
                {e.is_vacancy ? (
                  <span className="text-warning-600">{t('employees.vacancy_label')}</span>
                ) : (
                  e.full_name
                )}
              </td>
              <td className="px-4 py-2.5 text-ink-500 dark:text-ink-400">{e.position || '—'}</td>
              <td className="px-4 py-2.5 text-ink-500 dark:text-ink-400">{deptName(e.department_id)}</td>
              <td className="px-4 py-2.5 text-ink-500 dark:text-ink-400">{managerName(e.manager_id)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptySchema({
  data, onCreated,
}: {
  data: SchemaData;
  onCreated: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(false);

  const applyTemplate = async (templateId: string) => {
    const tpl = TEMPLATES.find((x) => x.id === templateId);
    if (!tpl) return;

    if (data.depts.length > 0 || data.emps.length > 0 || data.freeNodes.length > 0) {
      toastInfo(t('schema.template_exists'));
      return;
    }

    if (!window.confirm(t('schema.template_confirm'))) return;

    setLoading(true);
    const { data: result, error } = await supabase.rpc('insert_template', {
      p_template: templateId,
      p_lang: i18n.language?.startsWith('ru') ? 'ru' : 'en',
    });
    if (error) {
      toastError(t(extractDbError(error)));
      setLoading(false);
      return;
    }
    if (result === 'exists') {
      toastInfo(t('schema.template_exists'));
    } else {
      toastSuccess(t('schema.template_loaded'));
    }
    setLoading(false);
    onCreated();
  };

  return (
    <div className="card flex flex-col items-center justify-center py-12 text-center">
      <FileText className="mb-3 h-10 w-10 text-ink-300" />
      <p className="mb-1 text-sm font-medium">{t('schema.empty_title')}</p>
      <p className="mb-4 text-sm text-ink-400">{t('schema.empty_desc')}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {TEMPLATES.map((tpl) => (
          <button
            key={tpl.id}
            onClick={() => void applyTemplate(tpl.id)}
            disabled={loading}
            className="btn-secondary"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {t(tpl.nameKey)}
          </button>
        ))}
      </div>
    </div>
  );
}

function EmptyFreeForm() {
  const { t } = useTranslation();
  return (
    <div className="card flex flex-col items-center justify-center py-12 text-center">
      <Boxes className="mb-3 h-10 w-10 text-ink-300" />
      <p className="text-sm text-ink-400">{t('schema.empty_free')}</p>
    </div>
  );
}
