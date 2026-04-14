import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  ImageRun, AlignmentType, PageBreak,
} from 'docx';
import { toPng } from 'html-to-image';
import dagre from 'dagre';
import {
  ReactFlow, Background, Handle, Position, MarkerType,
  useNodesState, useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { api } from '../api';
import { TYPE_LABELS, TRIGGER_TYPES, RECURRENCE_FREQUENCIES, TIMEZONES } from '../constants';

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

function PrintNode({ data }) {
  return (
    <div style={{
      background: data.focal ? '#eef2ff' : '#ffffff',
      border: data.focal ? `2px solid #4f46e5` : `1.5px solid ${data.color}`,
      borderRadius: 8,
      padding: '8px 12px',
      minWidth: 140,
      fontSize: 11,
      boxShadow: data.focal ? '0 0 0 3px rgba(79,70,229,0.15)' : '0 1px 3px rgba(0,0,0,0.08)',
    }}>
      <Handle type="target" position={Position.Left}  style={{ background: data.color, border: 'none', width: 6, height: 6 }} />
      <div style={{ color: data.color, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>
        {data.typeLabel}
      </div>
      <div style={{ fontWeight: 600, color: '#111827', fontSize: 12 }}>{data.label}</div>
      <Handle type="source" position={Position.Right} style={{ background: data.color, border: 'none', width: 6, height: 6 }} />
    </div>
  );
}

const nodeTypes = { print: PrintNode };

// ── Helpers ──────────────────────────────────────────────────────────────────

function toCET(timeStr, fromTz) {
  if (!timeStr || !fromTz) return null;
  try {
    const [h, m] = timeStr.split(':').map(Number);
    const today = new Date();
    const yyyy  = today.getUTCFullYear();
    const mm    = String(today.getUTCMonth() + 1).padStart(2, '0');
    const dd    = String(today.getUTCDate()).padStart(2, '0');
    let guess   = new Date(`${yyyy}-${mm}-${dd}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00Z`);
    const srcFmt = new Intl.DateTimeFormat('en-US', { timeZone: fromTz, hour: '2-digit', minute: '2-digit', hour12: false });
    for (let i = 0; i < 4; i++) {
      const parts = srcFmt.formatToParts(guess);
      const lh = parseInt(parts.find(p => p.type === 'hour').value);
      const lm = parseInt(parts.find(p => p.type === 'minute').value);
      const diff = ((h - lh) * 60 + (m - lm)) * 60_000;
      if (diff === 0) break;
      guess = new Date(guess.getTime() + diff);
    }
    const cetFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false });
    const parts = cetFmt.formatToParts(guess);
    return `${parts.find(p => p.type === 'hour').value}:${parts.find(p => p.type === 'minute').value}`;
  } catch { return null; }
}

function Field({ label, value }) {
  if (value == null || value === '' || value === false) return null;
  return (
    <div style={{ marginBottom: 6 }}>
      <span style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}: </span>
      <span style={{ fontSize: 12, color: '#111827' }}>{value}</span>
    </div>
  );
}

function EntityCard({ entity, focal, connections }) {
  const m = entity.metadata ?? {};
  const isFlow = entity.type === 'power_automate_flow';
  const isSql  = entity.type === 'sql_table' || entity.type === 'sql_stored_procedure';
  const isSap  = entity.type === 'sap';
  const triggerLabel = TRIGGER_TYPES.find(t => t.value === m.trigger_type)?.label;
  const cetTime = m.recurrence_time ? toCET(m.recurrence_time, m.recurrence_timezone) : null;
  const CET_ZONES = new Set(['Europe/Amsterdam','Europe/Berlin','Europe/Paris','Europe/Stockholm','Europe/Warsaw']);

  return (
    <div className="print-card" style={{
      border: focal ? '2px solid #4f46e5' : '1px solid #e2e8f0',
      borderRadius: 8,
      padding: '14px 16px',
      marginBottom: 12,
      background: focal ? '#eef2ff' : '#ffffff',
      pageBreakInside: 'avoid',
      breakInside: 'avoid',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8, borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: focal ? '#4f46e5' : '#111827' }}>{entity.name}</div>
        <div style={{ fontSize: 10, color: NODE_COLORS[entity.type] || '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {TYPE_LABELS[entity.type] || entity.type}
        </div>
        {focal && <div style={{ marginLeft: 'auto', fontSize: 10, color: '#4f46e5', fontWeight: 600 }}>FOCAL ENTITY</div>}
      </div>

      {/* Description */}
      {entity.description && (
        <p style={{ fontSize: 12, color: '#374151', marginBottom: 8, lineHeight: 1.5 }}>{entity.description}</p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
        <div>
          {/* Flow */}
          {isFlow && <Field label="Trigger"     value={triggerLabel} />}
          {isFlow && <Field label="Environment" value={m.environment} />}
          {isFlow && m.trigger_type === 'scheduled' && <>
            <Field label="Frequency" value={m.recurrence_frequency
              ? (m.recurrence_interval ?? 1) === 1
                ? { Minute:'Every minute', Hour:'Hourly', Day:'Daily', Week:'Weekly', Month:'Monthly' }[m.recurrence_frequency]
                : `Every ${m.recurrence_interval} ${m.recurrence_frequency.toLowerCase()}s`
              : null} />
            <Field label="Time" value={m.recurrence_time
              ? `${m.recurrence_time} ${m.recurrence_timezone || ''}${cetTime && !CET_ZONES.has(m.recurrence_timezone) ? ` (${cetTime} CET)` : ''}`
              : null} />
          </>}

          {/* SQL */}
          {isSql && <Field label="Schema"      value={m.db_schema} />}
          {isSql && <Field label="Primary Key" value={m.primary_key} />}
          {isSql && m.is_staging != null && (
            <Field label="Table Type" value={m.is_staging ? 'Staging' : 'Final / Permanent'} />
          )}

          {/* SAP */}
          {isSap && <Field label="SAP Table" value={m.sap_table} />}
        </div>

        <div>
          <Field label="Technical Owner" value={m.technical_owner} />
          <Field label="Business Owner"  value={m.business_owner} />
          {m.last_verified && <Field label="Last Verified" value={new Date(m.last_verified).toLocaleDateString()} />}
          {m.tags?.length > 0 && (
            <Field label="Tags" value={m.tags.join(', ')} />
          )}
        </div>
      </div>

      {/* Connections */}
      {(connections.dependsOn.length > 0 || connections.usedBy.length > 0) && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e2e8f0', fontSize: 11, color: '#374151' }}>
          {connections.dependsOn.length > 0 && (
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: '#6b7280' }}>Depends on: </span>
              {connections.dependsOn.map(n => n.name).join(' · ')}
            </div>
          )}
          {connections.usedBy.length > 0 && (
            <div>
              <span style={{ color: '#6b7280' }}>Used by: </span>
              {connections.usedBy.map(n => n.name).join(' · ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Graph ────────────────────────────────────────────────────────────────────

function PrintGraph({ entities, dbEdges, focalId, onCapture }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [imageSrc, setImageSrc] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const rfNodes = entities.map(e => ({
      id:   e.id,
      type: 'print',
      position: { x: 0, y: 0 },
      data: {
        label:     e.name,
        typeLabel: TYPE_LABELS[e.type] || e.type,
        color:     NODE_COLORS[e.type] || '#64748b',
        focal:     e.id === focalId,
      },
    }));

    const rfEdges = dbEdges.map(e => ({
      id:        e.id,
      source:    e.target_id,
      target:    e.source_id,
      label:     e.label || undefined,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#6b7280' },
      style:     { stroke: '#6b7280', strokeWidth: 1.5 },
      labelStyle:   { fill: '#6b7280', fontSize: 10 },
      labelBgStyle: { fill: '#f8fafc' },
    }));

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 100 });
    rfNodes.forEach(n => g.setNode(n.id, { width: 160, height: 52 }));
    rfEdges.forEach(e => g.setEdge(e.source, e.target));
    dagre.layout(g);

    const laid = rfNodes.map(n => {
      const pos = g.node(n.id);
      return pos ? { ...n, position: { x: pos.x - 80, y: pos.y - 26 } } : n;
    });

    setNodes(laid);
    setEdges(rfEdges);
  }, [entities, dbEdges, focalId]);

  // After React Flow renders, capture it as a static image
  useEffect(() => {
    if (nodes.length === 0) return;
    const timer = setTimeout(() => {
      if (!containerRef.current) return;
      toPng(containerRef.current, { backgroundColor: '#f8fafc', pixelRatio: 2 })
        .then(src => {
          setImageSrc(src);
          onCapture?.(src);
        })
        .catch(() => {});
    }, 600);
    return () => clearTimeout(timer);
  }, [nodes]);

  return (
    <div style={{ borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden', background: '#f8fafc' }}>
      {/* React Flow renders hidden after capture; used only for layout */}
      <div
        ref={containerRef}
        style={{ height: 340, display: imageSrc ? 'none' : 'block' }}
      >
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          nodesDraggable={false} nodesConnectable={false}
          panOnDrag={false} zoomOnScroll={false} zoomOnPinch={false}
          preventScrolling={false}
          fitView fitViewOptions={{ padding: 0.15 }}
          style={{ background: '#f8fafc' }}
        >
          <Background color="#e2e8f0" gap={24} />
        </ReactFlow>
      </div>
      {/* Static image — scales correctly at any print width */}
      {imageSrc
        ? <img src={imageSrc} alt="Dependency graph" style={{ width: '100%', display: 'block' }} />
        : <div style={{ height: 340, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#9ca3af' }}>Rendering graph…</div>
      }
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

// ── Word export ───────────────────────────────────────────────────────────────

const THIN_BORDER = { style: BorderStyle.SINGLE, size: 1, color: '2e3250' };
const TABLE_BORDERS = { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER, insideH: THIN_BORDER, insideV: THIN_BORDER };

function metaRows(entity) {
  const m = entity.metadata ?? {};
  const rows = [];

  const add = (label, value) => {
    if (value == null || value === '' || value === false) return;
    rows.push(new TableRow({ children: [
      new TableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS, children: [
        new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20, color: '444444' })] }),
      ]}),
      new TableCell({ width: { size: 70, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS, children: [
        new Paragraph({ children: [new TextRun({ text: String(value), size: 20 })] }),
      ]}),
    ]}));
  };

  const isFlow = entity.type === 'power_automate_flow';
  const isSql  = entity.type === 'sql_table' || entity.type === 'sql_stored_procedure';
  const isSap  = entity.type === 'sap';

  if (isFlow) {
    const triggerLabel = TRIGGER_TYPES.find(t => t.value === m.trigger_type)?.label;
    add('Trigger',     triggerLabel);
    add('Environment', m.environment);
    if (m.trigger_type === 'scheduled') {
      const freq = m.recurrence_frequency;
      const n    = m.recurrence_interval ?? 1;
      add('Frequency', freq ? (n === 1
        ? { Minute:'Every minute', Hour:'Hourly', Day:'Daily', Week:'Weekly', Month:'Monthly' }[freq]
        : `Every ${n} ${freq.toLowerCase()}s`) : null);
      if (m.recurrence_time) {
        const cet = toCET(m.recurrence_time, m.recurrence_timezone);
        const CET_ZONES = new Set(['Europe/Amsterdam','Europe/Berlin','Europe/Paris','Europe/Stockholm','Europe/Warsaw']);
        const cetSuffix = cet && !CET_ZONES.has(m.recurrence_timezone) ? ` (${cet} CET)` : '';
        add('Schedule Time', `${m.recurrence_time} ${m.recurrence_timezone || ''}${cetSuffix}`.trim());
      }
    }
  }
  if (isSql) {
    add('Schema',      m.db_schema);
    add('Primary Key', m.primary_key);
    if (m.is_staging != null) add('Table Type', m.is_staging ? 'Staging' : 'Final / Permanent');
  }
  if (isSap) add('SAP Table', m.sap_table);

  add('Technical Owner', m.technical_owner);
  add('Business Owner',  m.business_owner);
  if (m.last_verified) add('Last Verified', new Date(m.last_verified).toLocaleDateString());
  if (m.tags?.length)  add('Tags', m.tags.join(', '));

  return rows;
}

async function buildWordDoc({ focalEntity, sortedEntities, treeEdges, allEntities, graphImageSrc }) {
  // Use the already-captured PNG data URL
  let graphImageBuffer = null;
  const graphWidth = 600, graphHeight = 240;
  if (graphImageSrc) {
    try {
      const base64 = graphImageSrc.split(',')[1];
      const binary = atob(base64);
      const bytes  = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      graphImageBuffer = bytes.buffer;
    } catch { /* skip */ }
  }

  const sections = [];

  // -- Report header --
  sections.push(
    new Paragraph({
      text: focalEntity.name,
      heading: HeadingLevel.TITLE,
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [new TextRun({
        text: `${TYPE_LABELS[focalEntity.type] || focalEntity.type}  ·  ${sortedEntities.length} entities  ·  Generated ${new Date().toLocaleString()}`,
        color: '666666', size: 20,
      })],
      spacing: { after: 240 },
    }),
  );

  if (focalEntity.description) {
    sections.push(new Paragraph({ text: focalEntity.description, spacing: { after: 240 } }));
  }

  // -- Graph image --
  if (graphImageBuffer) {
    sections.push(
      new Paragraph({
        text: 'Dependency Graph',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 240, after: 160 },
      }),
      new Paragraph({
        children: [new ImageRun({
          data: graphImageBuffer,
          transformation: { width: Math.min(graphWidth, 620), height: Math.min(graphHeight, 240) },
          type: 'png',
        })],
        spacing: { after: 360 },
      }),
    );
  }

  // -- Entity details --
  sections.push(new Paragraph({
    text: 'Entity Details',
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 240, after: 200 },
  }));

  for (let i = 0; i < sortedEntities.length; i++) {
    const entity = sortedEntities[i];
    const isFocal = entity.id === focalEntity.id;

    sections.push(
      new Paragraph({
        children: [
          new TextRun({ text: entity.name, bold: true, color: isFocal ? '4f46e5' : '111111' }),
          new TextRun({ text: `  ${TYPE_LABELS[entity.type] || entity.type}`, color: '888888', size: 20 }),
          ...(isFocal ? [new TextRun({ text: '  FOCAL', bold: true, color: '4f46e5', size: 18 })] : []),
        ],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 280, after: 120 },
      }),
    );

    if (entity.description) {
      sections.push(new Paragraph({
        text: entity.description,
        spacing: { after: 160 },
        style: 'Normal',
        color: '444444',
      }));
    }

    const rows = metaRows(entity);
    if (rows.length) {
      sections.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows,
        margins: { top: 40, bottom: 40, left: 80, right: 80 },
      }));
    }

    // Connections
    const dependsOn = treeEdges
      .filter(e => e.source_id === entity.id)
      .map(e => allEntities.find(en => en.id === e.target_id)?.name)
      .filter(Boolean);
    const usedBy = treeEdges
      .filter(e => e.target_id === entity.id)
      .map(e => allEntities.find(en => en.id === e.source_id)?.name)
      .filter(Boolean);

    if (dependsOn.length || usedBy.length) {
      sections.push(new Paragraph({ spacing: { before: 120 } }));
      if (dependsOn.length) sections.push(new Paragraph({
        children: [
          new TextRun({ text: 'Depends on: ', bold: true, size: 20 }),
          new TextRun({ text: dependsOn.join('  ·  '), size: 20, color: '444444' }),
        ],
      }));
      if (usedBy.length) sections.push(new Paragraph({
        children: [
          new TextRun({ text: 'Used by: ', bold: true, size: 20 }),
          new TextRun({ text: usedBy.join('  ·  '), size: 20, color: '444444' }),
        ],
      }));
    }

    // Page break between entities (not after the last one)
    if (i < sortedEntities.length - 1) {
      sections.push(new Paragraph({ children: [new PageBreak()] }));
    }
  }

  return new Document({ sections: [{ children: sections }] });
}

export default function PrintView() {
  const { id } = useParams();
  const [allEntities, setAllEntities] = useState([]);
  const [allDbEdges,  setAllDbEdges]  = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [exporting,    setExporting]   = useState(false);
  const [graphImageSrc, setGraphImageSrc] = useState(null);
  const graphRef = useRef(null);

  useEffect(() => {
    async function load() {
      try {
        const [entities, edges] = await Promise.all([api.getEntities(), api.getEdges()]);
        setAllEntities(entities);
        setAllDbEdges(edges);
      } catch (e) { setError(e.message); }
      finally    { setLoading(false); }
    }
    load();
  }, []);

  // BFS to find all ancestors + descendants
  const treeIds = useMemo(() => {
    if (!allDbEdges.length && !allEntities.length) return new Set([id]);
    const visited = new Set([id]);
    const queue   = [id];
    while (queue.length) {
      const curr = queue.shift();
      allDbEdges.forEach(e => {
        if (e.source_id === curr && !visited.has(e.target_id)) { visited.add(e.target_id); queue.push(e.target_id); }
        if (e.target_id === curr && !visited.has(e.source_id)) { visited.add(e.source_id); queue.push(e.source_id); }
      });
    }
    return visited;
  }, [id, allDbEdges, allEntities]);

  const treeEntities = useMemo(
    () => allEntities.filter(e => treeIds.has(e.id)),
    [allEntities, treeIds]
  );
  const treeEdges = useMemo(
    () => allDbEdges.filter(e => treeIds.has(e.source_id) && treeIds.has(e.target_id)),
    [allDbEdges, treeIds]
  );

  const focalEntity = allEntities.find(e => e.id === id);

  // For each entity, compute its direct connections within the tree
  function connectionsFor(entity) {
    const dependsOn = treeEdges
      .filter(e => e.source_id === entity.id)
      .map(e => allEntities.find(en => en.id === e.target_id))
      .filter(Boolean);
    const usedBy = treeEdges
      .filter(e => e.target_id === entity.id)
      .map(e => allEntities.find(en => en.id === e.source_id))
      .filter(Boolean);
    return { dependsOn, usedBy };
  }

  // Topological sort: upstream providers first, consumers (focal) last
  // DB convention: source_id = consumer, target_id = provider
  // Topological direction: provider → consumer (target_id → source_id)
  const sortedEntities = useMemo(() => {
    const ids = treeEntities.map(e => e.id);
    const inDegree = Object.fromEntries(ids.map(i => [i, 0]));
    const adj      = Object.fromEntries(ids.map(i => [i, []]));

    for (const e of treeEdges) {
      if (adj[e.target_id] !== undefined && inDegree[e.source_id] !== undefined) {
        adj[e.target_id].push(e.source_id);
        inDegree[e.source_id]++;
      }
    }

    const queue  = ids.filter(i => inDegree[i] === 0).sort();
    const result = [];
    while (queue.length) {
      const curr = queue.shift();
      result.push(curr);
      for (const next of [...(adj[curr] || [])].sort()) {
        if (--inDegree[next] === 0) queue.push(next);
      }
    }
    // Handle any nodes not reached (isolated)
    for (const i of ids) { if (!result.includes(i)) result.push(i); }

    return result.map(i => treeEntities.find(e => e.id === i)).filter(Boolean);
  }, [treeEntities, treeEdges]);

  if (loading) return (
    <div style={{ padding: 40, color: '#7c85a8', fontFamily: 'sans-serif' }}>Loading…</div>
  );
  if (error || !focalEntity) return (
    <div style={{ padding: 40, color: '#ef4444', fontFamily: 'sans-serif' }}>{error || 'Entity not found'}</div>
  );

  return (
    <div className="print-root" style={{ position: 'fixed', inset: 0, overflowY: 'auto', background: '#ffffff', color: '#111827', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* Toolbar — hidden when printing */}
      <div className="no-print" style={{
        position: 'fixed', top: 16, right: 16, display: 'flex', gap: 8, zIndex: 100,
      }}>
        <button onClick={() => window.print()} style={{
          background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6,
          padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>
          Print / PDF
        </button>
        <button
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            try {
              const doc  = await buildWordDoc({ focalEntity, sortedEntities, treeEdges, allEntities, graphImageSrc });
              const blob = await Packer.toBlob(doc);
              const url  = URL.createObjectURL(blob);
              const a    = document.createElement('a');
              a.href     = url;
              a.download = `${focalEntity.name}.docx`;
              a.click();
              URL.revokeObjectURL(url);
            } catch (e) { console.error('Word export failed:', e); }
            finally { setExporting(false); }
          }}
          style={{
            background: '#1a4b8c', color: '#fff', border: 'none', borderRadius: 6,
            padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: exporting ? 'wait' : 'pointer', opacity: exporting ? 0.7 : 1,
          }}
        >
          {exporting ? 'Exporting…' : 'Export to Word'}
        </button>
        <button onClick={() => window.close()} style={{
          background: '#22263a', color: '#e2e8f0', border: '1px solid #2e3250',
          borderRadius: 6, padding: '8px 14px', fontSize: 13, cursor: 'pointer',
        }}>
          Close
        </button>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 32px 48px' }}>

        {/* Report header */}
        <div style={{ marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
            Flowprint — Dependency Report
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#4f46e5', marginBottom: 2 }}>
            {focalEntity.name}
          </h1>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            {TYPE_LABELS[focalEntity.type]} · {treeEntities.length} entities · {treeEdges.length} connections · Generated {new Date().toLocaleString()}
          </div>
        </div>

        {/* Graph */}
        <div ref={graphRef} style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#4f46e5', marginBottom: 8 }}>
            Dependency Graph
          </div>
          <PrintGraph
            entities={treeEntities}
            dbEdges={treeEdges}
            focalId={id}
            onCapture={setGraphImageSrc}
          />
        </div>

        {/* Entity detail cards */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#4f46e5', marginBottom: 12 }}>
            Entity Details ({sortedEntities.length})
          </div>
          {sortedEntities.map(entity => (
            <EntityCard
              key={entity.id}
              entity={entity}
              focal={entity.id === id}
              connections={connectionsFor(entity)}
            />
          ))}
        </div>

      </div>
    </div>
  );
}
