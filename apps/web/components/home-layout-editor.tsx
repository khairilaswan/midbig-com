"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { TEMPLATES, type TemplateId } from "@midbig/shared";
import { adminSaveHomeLayout } from "@/app/admin-actions";
import {
  BLOCK_TEMPLATES,
  BLOCK_TYPE_IDS,
  BLOCK_TYPES,
  DEFAULT_LAYOUTS,
  MAX_BLOCKS_PER_REGION,
  newBlock,
  REGIONS,
  TEXT_MAX,
  TITLE_MAX,
  type Block,
  type BlockTemplate,
  type BlockType,
  type HomeLayouts,
  type TemplateLayout,
} from "@/lib/home-layout";

type Drag = { region: string; index: number } | null;

/**
 * Admin editor for the home page templates. Pick a template, then add,
 * remove, reorder (buttons or drag and drop) and edit its blocks in each
 * region. Nothing changes on the site until Save.
 */
export function HomeLayoutEditor({ layouts, siteTemplate }: { layouts: HomeLayouts; siteTemplate: TemplateId }) {
  const router = useRouter();
  const [template, setTemplate] = useState<BlockTemplate>(siteTemplate === "markets" ? "hub" : (siteTemplate as BlockTemplate));
  const [drafts, setDrafts] = useState<HomeLayouts>(layouts);
  const [dirty, setDirty] = useState<Set<BlockTemplate>>(new Set());
  const [drag, setDrag] = useState<Drag>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");

  const layout = drafts[template];

  const change = (fn: (l: TemplateLayout) => TemplateLayout) => {
    setDrafts((d) => ({ ...d, [template]: fn(d[template]) }));
    setDirty((s) => new Set(s).add(template));
    setMsg("");
  };

  const editBlock = (region: string, index: number, patch: Partial<Block>) =>
    change((l) => ({ ...l, [region]: l[region]!.map((b, i) => (i === index ? { ...b, ...patch } : b)) }));

  const removeBlock = (region: string, index: number) => change((l) => ({ ...l, [region]: l[region]!.filter((_, i) => i !== index) }));

  /** Moves a block to a region and position, in the same region or another. */
  const moveBlock = (from: { region: string; index: number }, toRegion: string, toIndex: number) =>
    change((l) => {
      const next: TemplateLayout = { ...l };
      const source = [...next[from.region]!];
      const [block] = source.splice(from.index, 1);
      if (!block) return l;
      next[from.region] = source;
      const target = from.region === toRegion ? source : [...next[toRegion]!];
      if (target.length >= MAX_BLOCKS_PER_REGION && from.region !== toRegion) return l;
      const at = Math.max(0, Math.min(target.length, toIndex));
      target.splice(at, 0, { ...block, wide: toRegion === "grid" ? block.wide : undefined });
      next[toRegion] = target;
      return next;
    });

  const addBlock = (region: string, type: BlockType) =>
    change((l) => (l[region]!.length >= MAX_BLOCKS_PER_REGION ? l : { ...l, [region]: [...l[region]!, newBlock(type)] }));

  const save = (reset: boolean) =>
    start(async () => {
      const r = await adminSaveHomeLayout(template, reset ? null : layout);
      if (!r.ok) return setMsg(r.error);
      if (reset) setDrafts((d) => ({ ...d, [template]: DEFAULT_LAYOUTS[template] }));
      setDirty((s) => {
        const n = new Set(s);
        n.delete(template);
        return n;
      });
      setMsg(reset ? "Put back to the original layout." : "Saved. The home page shows it now.");
      router.refresh();
    });

  return (
    <div className="layout-editor">
      <nav className="tabs small" aria-label="Template">
        {BLOCK_TEMPLATES.map((t) => (
          <button key={t} type="button" className={`btn link${t === template ? " active" : ""}`} aria-current={t === template ? "page" : undefined} onClick={() => setTemplate(t)}>
            {TEMPLATES[t].name}
            {dirty.has(t) ? " •" : ""}
            {t === siteTemplate ? " (site default)" : ""}
          </button>
        ))}
      </nav>
      <p className="small muted">{TEMPLATES[template].blurb}</p>

      <div className={`layout-regions regions-${REGIONS[template].length}`}>
        {REGIONS[template].map((region) => {
          const blocks = layout[region.id] ?? [];
          return (
            <section
              key={region.id}
              className={`layout-region${drag ? " drop-ok" : ""}`}
              onDragOver={(e) => drag && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (drag) moveBlock(drag, region.id, blocks.length);
                setDrag(null);
              }}
            >
              <h3>{region.label}</h3>
              {blocks.length === 0 && <p className="small muted">Empty. Add a block below or drag one here.</p>}
              <ol className="layout-blocks">
                {blocks.map((block, i) => {
                  const info = BLOCK_TYPES[block.type];
                  return (
                    <li
                      key={block.id}
                      className={`layout-block${drag?.region === region.id && drag.index === i ? " dragging" : ""}`}
                      draggable
                      onDragStart={(e) => {
                        // Don't start a drag from inside a text box.
                        if ((e.target as HTMLElement).closest("input, textarea, select")) return e.preventDefault();
                        e.dataTransfer.effectAllowed = "move";
                        setDrag({ region: region.id, index: i });
                      }}
                      onDragEnd={() => setDrag(null)}
                      onDragOver={(e) => drag && e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (drag) moveBlock(drag, region.id, i);
                        setDrag(null);
                      }}
                    >
                      <div className="layout-block-head">
                        <span className="drag-handle" aria-hidden title="Drag to move">
                          ⠿
                        </span>
                        <strong>{info.label}</strong>
                        <span className="row-gap layout-block-tools">
                          <button type="button" className="btn link small" aria-label="Move up" disabled={i === 0} onClick={() => moveBlock({ region: region.id, index: i }, region.id, i - 1)}>
                            ↑
                          </button>
                          <button
                            type="button"
                            className="btn link small"
                            aria-label="Move down"
                            disabled={i === blocks.length - 1}
                            onClick={() => moveBlock({ region: region.id, index: i }, region.id, i + 1)}
                          >
                            ↓
                          </button>
                          <select
                            aria-label="Move to another region"
                            value=""
                            onChange={(e) => e.target.value && moveBlock({ region: region.id, index: i }, e.target.value, Number.MAX_SAFE_INTEGER)}
                          >
                            <option value="">Move to…</option>
                            {REGIONS[template]
                              .filter((r) => r.id !== region.id)
                              .map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.label}
                                </option>
                              ))}
                          </select>
                          <button type="button" className="btn link small danger-text" aria-label="Remove block" onClick={() => removeBlock(region.id, i)}>
                            Remove
                          </button>
                        </span>
                      </div>
                      <p className="small muted">{info.hint}</p>
                      <div className="layout-block-fields">
                        {block.type !== "compose" && block.type !== "sortTabs" && block.type !== "tickerTape" && (
                          <label className="small">
                            {block.type === "title" ? "Heading" : "Heading (empty for none)"}
                            <input value={block.title} maxLength={TITLE_MAX} onChange={(e) => editBlock(region.id, i, { title: e.target.value })} />
                          </label>
                        )}
                        {info.limit && (
                          <label className="small">
                            How many
                            <input
                              type="number"
                              min={1}
                              max={info.limit.max}
                              value={block.limit ?? info.limit.def}
                              onChange={(e) => editBlock(region.id, i, { limit: Math.max(1, Math.min(info.limit!.max, Number(e.target.value) || 1)) })}
                            />
                          </label>
                        )}
                        {template === "dashboard" && region.id === "grid" && (
                          <label className="small switch">
                            <input type="checkbox" checked={block.wide === true} onChange={(e) => editBlock(region.id, i, { wide: e.target.checked || undefined })} /> Two
                            columns wide
                          </label>
                        )}
                        {block.type === "text" && (
                          <label className="small layout-text">
                            Message (a blank line starts a new paragraph)
                            <textarea rows={3} maxLength={TEXT_MAX} value={block.text ?? ""} onChange={(e) => editBlock(region.id, i, { text: e.target.value })} />
                          </label>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
              {blocks.length < MAX_BLOCKS_PER_REGION && (
                <select
                  className="layout-add"
                  aria-label={`Add a block to ${region.label}`}
                  value=""
                  onChange={(e) => e.target.value && addBlock(region.id, e.target.value as BlockType)}
                >
                  <option value="">+ Add a block…</option>
                  {BLOCK_TYPE_IDS.map((t) => (
                    <option key={t} value={t}>
                      {BLOCK_TYPES[t].label}
                    </option>
                  ))}
                </select>
              )}
            </section>
          );
        })}
      </div>

      <div className="row-gap layout-actions">
        <button type="button" className="btn" disabled={pending || !dirty.has(template)} onClick={() => save(false)}>
          {pending ? "Saving…" : `Save ${TEMPLATES[template].name}`}
        </button>
        <button
          type="button"
          className="btn secondary"
          disabled={pending}
          onClick={() => {
            if (dirty.has(template)) {
              setDrafts((d) => ({ ...d, [template]: layouts[template] }));
              setDirty((s) => {
                const n = new Set(s);
                n.delete(template);
                return n;
              });
              setMsg("Changes undone.");
            }
          }}
        >
          Undo changes
        </button>
        <button type="button" className="btn link small" disabled={pending} onClick={() => save(true)}>
          Reset to original
        </button>
        <Link href={`/?template=${template}`} target="_blank" className="small">
          Preview saved layout ↗
        </Link>
        {msg && <span className="small">{msg}</span>}
      </div>
    </div>
  );
}
