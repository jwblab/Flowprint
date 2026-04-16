import { useCallback, useEffect, useMemo, useState } from 'react';
import dagre from 'dagre';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api';
import EdgeModal from '../components/EdgeModal';
import GraphPanel from '../components/GraphPanel';
import EntityModal from '../components/EntityModal';
import PipelineModal from '../components/PipelineModal';
import { useEntityTypes } from '../context/EntityTypesContext';
import { useTheme } from '../context/ThemeContext';

// ---------------------------------------------------------------------------
// Context menu item
// ---------------------------------------------------------------------------
function CtxItem({ label, onClick, danger }) {
  return (
    <button
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '7px 14px', fontSize: 13, background: 'none', border: 'none',
        color: danger ? '#e74c3c' : 'var(--text)', cursor: 'pointer',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Node components
// ---------------------------------------------------------------------------
function FlowNode({ data, selected }) {
  return (
    <div className={`rf-node ${selected ? 'selected' : ''} ${data.dimmed ? 'dimmed' : ''}`} style={{ borderColor: data.color }}>
      <Handle type="target" position={Position.Left} style={{ background: data.color, border: 'none', width: 8, height: 8 }} />
      <div className="rf-node-type" style={{ color: data.color }}>{data.typeLabel}</div>
      <div className="rf-node-name">{data.label}</div>
      <Handle type="source" position={Position.Right} style={{ background: data.color, border: 'none', width: 8, height: 8 }} />
    </div>
  );
}

const STATUS_COLORS = { active: '#10b981', inactive: '#f59e0b', deprecated: '#ef4444' };

function PipelineNode({ data }) {
  const color = STATUS_COLORS[data.status] ?? '#f59e0b';
  return (
    <div style={{
      width: '100%',
      height: '100%',
      borderRadius: 14,
      border: `2px solid ${color}35`,
      background: `${color}07`,
      boxSizing: 'border-box',
    }}>
      <div style={{
        padding: '0 14px',
        height: 44,
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        borderBottom: `1px solid ${color}22`,
        borderRadius: '12px 12px 0 0',
        background: `${color}14`,
      }}>
        <span style={{ fontSize: 11, color }}>▶</span>
        <span style={{ fontSize: 12, fontWeight: 700, color, letterSpacing: 0.3 }}>{data.label}</span>
        <span style={{
          marginLeft: 6, fontSize: 9, fontWeight: 500, padding: '2px 7px',
          borderRadius: 99, background: `${color}25`, color,
        }}>
          {data.status}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>
          {data.entityCount} {data.entityCount === 1 ? 'entity' : 'entities'}
        </span>
      </div>
    </div>
  );
}

const nodeTypes = { entity: FlowNode, pipeline: PipelineNode };

// Fits the view whenever a focus changes (must live inside <ReactFlow>)
function FitOnFocus({ focusId, focusPipelineId }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (!focusId && !focusPipelineId) return;
    // Small delay so React Flow has applied node visibility before fitting
    const t = setTimeout(() => fitView({ duration: 350, padding: 0.15 }), 50);
    return () => clearTimeout(t);
  }, [focusId, focusPipelineId, fitView]);
  return null;
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------
const ENTITY_W = 190;
const ENTITY_H = 68;
const PIPELINE_PAD_TOP    = 56;   // header height + breathing room
const PIPELINE_PAD_SIDES  = 32;
const PIPELINE_PAD_BOTTOM = 28;
const PIPELINE_GAP        = 80;   // horizontal gap between top-level pipeline boxes
const CHILD_PIPELINE_GAP  = 12;   // gap between child pipelines within a parent
const CHILD_SECTION_PAD   = 14;   // space between entity area and child pipelines area

// ---------------------------------------------------------------------------
// Dagre layout for entities inside a single pipeline container
// Returns { positions: { entityId: {x,y} }, width, height }
// Positions are relative to pipeline top-left corner.
// ---------------------------------------------------------------------------
function dagreLayoutPipeline(entities, rfEdges) {
  if (entities.length === 0) {
    return { positions: {}, width: 280, height: PIPELINE_PAD_TOP + 60 };
  }

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 44, ranksep: 90 });

  entities.forEach(e => g.setNode(e.id, { width: ENTITY_W, height: ENTITY_H }));
  rfEdges.forEach(edge => {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      try { g.setEdge(edge.source, edge.target); } catch (_) { /* ignore dupe */ }
    }
  });
  dagre.layout(g);

  // Dagre returns center coordinates; convert to top-left and normalise
  const placed = entities.map(e => {
    const pos = g.node(e.id);
    return { id: e.id, left: (pos?.x ?? 0) - ENTITY_W / 2, top: (pos?.y ?? 0) - ENTITY_H / 2 };
  });

  const minLeft = Math.min(...placed.map(p => p.left));
  const minTop  = Math.min(...placed.map(p => p.top));

  const positions = {};
  let maxRX = 0, maxRY = 0;
  for (const p of placed) {
    const rx = p.left - minLeft + PIPELINE_PAD_SIDES;
    const ry = p.top  - minTop  + PIPELINE_PAD_TOP;
    positions[p.id] = { x: rx, y: ry };
    maxRX = Math.max(maxRX, rx + ENTITY_W);
    maxRY = Math.max(maxRY, ry + ENTITY_H);
  }

  return {
    positions,
    width:  maxRX + PIPELINE_PAD_SIDES,
    height: maxRY + PIPELINE_PAD_BOTTOM,
  };
}

// Lay out disconnected standalone entities in a simple grid below all pipelines
function standaloneLayout(entities, baseY) {
  const COLS = 4, COL_W = 220, ROW_H = 100;
  return Object.fromEntries(entities.map((e, i) => [
    e.id,
    { x: (i % COLS) * COL_W + 60, y: baseY + Math.floor(i / COLS) * ROW_H },
  ]));
}

// ---------------------------------------------------------------------------
// Build all RF nodes from entities + pipelines + already-converted RF edges
//
// Layout rules:
// • Entity positions inside pipelines → always dagre (old flat positions are stale)
// • Child pipelines appear nested inside their parent pipeline container
// • Top-level pipeline positions → stored DB value, or auto-arranged if new
// • Standalone entity positions → stored DB value, or grid if new
// ---------------------------------------------------------------------------
function buildGraphData(entities, pipelines, rfEdges) {
  const topLevel = pipelines.filter(p => !p.parent_pipeline_id);
  const childrenOf = {};   // parentId → [pipeline]
  for (const p of pipelines) {
    if (p.parent_pipeline_id) {
      (childrenOf[p.parent_pipeline_id] ??= []).push(p);
    }
  }

  // Group entities by ALL pipelines they belong to (entity may appear in multiple)
  const membersByPipeline = Object.fromEntries(pipelines.map(p => [p.id, []]));
  const inAnyPipeline = new Set();
  for (const p of pipelines) {
    for (const eid of (p.entity_ids ?? [])) {
      const e = entities.find(en => en.id === eid);
      if (e) { membersByPipeline[p.id].push(e); inAnyPipeline.add(eid); }
    }
  }
  const standalone = entities.filter(e => !inAnyPipeline.has(e.id));

  // Dagre layout for each pipeline's own entities
  const entityLayouts = {};   // pipelineId → { positions, width, height }
  for (const p of pipelines) {
    const members = membersByPipeline[p.id];
    const memberIds = new Set(members.map(e => e.id));
    const internal = rfEdges.filter(e => memberIds.has(e.source) && memberIds.has(e.target));
    entityLayouts[p.id] = dagreLayoutPipeline(members, internal);
  }

  // Compute final container size for each pipeline, and child-relative positions.
  // Layout: children stack VERTICALLY on the LEFT; parent's own entities sit to the RIGHT.
  // Process children before parents so parent sizes can account for child sizes.
  const pipelineSizes = {};   // pipelineId → { width, height }
  const childRelPos   = {};   // childPipelineId → { x, y } relative to parent

  // Leaf / child pipelines: size = just their entity layout
  for (const p of pipelines) {
    if (p.parent_pipeline_id) {
      pipelineSizes[p.id] = { width: entityLayouts[p.id].width, height: entityLayouts[p.id].height };
    }
  }

  // Top-level pipelines: combine children column (left) + own entity column (right)
  for (const p of topLevel) {
    const eLayout  = entityLayouts[p.id];
    const children = childrenOf[p.id] ?? [];
    const hasOwnEntities = Object.keys(eLayout.positions).length > 0;

    if (children.length === 0) {
      // No children — just own entity layout
      pipelineSizes[p.id] = { width: eLayout.width, height: eLayout.height };
    } else {
      // Stack children VERTICALLY, starting just below the header
      let childY = PIPELINE_PAD_TOP;
      let maxChildW = 0;
      for (const child of children) {
        const { width: cw, height: ch } = pipelineSizes[child.id];
        childRelPos[child.id] = { x: PIPELINE_PAD_SIDES, y: childY };
        childY += ch + CHILD_PIPELINE_GAP;
        maxChildW = Math.max(maxChildW, cw);
      }
      const childrenColH = childY - CHILD_PIPELINE_GAP; // bottom of last child (relative to container top-left)

      if (hasOwnEntities) {
        // Own entities shifted RIGHT of the children column
        const shiftX = maxChildW + CHILD_SECTION_PAD;
        const shiftedPositions = {};
        for (const [eid, pos] of Object.entries(eLayout.positions)) {
          shiftedPositions[eid] = { x: pos.x + shiftX, y: pos.y };
        }
        // Persist shifted positions so entity nodes are placed correctly
        entityLayouts[p.id] = { ...eLayout, positions: shiftedPositions };

        pipelineSizes[p.id] = {
          width:  shiftX + eLayout.width,
          height: Math.max(childrenColH + PIPELINE_PAD_BOTTOM, eLayout.height),
        };
      } else {
        // No own entities — width = children column only
        pipelineSizes[p.id] = {
          width:  PIPELINE_PAD_SIDES + maxChildW + PIPELINE_PAD_SIDES,
          height: childrenColH + PIPELINE_PAD_BOTTOM,
        };
      }
    }
  }

  // Arrange top-level pipeline containers on the canvas
  let autoY = 60;
  const topLevelPos = {};
  for (const p of topLevel) {
    const unpositioned = p.pos_x === 0 && p.pos_y === 0;
    const { height } = pipelineSizes[p.id];
    if (unpositioned) {
      topLevelPos[p.id] = { x: 60, y: autoY };
    } else {
      topLevelPos[p.id] = { x: p.pos_x, y: p.pos_y };
    }
    autoY = Math.max(autoY + height + PIPELINE_GAP, topLevelPos[p.id].y + height + PIPELINE_GAP);
  }

  // Build RF nodes
  const rfNodes = [];

  for (const p of topLevel) {
    const { width, height } = pipelineSizes[p.id];
    rfNodes.push({
      id: `pipeline:${p.id}`,
      type: 'pipeline',
      position: topLevelPos[p.id],
      style: { width, height },
      data: { label: p.name, status: p.status, pipelineId: p.id, entityCount: membersByPipeline[p.id].length },
      zIndex: 0,
    });

    // Child pipeline containers nested inside this parent
    for (const child of (childrenOf[p.id] ?? [])) {
      const { width: cw, height: ch } = pipelineSizes[child.id];
      rfNodes.push({
        id: `pipeline:${child.id}`,
        type: 'pipeline',
        parentId: `pipeline:${p.id}`,
        extent: 'parent',
        position: childRelPos[child.id],
        style: { width: cw, height: ch },
        data: { label: child.name, status: child.status, pipelineId: child.id, entityCount: membersByPipeline[child.id].length },
        zIndex: 1,
      });
    }
  }

  // Entity nodes — one per pipeline membership (compound ID = entityId::pipelineId)
  for (const p of pipelines) {
    const layout = entityLayouts[p.id];
    for (const e of membersByPipeline[p.id]) {
      rfNodes.push({
        id: `${e.id}::${p.id}`,
        type: 'entity',
        parentId: `pipeline:${p.id}`,
        extent: 'parent',
        position: layout.positions[e.id] ?? { x: PIPELINE_PAD_SIDES, y: PIPELINE_PAD_TOP },
        data: { label: e.name, typeLabel: e.type, color: '#64748b' },
        zIndex: 2,
      });
    }
  }

  // Standalone entities (no pipeline) — below all pipeline containers
  const maxPipelineBottom = topLevel.length
    ? Math.max(...topLevel.map(p => topLevelPos[p.id].y + pipelineSizes[p.id].height))
    : 60;
  const standalonePosMap = standaloneLayout(standalone, maxPipelineBottom + PIPELINE_GAP);
  for (const e of standalone) {
    const unpositioned = e.pos_x === 0 && e.pos_y === 0;
    rfNodes.push({
      id: e.id,
      type: 'entity',
      position: unpositioned ? standalonePosMap[e.id] : { x: e.pos_x, y: e.pos_y },
      data: { label: e.name, typeLabel: e.type, color: '#64748b' },
      zIndex: 2,
    });
  }

  return rfNodes;
}

const BIDI_COLOR = '#f59e0b'; // amber — bidirectional edges

function toRFEdges(edges, edgeColor = '#ffffff', labelBg = '#1a1d27') {
  const seen = new Set();
  const result = [];
  for (const e of edges) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const reverse = edges.find(r => r.source_id === e.target_id && r.target_id === e.source_id && !seen.has(r.id));
    if (reverse) {
      seen.add(reverse.id);
      result.push({
        id: e.id,
        source: e.source_id,
        target: e.target_id,
        label: e.label || reverse.label || undefined,
        markerStart: { type: MarkerType.ArrowClosed, color: BIDI_COLOR },
        markerEnd:   { type: MarkerType.ArrowClosed, color: BIDI_COLOR },
        style: { stroke: BIDI_COLOR, strokeWidth: 1.5 },
        labelStyle: { fill: '#7c85a8', fontSize: 11 },
        labelBgStyle: { fill: labelBg },
        data: { reverseId: reverse.id },
      });
    } else {
      result.push({
        id: e.id,
        source: e.source_id,
        target: e.target_id,
        label: e.label || undefined,
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor },
        style: { stroke: edgeColor, strokeWidth: 1.5 },
        labelStyle: { fill: '#7c85a8', fontSize: 11 },
        labelBgStyle: { fill: labelBg },
      });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function GraphView({ entities, pipelines = [], onRefresh, onNew, onNewPipeline }) {
  const { theme } = useTheme();
  const edgeColor = theme === 'light' ? '#374151' : '#ffffff';
  const labelBg   = theme === 'light' ? '#f5f6fa' : '#1a1d27';
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [edgeModal, setEdgeModal] = useState(false);
  const [edgeError, setEdgeError] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const [panelItem, setPanelItem] = useState(null); // { type: 'entity'|'edge'|'pipeline', id }
  const [contextMenu, setContextMenu] = useState(null);
  const [editingEntityId, setEditingEntityId] = useState(null);
  const [editingPipelineId, setEditingPipelineId] = useState(null);
  const [editingEdgeId, setEditingEdgeId] = useState(null);
  const [focusPipelineId, setFocusPipelineId] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { nodeColors, typeLabels } = useEntityTypes();

  // Restore focus/filter state when returning from entity or pipeline page
  useEffect(() => {
    if (location.state?.from === 'graph') {
      if (location.state.focusId !== undefined) setFocusId(location.state.focusId || null);
      if (location.state.focusPipelineId !== undefined) setFocusPipelineId(location.state.focusPipelineId || null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Map from entity DB ID → ordered list of pipeline IDs it belongs to
  const pipelinesForEntity = useMemo(() => {
    const map = {};
    for (const p of pipelines) {
      for (const eid of (p.entity_ids ?? [])) {
        (map[eid] ??= []).push(p.id);
      }
    }
    return map;
  }, [pipelines]);

  // IDs reachable from focused entity (for focus mode)
  const focusVisibleIds = useMemo(() => {
    if (!focusId) return null;
    const visited = new Set([focusId]);
    const queue = [focusId];
    while (queue.length) {
      const id = queue.shift();
      edges.forEach(e => {
        if (e.source === id && !visited.has(e.target)) { visited.add(e.target); queue.push(e.target); }
        if (e.target === id && !visited.has(e.source)) { visited.add(e.source); queue.push(e.source); }
      });
    }
    return visited;
  }, [focusId, edges]);

  const { highlightedNodeIds, highlightedEdgeIds } = useMemo(() => {
    if (!panelItem || panelItem.type !== 'entity') return { highlightedNodeIds: null, highlightedEdgeIds: null };
    const entityId = panelItem.id;
    const nodeIds = new Set([entityId]);
    const edgeIds = new Set();
    edges.forEach(e => {
      if (e.source === entityId || e.target === entityId) {
        edgeIds.add(e.id);
        nodeIds.add(e.source);
        nodeIds.add(e.target);
      }
    });
    return { highlightedNodeIds: nodeIds, highlightedEdgeIds: edgeIds };
  }, [panelItem, edges]);

  // All pipeline IDs in the focused pipeline's subtree (focused + all descendants)
  const focusedPipelineIds = useMemo(() => {
    if (!focusPipelineId) return null;
    const ids = new Set([focusPipelineId]);
    const queue = [focusPipelineId];
    while (queue.length) {
      const curr = queue.shift();
      pipelines.filter(p => p.parent_pipeline_id === curr).forEach(child => {
        ids.add(child.id);
        queue.push(child.id);
      });
    }
    return ids;
  }, [focusPipelineId, pipelines]);

  // Entity IDs belonging to the focused pipeline subtree
  const focusedPipelineEntityIds = useMemo(() => {
    if (!focusedPipelineIds) return null;
    const ids = new Set();
    pipelines.filter(p => focusedPipelineIds.has(p.id)).forEach(p => {
      (p.entity_ids ?? []).forEach(eid => ids.add(eid));
    });
    return ids;
  }, [focusedPipelineIds, pipelines]);

  const visibleNodes = useMemo(() => {
    return nodes.map(n => {
      if (n.type === 'pipeline') {
        let hidden = false;
        if (focusPipelineId) {
          // Pipeline focus: hide every container not in the focused subtree
          hidden = !focusedPipelineIds.has(n.data.pipelineId);
        } else if (focusVisibleIds) {
          // Entity focus: hide containers that have NO members in the focus graph
          const p = pipelines.find(p => p.id === n.data.pipelineId);
          hidden = !(p?.entity_ids ?? []).some(eid => focusVisibleIds.has(eid));
        }
        return { ...n, hidden };
      }
      const eid = n.id.split('::')[0];
      const entity = entities.find(e => e.id === eid);
      const hiddenByFocus         = focusVisibleIds && !focusVisibleIds.has(eid);
      const hiddenByPipelineFocus = focusedPipelineEntityIds && !focusedPipelineEntityIds.has(eid);
      const dimmed = highlightedNodeIds ? !highlightedNodeIds.has(eid) : false;
      const color = nodeColors[entity?.type] || '#64748b';
      const typeLabel = typeLabels[entity?.type] || entity?.type || n.data.typeLabel;
      return {
        ...n,
        hidden: !!(hiddenByFocus || hiddenByPipelineFocus),
        data: { ...n.data, dimmed, color, typeLabel },
      };
    });
  }, [nodes, focusId, focusVisibleIds, focusedPipelineEntityIds, focusedPipelineIds, focusPipelineId, entities, highlightedNodeIds, nodeColors, typeLabels]);

  const visibleEdges = useMemo(() => {
    // Entity nodes now use compound IDs (entityId::pipelineId); extract entity IDs for visibility checks
    const visibleEntityIds = new Set(
      visibleNodes.filter(n => !n.hidden && n.type !== 'pipeline').map(n => n.id.split('::')[0])
    );

    return edges.map(e => {
      const hidden = !visibleEntityIds.has(e.source) || !visibleEntityIds.has(e.target);

      // Map plain entity IDs → compound node IDs for React Flow to connect
      const srcPids = pipelinesForEntity[e.source] ?? [];
      const tgtPids = pipelinesForEntity[e.target] ?? [];
      const sharedPid = srcPids.find(pid => tgtPids.includes(pid));
      const rfSource = sharedPid ? `${e.source}::${sharedPid}` : (srcPids[0] ? `${e.source}::${srcPids[0]}` : e.source);
      const rfTarget = sharedPid ? `${e.target}::${sharedPid}` : (tgtPids[0] ? `${e.target}::${tgtPids[0]}` : e.target);
      const mapped = { ...e, source: rfSource, target: rfTarget };

      if (highlightedEdgeIds) {
        const lit = highlightedEdgeIds.has(e.id);
        const isBidi = !!e.data?.reverseId;
        const dimColor = isBidi ? BIDI_COLOR : edgeColor;
        const activeColor = lit ? '#818cf8' : dimColor;
        return {
          ...mapped, hidden,
          style: lit ? { stroke: '#818cf8', strokeWidth: 2.5 } : { stroke: dimColor, strokeWidth: 1.5, opacity: 0.15 },
          markerEnd: { type: MarkerType.ArrowClosed, color: activeColor },
          ...(isBidi ? { markerStart: { type: MarkerType.ArrowClosed, color: activeColor } } : {}),
        };
      }
      return { ...mapped, hidden };
    });
  }, [edges, visibleNodes, highlightedEdgeIds, pipelinesForEntity]);

  useEffect(() => {
    async function load() {
      const dbEdges = await api.getEdges();
      const rfEdges = toRFEdges(dbEdges, edgeColor, labelBg);
      const rfNodes = buildGraphData(entities, pipelines, rfEdges);
      setNodes(rfNodes);
      setEdges(rfEdges);
    }
    load();
  }, [entities, pipelines]);

  const onNodeDragStop = useCallback(async (_, node) => {
    if (node.type === 'pipeline' && !node.parentId) {
      // Only top-level pipeline positions are persisted; child pipelines are always layout-computed
      await api.updatePipeline(node.data.pipelineId, {
        pos_x: node.position.x,
        pos_y: node.position.y,
      });
    } else if (node.type === 'entity' && !node.parentId) {
      // Standalone entity — save absolute position
      await api.updateEntity(node.id, { pos_x: node.position.x, pos_y: node.position.y });
    }
    // Entities inside pipelines and child pipelines: layout-managed, no DB save
  }, []);

  const onSelectionDragStop = useCallback(async (_, selectedNodes) => {
    await Promise.all(selectedNodes.map(n => {
      if (n.type === 'pipeline' && !n.parentId) {
        return api.updatePipeline(n.data.pipelineId, { pos_x: n.position.x, pos_y: n.position.y });
      }
      if (n.type === 'entity' && !n.parentId) {
        return api.updateEntity(n.id, { pos_x: n.position.x, pos_y: n.position.y });
      }
      return Promise.resolve();
    }));
  }, []);

  const onNodeClick = useCallback((_, node) => {
    if (node.type === 'pipeline') {
      setPanelItem({ type: 'pipeline', id: node.data.pipelineId });
    } else {
      setPanelItem({ type: 'entity', id: node.id.split('::')[0] });
    }
  }, []);

  const onEdgeClick = useCallback((_, edge) => {
    setPanelItem({ type: 'edge', id: edge.id });
  }, []);

  const onPaneClick = useCallback(() => {
    setPanelItem(null);
    setContextMenu(null);
  }, []);

  const onNodeContextMenu = useCallback((event, node) => {
    event.preventDefault();
    if (node.type === 'pipeline') {
      setContextMenu({ type: 'pipeline', id: node.data.pipelineId, x: event.clientX, y: event.clientY });
    } else {
      setContextMenu({ type: 'node', id: node.id.split('::')[0], x: event.clientX, y: event.clientY });
    }
  }, []);

  const onEdgeContextMenu = useCallback((event, edge) => {
    event.preventDefault();
    setContextMenu({ type: 'edge', id: edge.id, x: event.clientX, y: event.clientY });
  }, []);

  const onNodeDoubleClick = useCallback((_, node) => {
    if (node.type === 'pipeline') {
      navigate(`/pipeline/${node.data.pipelineId}`, { state: { from: 'graph', focusId, focusPipelineId } });
    } else {
      navigate(`/entity/${node.id.split('::')[0]}`, { state: { from: 'graph', focusId, focusPipelineId } });
    }
  }, [navigate, focusId, focusPipelineId]);

  async function handleContextDeletePipeline(id) {
    const pipeline = pipelines.find(p => p.id === id);
    if (!confirm(`Delete pipeline "${pipeline?.name}"? Member entities and edges will not be deleted.`)) return;
    await api.deletePipeline(id);
    onRefresh();
  }

  async function handleContextEditPipelineSave(form) {
    await api.updatePipeline(editingPipelineId, form);
    onRefresh();
    setEditingPipelineId(null);
  }

  async function handleContextDeleteEntity(id) {
    const entity = entities.find(e => e.id === id);
    if (!confirm(`Delete "${entity?.name}"? This will also remove all its dependencies.`)) return;
    await api.deleteEntity(id);
    onRefresh();
  }

  async function handleContextEditSave(form) {
    await api.updateEntity(editingEntityId, form);
    if (form.pipeline_ids !== undefined) {
      const before = new Set(pipelines.filter(p => p.entity_ids?.includes(editingEntityId)).map(p => p.id));
      const after  = new Set(form.pipeline_ids ?? []);
      const toAdd    = [...after].filter(id => !before.has(id));
      const toRemove = [...before].filter(id => !after.has(id));
      await Promise.all([
        ...toAdd.map(pid    => api.addEntityToPipeline(pid, editingEntityId)),
        ...toRemove.map(pid => api.removeEntityFromPipeline(pid, editingEntityId)),
      ]);
    }
    onRefresh();
    setEditingEntityId(null);
  }

  async function handleEditEdgeSave(form) {
    await api.updateEdge(editingEdgeId, { label: form.label });
    // Sync pipeline memberships
    const before = new Set(pipelines.filter(p => p.edge_ids?.includes(editingEdgeId)).map(p => p.id));
    const after  = new Set(form.pipeline_ids ?? []);
    const toAdd    = [...after].filter(id => !before.has(id));
    const toRemove = [...before].filter(id => !after.has(id));
    await Promise.all([
      ...toAdd.map(pid    => api.addEdgeToPipeline(pid, editingEdgeId)),
      ...toRemove.map(pid => api.removeEdgeFromPipeline(pid, editingEdgeId)),
    ]);
    setEdges(eds => eds.map(e => e.id === editingEdgeId ? { ...e, label: form.label || undefined } : e));
    if (toAdd.length || toRemove.length) onRefresh();
    setEditingEdgeId(null);
  }

  const onConnect = useCallback(async (params) => {
    // params.source/target are compound IDs (entityId::pipelineId) — extract entity DB IDs
    const srcEntityId = params.source.split('::')[0];
    const tgtEntityId = params.target.split('::')[0];

    // Silently ignore if exact direction already exists, or if this would be the reverse
    // of an already-merged bidirectional edge (both directions already in DB)
    const fwdExists = edges.some(e => e.source === srcEntityId && e.target === tgtEntityId);
    const revBidiExists = edges.some(e => e.source === tgtEntityId && e.target === srcEntityId && e.data?.reverseId);
    if (fwdExists || revBidiExists) return;

    const existingReverse = edges.find(e => e.source === tgtEntityId && e.target === srcEntityId);

    try {
      const edge = await api.createEdge({ source_id: srcEntityId, target_id: tgtEntityId });
      if (existingReverse) {
        // Completing a bidirectional pair — merge immediately, no refresh needed
        setEdges(eds => eds.map(e => e.id === existingReverse.id ? {
          ...e,
          markerStart: { type: MarkerType.ArrowClosed, color: BIDI_COLOR },
          markerEnd:   { type: MarkerType.ArrowClosed, color: BIDI_COLOR },
          style: { stroke: BIDI_COLOR, strokeWidth: 1.5 },
          data: { reverseId: edge.id },
        } : e));
      } else {
        setEdges(eds => addEdge(toRFEdges([edge], edgeColor, labelBg)[0], eds));
      }
    } catch (e) {
      setEdgeError(e.message);
      setEdgeModal(true);
    }
  }, [edges]);

  async function handleAddEdge(form) {
    try {
      const edge = await api.createEdge(form);
      if (form.pipeline_ids?.length) {
        await Promise.all(form.pipeline_ids.map(pid => api.addEdgeToPipeline(pid, edge.id)));
        onRefresh();
      }
      setEdges(eds => [...eds, toRFEdges([edge], edgeColor, labelBg)[0]]);
      setEdgeModal(false);
      setEdgeError(null);
    } catch (e) {
      setEdgeError(e.message);
    }
  }

  async function handleEdgeDelete(deleted) {
    for (const e of deleted) {
      await api.deleteEdge(e.id);
      if (e.data?.reverseId) await api.deleteEdge(e.data.reverseId);
    }
  }

  // Re-run full layout, resetting pipeline positions as well
  async function handleAutoLayout() {
    const dbEdges = await api.getEdges();
    const rfEdges = toRFEdges(dbEdges, edgeColor, labelBg);
    const rfNodes = buildGraphData(
      entities,
      pipelines.map(p => ({ ...p, pos_x: 0, pos_y: 0 })), // reset pipeline positions
      rfEdges
    );
    setNodes(rfNodes);
    // Save new pipeline positions to DB
    await Promise.all(
      rfNodes
        .filter(n => n.type === 'pipeline')
        .map(n => api.updatePipeline(n.data.pipelineId, { pos_x: n.position.x, pos_y: n.position.y }))
    );
  }

  return (
    <div className="graph-view" style={{ display: 'flex' }}>
      <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>

        <div className="graph-toolbar">
          <button className="btn-ghost" onClick={onNewPipeline}>+ Pipeline</button>
          <button className="btn-ghost" onClick={onNew}>+ Entity</button>
          <button className="btn-ghost" onClick={() => setEdgeModal(true)}>+ Dependency</button>
          <button className="btn-ghost" onClick={handleAutoLayout}>Auto Layout</button>
          <button
            className={selectMode ? 'btn-primary' : 'btn-ghost'}
            onClick={() => setSelectMode(s => !s)}
            title="Drag on canvas to select multiple items"
          >
            {selectMode ? 'Selecting' : 'Select'}
          </button>
          <div style={{ width: 1, background: 'var(--border)', margin: '0 4px', alignSelf: 'stretch' }} />
          <select
            value={focusPipelineId ?? ''}
            onChange={e => { setFocusPipelineId(e.target.value || null); setFocusId(null); }}
            style={{ width: 200, fontSize: 12, padding: '4px 8px' }}
          >
            <option value="">All pipelines</option>
            {pipelines.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {(focusId || focusPipelineId) && (
            <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }}
              onClick={() => { setFocusId(null); setFocusPipelineId(null); }}>
              ✕ Clear
            </button>
          )}
        </div>

        <ReactFlow
          nodes={visibleNodes}
          edges={visibleEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onNodeDragStop={onNodeDragStop}
          onSelectionDragStop={onSelectionDragStop}
          onNodeDoubleClick={onNodeDoubleClick}
          selectionOnDrag={selectMode}
          panOnDrag={selectMode ? [1] : true}
          onEdgeClick={onEdgeClick}
          onNodeContextMenu={onNodeContextMenu}
          onEdgeContextMenu={onEdgeContextMenu}
          onEdgesDelete={handleEdgeDelete}
          nodeTypes={nodeTypes}
          fitView
          zoomOnScroll={false}
          panOnScroll={true}
          panOnScrollMode="vertical"
          style={{ background: theme === 'light' ? '#f5f6fa' : '#0f1117' }}
          deleteKeyCode="Delete"
        >
          <Background color={theme === 'light' ? '#d8dce8' : '#2e3250'} gap={24} />
          <Controls />
          <FitOnFocus focusId={focusId} focusPipelineId={focusPipelineId} />
          <MiniMap nodeColor={n => {
            if (n.type === 'pipeline') return (STATUS_COLORS[n.data?.status] ?? '#f59e0b') + '60';
            return nodeColors[entities.find(e => e.id === n.id.split('::')[0])?.type] || '#64748b';
          }} />
        </ReactFlow>

        {edgeModal && (
          <EdgeModal
            entities={entities}
            pipelines={pipelines}
            error={edgeError}
            onSave={handleAddEdge}
            onClose={() => { setEdgeModal(false); setEdgeError(null); }}
          />
        )}

        {contextMenu && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setContextMenu(null)} />
            <div style={{
              position: 'fixed', left: contextMenu.x, top: contextMenu.y,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              zIndex: 1000, minWidth: 160, overflow: 'hidden', padding: '4px 0',
            }}>
              {contextMenu.type === 'node' && (() => {
                const entity = entities.find(e => e.id === contextMenu.id);
                return (
                  <>
                    {entity && <div style={{ padding: '6px 14px 4px', fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>{entity.name}</div>}
                    <CtxItem label="Open" onClick={() => { navigate(`/entity/${contextMenu.id}`, { state: { from: 'graph', focusId, focusPipelineId } }); setContextMenu(null); }} />
                    <CtxItem label="Focus" onClick={() => { setFocusId(contextMenu.id); setContextMenu(null); }} />
                    <CtxItem label="Edit" onClick={() => { setEditingEntityId(contextMenu.id); setContextMenu(null); }} />
                    <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                    <CtxItem label="Delete" danger onClick={() => { handleContextDeleteEntity(contextMenu.id); setContextMenu(null); }} />
                  </>
                );
              })()}
              {contextMenu.type === 'pipeline' && (() => {
                const pipeline = pipelines.find(p => p.id === contextMenu.id);
                return (
                  <>
                    {pipeline && <div style={{ padding: '6px 14px 4px', fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>{pipeline.name}</div>}
                    <CtxItem label="Open" onClick={() => { navigate(`/pipeline/${contextMenu.id}`, { state: { from: 'graph', focusId, focusPipelineId } }); setContextMenu(null); }} />
                    <CtxItem label="Focus" onClick={() => { setFocusPipelineId(contextMenu.id); setContextMenu(null); }} />
                    <CtxItem label="Print / Export" onClick={() => { window.open(`/print/pipeline/${contextMenu.id}`, '_blank'); setContextMenu(null); }} />
                    <CtxItem label="Edit" onClick={() => { setEditingPipelineId(contextMenu.id); setContextMenu(null); }} />
                    <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                    <CtxItem label="Delete" danger onClick={() => { handleContextDeletePipeline(contextMenu.id); setContextMenu(null); }} />
                  </>
                );
              })()}
              {contextMenu.type === 'edge' && (() => {
                const edge = edges.find(e => e.id === contextMenu.id);
                const src = entities.find(e => e.id === edge?.source);
                const tgt = entities.find(e => e.id === edge?.target);
                return (
                  <>
                    {src && tgt && <div style={{ padding: '6px 14px 4px', fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>{src.name} → {tgt.name}</div>}
                    <CtxItem label="Edit" onClick={() => { setEditingEdgeId(contextMenu.id); setContextMenu(null); }} />
                    <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                    <CtxItem label="Delete" danger onClick={async () => {
                      const rfEdge = edges.find(e => e.id === contextMenu.id);
                      await api.deleteEdge(contextMenu.id);
                      if (rfEdge?.data?.reverseId) await api.deleteEdge(rfEdge.data.reverseId);
                      setEdges(eds => eds.filter(e => e.id !== contextMenu.id));
                      setContextMenu(null);
                    }} />
                  </>
                );
              })()}
            </div>
          </>
        )}

      </div>

      <GraphPanel
        item={panelItem}
        entities={entities}
        pipelines={pipelines}
        edges={edges}
        graphState={{ focusId, focusPipelineId }}
        onClose={() => setPanelItem(null)}
      />

      {editingEntityId && (() => {
        const entity = entities.find(e => e.id === editingEntityId);
        return entity ? (
          <EntityModal
            initial={entity}
            pipelines={pipelines}
            onSave={handleContextEditSave}
            onClose={() => setEditingEntityId(null)}
          />
        ) : null;
      })()}

      {editingPipelineId && (() => {
        const pipeline = pipelines.find(p => p.id === editingPipelineId);
        return pipeline ? (
          <PipelineModal
            initial={pipeline}
            pipelines={pipelines}
            onSave={handleContextEditPipelineSave}
            onClose={() => setEditingPipelineId(null)}
          />
        ) : null;
      })()}

      {editingEdgeId && (() => {
        const edge = edges.find(e => e.id === editingEdgeId);
        return edge ? (
          <EdgeModal
            entities={entities}
            pipelines={pipelines}
            initial={{ id: editingEdgeId, source_id: edge.source, target_id: edge.target, label: edge.label ?? '' }}
            onSave={handleEditEdgeSave}
            onClose={() => setEditingEdgeId(null)}
          />
        ) : null;
      })()}
    </div>
  );
}
