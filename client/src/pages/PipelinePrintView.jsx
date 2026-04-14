import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  ImageRun, PageBreak,
} from 'docx';
import { toPng } from 'html-to-image';
import dagre from 'dagre';
import {
  ReactFlow, Background, Handle, Position, MarkerType,
  useNodesState, useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { api } from '../api';
import { TYPE_LABELS } from '../constants';

const NODE_COLORS = {
  power_automate_flow:  '#6366f1',
  sql_table:            '#0ea5e9',
  qlik_app:             '#10b981',
  data_source:          '#22c55e',
  sharepoint_list:      '#e11d48',
  api:                  '#a855f7',
  power_app:            '#8b5cf6',
  sql_stored_procedure: '#06b6d4',
  sap:                  '#0070f3',
  custom:               '#64748b',
};

const STATUS_COLORS = { active: '#10b981', inactive: '#f59e0b', deprecated: '#ef4444' };
const STATUS_LABELS = { active: 'Active', inactive: 'Inactive', deprecated: 'Deprecated' };

// Recursively fetch a pipeline and all its descendants
async function loadPipelineTree(id) {
  const p = await api.getPipeline(id);
  const childTrees = await Promise.all((p.children ?? []).map(c => loadPipelineTree(c.id)));
  return { ...p, childTrees };
}

// Flatten a pipeline tree into ordered list of { pipeline, depth }
function flattenTree(node, depth = 0) {
  const result = [{ pipeline: node, depth }];
  for (const child of node.childTrees ?? []) {
    result.push(...flattenTree(child, depth + 1));
  }
  return result;
}

// Collect all entities and edges from the entire tree (deduped by id)
function collectAll(node) {
  const entityMap = new Map();
  const edgeMap   = new Map();
  function walk(n) {
    for (const e of n.entities ?? []) entityMap.set(e.id, e);
    for (const e of n.edges   ?? []) edgeMap.set(e.id, e);
    for (const c of n.childTrees ?? []) walk(c);
  }
  walk(node);
  return { allEntities: [...entityMap.values()], allEdges: [...edgeMap.values()] };
}

// ── Print node (light theme) ─────────────────────────────────────────────────

function PrintNode({ data }) {
  return (
    <div style={{
      background: '#ffffff',
      border: `1.5px solid ${data.color}`,
      borderRadius: 8, padding: '8px 12px', minWidth: 140,
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    }}>
      <Handle type="target" position={Position.Left}  style={{ background: data.color, border: 'none', width: 6, height: 6 }} />
      <div style={{ color: data.color, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>{data.typeLabel}</div>
      <div style={{ fontWeight: 600, color: '#111827', fontSize: 12 }}>{data.label}</div>
      <Handle type="source" position={Position.Right} style={{ background: data.color, border: 'none', width: 6, height: 6 }} />
    </div>
  );
}

const nodeTypes = { print: PrintNode };

// ── Graph capture ────────────────────────────────────────────────────────────

function PrintGraph({ entities, dbEdges, onCapture }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [imageSrc, setImageSrc] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (entities.length === 0) { onCapture?.(null); return; }

    const rfNodes = entities.map(e => ({
      id: e.id, type: 'print', position: { x: 0, y: 0 },
      data: { label: e.name, typeLabel: TYPE_LABELS[e.type] || e.type, color: NODE_COLORS[e.type] || '#64748b' },
    }));
    const rfEdges = dbEdges.map(e => ({
      id: e.id, source: e.target_id, target: e.source_id,
      label: e.label || undefined,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#6b7280' },
      style: { stroke: '#6b7280', strokeWidth: 1.5 },
      labelStyle: { fill: '#6b7280', fontSize: 10 },
      labelBgStyle: { fill: '#f8fafc' },
    }));

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 100 });
    rfNodes.forEach(n => g.setNode(n.id, { width: 160, height: 52 }));
    rfEdges.forEach(e => { try { g.setEdge(e.source, e.target); } catch (_) {} });
    dagre.layout(g);

    setNodes(rfNodes.map(n => {
      const pos = g.node(n.id);
      return pos ? { ...n, position: { x: pos.x - 80, y: pos.y - 26 } } : n;
    }));
    setEdges(rfEdges);
  }, [entities, dbEdges]);

  useEffect(() => {
    if (nodes.length === 0) return;
    const timer = setTimeout(() => {
      if (!containerRef.current) return;
      toPng(containerRef.current, { backgroundColor: '#f8fafc', pixelRatio: 2 })
        .then(src => { setImageSrc(src); onCapture?.(src); })
        .catch(() => {});
    }, 600);
    return () => clearTimeout(timer);
  }, [nodes]);

  return (
    <div style={{ borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden', background: '#f8fafc' }}>
      <div ref={containerRef} style={{ height: 300, display: imageSrc ? 'none' : 'block' }}>
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes} nodesDraggable={false} nodesConnectable={false}
          panOnDrag={false} zoomOnScroll={false} zoomOnPinch={false} preventScrolling={false}
          fitView fitViewOptions={{ padding: 0.15 }} style={{ background: '#f8fafc' }}>
          <Background color="#e2e8f0" gap={24} />
        </ReactFlow>
      </div>
      {imageSrc
        ? <img src={imageSrc} alt="Pipeline graph" style={{ width: '100%', display: 'block' }} />
        : <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#9ca3af' }}>Rendering graph…</div>
      }
    </div>
  );
}

// ── Entity card (shared by root and children) ─────────────────────────────────

function EntityCard({ entity, allEdges, allEntities }) {
  const dependsOn = allEdges.filter(e => e.source_id === entity.id).map(e => allEntities.find(en => en.id === e.target_id)).filter(Boolean);
  const usedBy    = allEdges.filter(e => e.target_id === entity.id).map(e => allEntities.find(en => en.id === e.source_id)).filter(Boolean);
  const color     = NODE_COLORS[entity.type] || '#64748b';
  return (
    <div style={{
      border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 16px',
      marginBottom: 12, background: '#ffffff', pageBreakInside: 'avoid', breakInside: 'avoid',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8, borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{entity.name}</div>
        <div style={{ fontSize: 10, color, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{TYPE_LABELS[entity.type] || entity.type}</div>
      </div>
      {entity.description && <p style={{ fontSize: 12, color: '#374151', marginBottom: 8, lineHeight: 1.5 }}>{entity.description}</p>}
      {(dependsOn.length > 0 || usedBy.length > 0) && (
        <div style={{ fontSize: 11, color: '#374151', paddingTop: 8, borderTop: '1px solid #e2e8f0' }}>
          {dependsOn.length > 0 && <div style={{ marginBottom: 4 }}><span style={{ color: '#6b7280' }}>Depends on: </span>{dependsOn.map(n => n.name).join(' · ')}</div>}
          {usedBy.length   > 0 && <div><span style={{ color: '#6b7280' }}>Used by: </span>{usedBy.map(n => n.name).join(' · ')}</div>}
        </div>
      )}
    </div>
  );
}

// ── Pipeline section (recursive) ─────────────────────────────────────────────

function PipelineSection({ node, depth, allEdges, allEntities }) {
  const statusColor = STATUS_COLORS[node.status] ?? '#f59e0b';
  const isRoot = depth === 0;

  return (
    <div style={{ marginBottom: isRoot ? 0 : 24 }}>
      {/* Section header (only for child pipelines) */}
      {!isRoot && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
          paddingBottom: 8, borderBottom: '2px solid #e2e8f0',
          marginLeft: depth > 1 ? (depth - 1) * 16 : 0,
        }}>
          <span style={{ fontSize: 16, color: '#6b7280' }}>{'▶'.repeat(depth)}</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{node.name}</span>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
            background: statusColor + '22', color: statusColor, border: `1px solid ${statusColor}44`,
          }}>{STATUS_LABELS[node.status] ?? node.status}</span>
          <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 'auto' }}>
            {node.entities.length} {node.entities.length === 1 ? 'entity' : 'entities'}
          </span>
        </div>
      )}

      {node.description && !isRoot && (
        <p style={{ fontSize: 12, color: '#374151', marginBottom: 10, lineHeight: 1.5, marginLeft: depth > 1 ? (depth - 1) * 16 : 0 }}>{node.description}</p>
      )}

      {/* Child pipelines first */}
      {(node.childTrees ?? []).map(child => (
        <PipelineSection key={child.id} node={child} depth={depth + 1} allEdges={allEdges} allEntities={allEntities} />
      ))}

      {/* This pipeline's entities */}
      {node.entities.length > 0 && (
        <div style={{ marginLeft: depth > 0 ? depth * 16 : 0 }}>
          {!isRoot && node.entities.length > 0 && (
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8, fontStyle: 'italic' }}>
              {node.name} — entities
            </div>
          )}
          {node.entities.map(entity => (
            <EntityCard key={entity.id} entity={entity} allEdges={allEdges} allEntities={allEntities} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Word export ───────────────────────────────────────────────────────────────

const THIN_BORDER = { style: BorderStyle.SINGLE, size: 1, color: '2e3250' };
const TABLE_BORDERS = { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER, insideH: THIN_BORDER, insideV: THIN_BORDER };

function metaRow(label, value) {
  if (value == null || value === '') return null;
  return new TableRow({ children: [
    new TableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS,
      children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20, color: '444444' })] })],
    }),
    new TableCell({ width: { size: 70, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS,
      children: [new Paragraph({ children: [new TextRun({ text: String(value), size: 20 })] })],
    }),
  ]});
}

async function buildWordDoc({ pipelineTree, allEntities, allEdges, graphImageSrc }) {
  const pipeline = pipelineTree;
  const flat = flattenTree(pipelineTree);
  const totalEntities = allEntities.length;

  let graphImageBuffer = null;
  if (graphImageSrc) {
    try {
      const base64 = graphImageSrc.split(',')[1];
      const binary = atob(base64);
      const bytes  = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      graphImageBuffer = bytes.buffer;
    } catch { /* skip */ }
  }

  const children = [];

  // Header
  children.push(
    new Paragraph({ text: pipeline.name, heading: HeadingLevel.TITLE, spacing: { after: 120 } }),
    new Paragraph({
      children: [new TextRun({
        text: `Pipeline  ·  ${STATUS_LABELS[pipeline.status] ?? pipeline.status}  ·  ${totalEntities} entities across ${flat.length} pipeline(s)  ·  Generated ${new Date().toLocaleString()}`,
        color: '666666', size: 20,
      })],
      spacing: { after: 240 },
    }),
  );

  if (pipeline.description) {
    children.push(new Paragraph({ text: pipeline.description, spacing: { after: 240 } }));
  }

  // Pipeline metadata table
  const metaRows = [
    metaRow('Status', STATUS_LABELS[pipeline.status] ?? pipeline.status),
    metaRow('Business Owner', pipeline.business_owner),
    metaRow('Last Verified', pipeline.last_verified ? new Date(pipeline.last_verified).toLocaleDateString() : null),
    metaRow('Tags', pipeline.tags?.length ? pipeline.tags.join(', ') : null),
    metaRow('Notes', pipeline.notes),
  ].filter(Boolean);

  if (metaRows.length) {
    children.push(
      new Paragraph({ text: 'Pipeline Details', heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 160 } }),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: metaRows, margins: { top: 40, bottom: 40, left: 80, right: 80 } }),
    );
  }

  // Graph image
  if (graphImageBuffer) {
    children.push(
      new Paragraph({ text: 'Dependency Graph', heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 160 } }),
      new Paragraph({
        children: [new ImageRun({ data: graphImageBuffer, transformation: { width: 620, height: 240 }, type: 'png' })],
        spacing: { after: 360 },
      }),
    );
  }

  // Entity details — one section per pipeline in the tree
  children.push(new Paragraph({ text: 'Member Entities', heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 200 } }));

  flat.forEach(({ pipeline: p, depth }) => {
    if (p.entities.length === 0) return;

    // Sub-heading for child pipelines
    if (depth > 0) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: '  '.repeat(depth) + p.name, bold: true, color: '374151' }),
          new TextRun({ text: `  (${STATUS_LABELS[p.status] ?? p.status})`, color: '888888', size: 18 }),
        ],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 160 },
      }));
    }

    p.entities.forEach((entity, i) => {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: entity.name, bold: true, color: '111111' }),
          new TextRun({ text: `  ${TYPE_LABELS[entity.type] || entity.type}`, color: '888888', size: 20 }),
        ],
        heading: depth === 0 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
        spacing: { before: 200, after: 120 },
      }));

      if (entity.description) {
        children.push(new Paragraph({ text: entity.description, spacing: { after: 120 } }));
      }

      const dependsOn = allEdges
        .filter(e => e.source_id === entity.id)
        .map(e => allEntities.find(en => en.id === e.target_id)?.name).filter(Boolean);
      const usedBy = allEdges
        .filter(e => e.target_id === entity.id)
        .map(e => allEntities.find(en => en.id === e.source_id)?.name).filter(Boolean);

      if (dependsOn.length) children.push(new Paragraph({
        children: [new TextRun({ text: 'Depends on: ', bold: true, size: 20 }), new TextRun({ text: dependsOn.join('  ·  '), size: 20, color: '444444' })],
        spacing: { after: 60 },
      }));
      if (usedBy.length) children.push(new Paragraph({
        children: [new TextRun({ text: 'Used by: ', bold: true, size: 20 }), new TextRun({ text: usedBy.join('  ·  '), size: 20, color: '444444' })],
        spacing: { after: 60 },
      }));
    });
  });

  return new Document({ sections: [{ children }] });
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function PipelinePrintView() {
  const { id } = useParams();
  const [pipelineTree, setPipelineTree] = useState(null);
  const [allEntities, setAllEntities]   = useState([]);
  const [allEdges, setAllEdges]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [exporting, setExporting]       = useState(false);
  const [graphImageSrc, setGraphImageSrc] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const tree = await loadPipelineTree(id);
        const { allEntities: ents, allEdges: eds } = collectAll(tree);
        setPipelineTree(tree);
        setAllEntities(ents);
        setAllEdges(eds);
      } catch (e) { setError(e.message); }
      finally    { setLoading(false); }
    }
    load();
  }, [id]);

  if (loading) return <div style={{ padding: 40, color: '#7c85a8', fontFamily: 'sans-serif' }}>Loading…</div>;
  if (error || !pipelineTree) return <div style={{ padding: 40, color: '#ef4444', fontFamily: 'sans-serif' }}>{error || 'Pipeline not found'}</div>;

  const pipeline = pipelineTree;
  const statusColor = STATUS_COLORS[pipeline.status] ?? '#f59e0b';
  const flat = flattenTree(pipelineTree);

  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', background: '#ffffff', color: '#111827', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* Toolbar */}
      <div className="no-print" style={{ position: 'fixed', top: 16, right: 16, display: 'flex', gap: 8, zIndex: 100 }}>
        <button onClick={() => window.print()} style={{
          background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6,
          padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>Print / PDF</button>
        <button
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            try {
              const doc  = await buildWordDoc({ pipelineTree, allEntities, allEdges, graphImageSrc });
              const blob = await Packer.toBlob(doc);
              const url  = URL.createObjectURL(blob);
              const a    = document.createElement('a');
              a.href = url; a.download = `${pipeline.name}.docx`; a.click();
              URL.revokeObjectURL(url);
            } catch (e) { console.error('Word export failed:', e); }
            finally { setExporting(false); }
          }}
          style={{
            background: '#1a4b8c', color: '#fff', border: 'none', borderRadius: 6,
            padding: '8px 18px', fontSize: 13, fontWeight: 600,
            cursor: exporting ? 'wait' : 'pointer', opacity: exporting ? 0.7 : 1,
          }}
        >{exporting ? 'Exporting…' : 'Export to Word'}</button>
        <button onClick={() => window.close()} style={{
          background: '#22263a', color: '#e2e8f0', border: '1px solid #2e3250',
          borderRadius: 6, padding: '8px 14px', fontSize: 13, cursor: 'pointer',
        }}>Close</button>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 32px 48px' }}>

        {/* Report header */}
        <div style={{ marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
            Flowprint — Pipeline Report
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>{pipeline.name}</h1>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 12,
              background: statusColor + '22', color: statusColor, border: `1px solid ${statusColor}44`,
            }}>{STATUS_LABELS[pipeline.status] ?? pipeline.status}</span>
          </div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            {allEntities.length} entities · {allEdges.length} dependencies · {flat.length} pipeline(s) · Generated {new Date().toLocaleString()}
          </div>
          {flat.length > 1 && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
              Includes: {flat.slice(1).map(({ pipeline: p }) => p.name).join(', ')}
            </div>
          )}
        </div>

        {/* Pipeline metadata */}
        {(pipeline.description || pipeline.business_owner || pipeline.last_verified || pipeline.notes || pipeline.tags?.length > 0) && (
          <div style={{ marginBottom: 24 }}>
            {pipeline.description && (
              <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, marginBottom: 16 }}>{pipeline.description}</p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', fontSize: 13 }}>
              {pipeline.business_owner && (
                <div><span style={{ color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Business Owner</span><br />{pipeline.business_owner}</div>
              )}
              {pipeline.last_verified && (
                <div><span style={{ color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Last Verified</span><br />{new Date(pipeline.last_verified).toLocaleDateString()}</div>
              )}
            </div>
            {pipeline.tags?.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {pipeline.tags.map(t => (
                  <span key={t} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 4, padding: '2px 8px', fontSize: 11, color: '#475569' }}>{t}</span>
                ))}
              </div>
            )}
            {pipeline.notes && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12, color: '#374151', whiteSpace: 'pre-wrap' }}>
                {pipeline.notes}
              </div>
            )}
          </div>
        )}

        {/* Graph — all entities across the full tree */}
        {allEntities.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#4f46e5', marginBottom: 8 }}>
              Dependency Graph
            </div>
            <PrintGraph
              entities={allEntities}
              dbEdges={allEdges}
              onCapture={setGraphImageSrc}
            />
          </div>
        )}

        {/* Entity sections — recursive per pipeline */}
        {allEntities.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#4f46e5', marginBottom: 12 }}>
              Member Entities ({allEntities.length})
            </div>
            <PipelineSection
              node={pipelineTree}
              depth={0}
              allEdges={allEdges}
              allEntities={allEntities}
            />
          </div>
        )}

      </div>
    </div>
  );
}
