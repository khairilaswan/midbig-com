"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import {
  BLOCK_TYPES,
  MAX_BLOCKS_PER_REGION,
  newBlock,
  SCHEMAS,
  TEXT_MAX,
  TITLE_MAX,
  type Block,
  type BlockType,
  type LayoutKey,
  type LayoutSchema,
  type TemplateLayout,
} from "@/lib/home-layout";

export interface EditorPage {
  /** This page's key in layouts, and what save() gets. */
  key: string;
  schema: LayoutKey;
  label: string;
  /** A short note beside the label, such as "site default" or "yours". */
  badge?: string;
  previewHref?: string;
}

const REGION_PREFIX = "region:";
const PALETTE_PREFIX = "new:";

type Info = (typeof BLOCK_TYPES)[BlockType] & { noTitle?: boolean };
const info = (t: BlockType): Info => BLOCK_TYPES[t] as Info;

/**
 * Drag and drop editor for block layouts: the site's home templates (admin),
 * a member's own home page, or a community's page. Drag blocks from the
 * palette into a column, drag them to reorder or move between columns, click
 * a block to change its heading or size. Nothing changes until Save.
 */
export function LayoutEditor({
  pages,
  layouts,
  initialKey,
  save,
  makeDefault,
  defaultKey,
  resetLabel = "Reset to original",
  intro,
}: {
  pages: EditorPage[];
  layouts: Record<string, TemplateLayout>;
  initialKey?: string;
  save: (key: string, layout: TemplateLayout | null) => Promise<ActionResult>;
  /** Admin only: make this template the site's default. */
  makeDefault?: (key: string) => Promise<ActionResult>;
  defaultKey?: string;
  resetLabel?: string;
  intro?: React.ReactNode;
}) {
  const router = useRouter();
  const [key, setKey] = useState(initialKey && pages.some((p) => p.key === initialKey) ? initialKey : pages[0]!.key);
  const [drafts, setDrafts] = useState<Record<string, TemplateLayout>>(layouts);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [active, setActive] = useState<{ id: string; type: BlockType } | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");

  // After a save the server sends fresh layouts; take them for pages with no unsaved changes.
  useEffect(() => {
    setDrafts((d) => {
      const next = { ...d };
      for (const k of Object.keys(layouts)) if (!dirty.has(k)) next[k] = layouts[k]!;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layouts]);

  const page = pages.find((p) => p.key === key)!;
  const schema: LayoutSchema = SCHEMAS[page.schema];
  const layout = drafts[key]!;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const change = (fn: (l: TemplateLayout) => TemplateLayout) => {
    setDrafts((d) => ({ ...d, [key]: fn(d[key]!) }));
    setDirty((s) => new Set(s).add(key));
    setMsg("");
  };

  const regionOf = (id: string, l: TemplateLayout = layout): string | null => {
    if (id.startsWith(REGION_PREFIX)) return id.slice(REGION_PREFIX.length);
    return Object.keys(l).find((r) => l[r]!.some((b) => b.id === id)) ?? null;
  };

  const editBlock = (id: string, patch: Partial<Block>) =>
    change((l) => Object.fromEntries(Object.entries(l).map(([r, list]) => [r, list.map((b) => (b.id === id ? { ...b, ...patch } : b))])));

  const removeBlock = (id: string) => change((l) => Object.fromEntries(Object.entries(l).map(([r, list]) => [r, list.filter((b) => b.id !== id)])));

  const addBlock = (type: BlockType, region: string, index?: number) => {
    const block = newBlock(type);
    change((l) => {
      const list = [...(l[region] ?? [])];
      if (list.length >= MAX_BLOCKS_PER_REGION) return l;
      list.splice(index ?? list.length, 0, block);
      return { ...l, [region]: list };
    });
    setOpen(block.id);
  };

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    if (id.startsWith(PALETTE_PREFIX)) setActive({ id, type: id.slice(PALETTE_PREFIX.length) as BlockType });
    else {
      const r = regionOf(id);
      const block = r ? layout[r]!.find((b) => b.id === id) : null;
      if (block) setActive({ id, type: block.type });
    }
  };

  // Moving between columns happens while dragging, so the block slides into place under the pointer.
  /** True when the dragged item sits over the lower half of the block it's over: drop after that block. */
  const below = (e: DragOverEvent | DragEndEvent) => {
    const r = e.active.rect.current.translated;
    return !!(r && e.over && !String(e.over.id).startsWith(REGION_PREFIX) && r.top + r.height / 2 > e.over.rect.top + e.over.rect.height / 2);
  };

  const onDragOver = (e: DragOverEvent) => {
    const id = String(e.active.id);
    if (!e.over || id.startsWith(PALETTE_PREFIX)) return;
    const overId = String(e.over.id);
    const from = regionOf(id);
    const to = regionOf(overId);
    if (!from || !to || from === to) return;
    const after = below(e);
    change((l) => {
      const source = [...l[from]!];
      const target = [...l[to]!];
      if (target.length >= MAX_BLOCKS_PER_REGION) return l;
      const i = source.findIndex((b) => b.id === id);
      if (i < 0) return l;
      const [moved] = source.splice(i, 1);
      const overIndex = target.findIndex((b) => b.id === overId);
      target.splice(overIndex < 0 ? target.length : overIndex + (after ? 1 : 0), 0, { ...moved!, wide: to === schema.wideRegion ? moved!.wide : undefined });
      return { ...l, [from]: source, [to]: target };
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const id = String(e.active.id);
    if (!e.over) return;
    const overId = String(e.over.id);
    const to = regionOf(overId);
    if (!to) return;
    if (id.startsWith(PALETTE_PREFIX)) {
      const list = layout[to]!;
      const at = list.findIndex((b) => b.id === overId);
      addBlock(id.slice(PALETTE_PREFIX.length) as BlockType, to, at < 0 ? list.length : at + (below(e) ? 1 : 0));
      return;
    }
    const from = regionOf(id);
    if (from !== to) return;
    const list = layout[to]!;
    const a = list.findIndex((b) => b.id === id);
    const b = list.findIndex((x) => x.id === overId);
    if (a >= 0 && b >= 0 && a !== b) change((l) => ({ ...l, [to]: arrayMove(l[to]!, a, b) }));
  };

  const doSave = (reset: boolean) =>
    start(async () => {
      const r = await save(key, reset ? null : layout);
      if (!r.ok) return setMsg(r.error);
      setDirty((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
      setMsg(reset ? "Back to the original layout." : "Saved. The page shows it now.");
      router.refresh();
    });

  const undo = () => {
    setDrafts((d) => ({ ...d, [key]: layouts[key]! }));
    setDirty((s) => {
      const n = new Set(s);
      n.delete(key);
      return n;
    });
    setMsg("Changes undone.");
  };

  const used = useMemo(() => new Set(Object.values(layout).flatMap((l) => l.map((b) => b.type))), [layout]);
  const firstRegion = schema.regions.find((r) => r.id === "main")?.id ?? schema.regions[0]!.id;

  return (
    <div className="layout-editor">
      {pages.length > 1 && (
        <nav className="tabs small layout-pages" aria-label="Page">
          {pages.map((p) => (
            <button key={p.key} type="button" className={`btn link${p.key === key ? " active" : ""}`} aria-current={p.key === key ? "page" : undefined} onClick={() => setKey(p.key)}>
              {p.label}
              {dirty.has(p.key) && <span className="dirty-dot" title="Unsaved changes" />}
              {p.badge && <span className="badge small">{p.badge}</span>}
            </button>
          ))}
        </nav>
      )}
      {intro}
      <p className="small muted">{schema.blurb}</p>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
        <div className="layout-work">
          <aside className="layout-palette" aria-label="Blocks you can add">
            <h3>Blocks</h3>
            <p className="small muted">Drag one onto the page, or click to add it.</p>
            <ul>
              {schema.types
                .filter((t) => !schema.required.includes(t))
                .map((t) => (
                  <PaletteItem key={t} type={t} used={used.has(t)} onAdd={() => addBlock(t, firstRegion)} />
                ))}
            </ul>
          </aside>

          <div className={`layout-regions regions-${schema.regions.length} layout-${page.schema}`}>
            {schema.regions.map((region) => (
              <Region key={region.id} id={region.id} label={region.label} blocks={layout[region.id] ?? []}>
                {(layout[region.id] ?? []).map((block) => (
                  <SortableBlock
                    key={block.id}
                    block={block}
                    open={open === block.id}
                    required={schema.required.includes(block.type)}
                    wideOption={region.id === schema.wideRegion}
                    onToggle={() => setOpen((o) => (o === block.id ? null : block.id))}
                    onEdit={(patch) => editBlock(block.id, patch)}
                    onRemove={() => removeBlock(block.id)}
                  />
                ))}
              </Region>
            ))}
          </div>
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
          {active && (
            <div className="layout-block overlay">
              <div className="layout-block-head">
                <span className="drag-handle" aria-hidden>
                  ⠿
                </span>
                <span aria-hidden>{info(active.type).icon}</span>
                <strong>{info(active.type).label}</strong>
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <div className="layout-actions">
        <button type="button" className="btn" disabled={pending || !dirty.has(key)} onClick={() => doSave(false)}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn secondary" disabled={pending || !dirty.has(key)} onClick={undo}>
          Undo changes
        </button>
        <button type="button" className="btn link small" disabled={pending} onClick={() => doSave(true)}>
          {resetLabel}
        </button>
        {makeDefault &&
          (defaultKey === key ? (
            <span className="small muted">✓ This is the site&rsquo;s default home page</span>
          ) : (
            <button
              type="button"
              className="btn secondary small"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await makeDefault(key);
                  setMsg(r.ok ? `${page.label} is now the site's default home page.` : r.error);
                  if (r.ok) router.refresh();
                })
              }
            >
              Make this the site default
            </button>
          ))}
        {page.previewHref && (
          <Link href={page.previewHref} target="_blank" className="small">
            Preview saved ↗
          </Link>
        )}
        {dirty.has(key) && !msg && <span className="small muted">Unsaved changes</span>}
        {msg && (
          <span className="small" role="status">
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}

function PaletteItem({ type, used, onAdd }: { type: BlockType; used: boolean; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `${PALETTE_PREFIX}${type}` });
  const i = info(type);
  return (
    <li>
      <button
        ref={setNodeRef}
        type="button"
        className={`palette-item${isDragging ? " dragging" : ""}`}
        title={i.hint}
        onClick={onAdd}
        {...listeners}
        {...attributes}
      >
        <span aria-hidden>{i.icon}</span> {i.label}
        {used && <span className="small muted"> · on page</span>}
      </button>
    </li>
  );
}

function Region({ id, label, blocks, children }: { id: string; label: string; blocks: Block[]; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${REGION_PREFIX}${id}` });
  return (
    <section ref={setNodeRef} className={`layout-region${isOver ? " over" : ""}`}>
      <h3>{label}</h3>
      <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        <ol className="layout-blocks">{children}</ol>
      </SortableContext>
      {blocks.length === 0 && <p className="layout-empty small muted">Drop blocks here</p>}
    </section>
  );
}

function SortableBlock({
  block,
  open,
  required,
  wideOption,
  onToggle,
  onEdit,
  onRemove,
}: {
  block: Block;
  open: boolean;
  required: boolean;
  wideOption: boolean;
  onToggle: () => void;
  onEdit: (patch: Partial<Block>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const i = info(block.type);
  const style = { transform: CSS.Transform.toString(transform), transition };
  const editable = !i.noTitle || i.limit || block.type === "text" || wideOption;
  return (
    <li ref={setNodeRef} style={style} className={`layout-block${isDragging ? " dragging" : ""}${open ? " open" : ""}`}>
      <div className="layout-block-head">
        <button ref={setActivatorNodeRef} type="button" className="drag-handle" aria-label={`Drag ${i.label}`} {...listeners} {...attributes}>
          ⠿
        </button>
        <span aria-hidden>{i.icon}</span>
        <button type="button" className="layout-block-name" onClick={editable ? onToggle : undefined} aria-expanded={editable ? open : undefined}>
          <strong>{i.label}</strong>
          {block.title && block.title !== i.label && <span className="muted small"> “{block.title}”</span>}
          {block.limit != null && <span className="muted small"> · {block.limit}</span>}
          {block.wide && <span className="muted small"> · wide</span>}
        </button>
        {editable && (
          <button type="button" className="btn link small" aria-label="Edit block" onClick={onToggle}>
            {open ? "Done" : "Edit"}
          </button>
        )}
        {!required && (
          <button type="button" className="btn link small danger-text" aria-label={`Remove ${i.label}`} onClick={onRemove}>
            ✕
          </button>
        )}
      </div>
      {open && (
        <div className="layout-block-fields">
          <p className="small muted">{i.hint}</p>
          {!i.noTitle && (
            <label className="small">
              {block.type === "title" ? "Heading" : "Heading (empty for none)"}
              <input value={block.title} maxLength={TITLE_MAX} onChange={(e) => onEdit({ title: e.target.value })} />
            </label>
          )}
          {i.limit && (
            <label className="small">
              How many
              <input
                type="number"
                min={1}
                max={i.limit.max}
                value={block.limit ?? i.limit.def}
                onChange={(e) => onEdit({ limit: Math.max(1, Math.min(i.limit!.max, Number(e.target.value) || 1)) })}
              />
            </label>
          )}
          {wideOption && (
            <label className="small switch">
              <input type="checkbox" checked={block.wide === true} onChange={(e) => onEdit({ wide: e.target.checked || undefined })} /> Two columns wide
            </label>
          )}
          {block.type === "text" && (
            <label className="small layout-text">
              Message (a blank line starts a new paragraph)
              <textarea rows={3} maxLength={TEXT_MAX} value={block.text ?? ""} onChange={(e) => onEdit({ text: e.target.value })} />
            </label>
          )}
        </div>
      )}
    </li>
  );
}
