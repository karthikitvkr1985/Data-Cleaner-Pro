import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table';
import {
  useGetPreview,
  useGetSuggestions,
  getGetPreviewQueryKey,
} from '@workspace/api-client-react';
import type { Suggestion } from '@workspace/api-client-react';
import { useSessionStore } from '../store/sessionStore';
import { Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

const PAGE_SIZE = 100;

export function DataGrid() {
  const { sessionId, selectedColumn, setSelectedColumn, setActivePanel } = useSessionStore();
  const [showOriginal, setShowOriginal] = useState(false);
  const [page, setPage] = useState(0);

  // Row accumulator keyed by page number — prevents double-appends on refetch
  const rowCache = useRef<Map<number, any[]>>(new Map());
  const [allRows, setAllRows] = useState<any[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [columns, setColumns] = useState<string[]>([]);

  // ── CORRECT hook call: useGetPreview(sessionId, params?, reactQueryOptions?) ──
  // Bug was: mixing react-query options (enabled, queryKey) into the params object,
  // which serialised the whole object as query=[object Object] in the URL.
  const { data: previewData, isLoading, isFetching } = useGetPreview(
    sessionId!,
    { page, page_size: PAGE_SIZE, show_original: showOriginal },
    { query: { enabled: !!sessionId } },
  );

  const { data: suggestionsData } = useGetSuggestions(
    sessionId!,
    undefined,
    { query: { enabled: !!sessionId } },
  );

  // Build a fast suggestion lookup: "colName:rowIndex" → status
  const suggestionMap = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const s of suggestionsData?.suggestions ?? []) {
      if (s.row_index !== null && s.row_index !== undefined) {
        map.set(`${s.column_name}:${s.row_index}`, s.status);
      }
    }
    return map;
  }, [suggestionsData]);

  // Accumulate rows per page; reset cache when showOriginal or sessionId changes
  useEffect(() => {
    rowCache.current = new Map();
    setAllRows([]);
    setPage(0);
  }, [showOriginal, sessionId]);

  useEffect(() => {
    if (!previewData?.rows) return;

    // Store this page in the cache
    rowCache.current.set(previewData.page, previewData.rows);

    // Rebuild allRows from the sorted cache so pages never duplicate
    const sorted = [...rowCache.current.entries()]
      .sort(([a], [b]) => a - b)
      .flatMap(([, rows]) => rows);

    setAllRows(sorted);
    setTotalRows(previewData.total_rows);
    if (columns.length === 0 && previewData.columns.length > 0) {
      setColumns(previewData.columns);
    }
  }, [previewData]);

  // ── TABLE DEFINITION ──
  const columnDefs = useMemo<ColumnDef<any>[]>(() => {
    const cols = columns.length > 0 ? columns : previewData?.columns ?? [];
    return cols.map((colName: string) => ({
      id: colName,
      accessorKey: colName,
      header: colName,
      cell: (info: any) => {
        const val = info.getValue() as string | number | null;
        // Map from absolute row index (position in allRows) to suggestion status
        const key = `${colName}:${info.row.index}`;
        const status = suggestionMap.get(key);
        return (
          <div
            className={[
              'px-2 py-1 truncate text-sm',
              status === 'pending'  ? 'bg-amber-500/15 text-amber-200 font-medium' : '',
              status === 'accepted' ? 'bg-emerald-500/15 text-emerald-300' : '',
              status === 'rejected' ? 'line-through text-muted-foreground/50' : '',
            ].join(' ')}
          >
            {val === null || val === undefined
              ? <span className="text-muted-foreground/50 italic text-xs">null</span>
              : String(val)}
          </div>
        );
      },
      size: 150,
    }));
  }, [columns, previewData?.columns, suggestionMap]);

  const table = useReactTable({
    data: allRows,
    columns: columnDefs,
    getCoreRowModel: getCoreRowModel(),
  });

  // ── VIRTUALIZER ──
  const parentRef = useRef<HTMLDivElement>(null);

  // Only virtualise loaded rows — never pre-size for unloaded rows.
  // Pre-sizing total_rows caused the virtualiser to render thousands of "Loading..."
  // rows instantly, each triggering the scroll-load effect → runaway fetch loop.
  const rowVirtualizer = useVirtualizer({
    count: allRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 15,
  });

  // ── INFINITE SCROLL — IntersectionObserver on a sentinel div ──
  // This replaces the previous virtualizer-items useEffect which fired on every
  // render and caused 1700+ page requests before the user scrolled at all.
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadNextPage = useCallback(() => {
    if (!isFetching && allRows.length < totalRows) {
      setPage(p => p + 1);
    }
  }, [isFetching, allRows.length, totalRows]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) loadNextPage();
      },
      { root: parentRef.current, rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadNextPage]);

  const handleHeaderClick = (colName: string) => {
    setSelectedColumn(colName);
    setActivePanel('inspector');
  };

  if (!sessionId) return null;

  if (isLoading && allRows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-sm text-muted-foreground">Loading data...</span>
      </div>
    );
  }

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div className="flex flex-col h-full bg-card rounded-md border shadow-sm overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-foreground tabular-nums">
            {totalRows.toLocaleString()} rows
          </span>
          {allRows.length < totalRows && (
            <span className="text-xs text-muted-foreground tabular-nums">
              ({allRows.length.toLocaleString()} loaded)
            </span>
          )}
          {isFetching && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading more...
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="show-original"
            checked={showOriginal}
            onCheckedChange={setShowOriginal}
          />
          <Label htmlFor="show-original" className="text-xs text-muted-foreground cursor-pointer">
            Show original
          </Label>
        </div>
      </div>

      {/* Scrollable table area */}
      <div ref={parentRef} className="flex-1 overflow-auto relative">
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {/* Sticky header */}
          <div className="sticky top-0 z-10 flex border-b bg-slate-900 shadow-sm">
            <div className="w-10 shrink-0 border-r border-border/40 bg-muted/60 px-1 py-2 text-center text-xs text-muted-foreground select-none">
              #
            </div>
            {table.getFlatHeaders().map(header => (
              <div
                key={header.id}
                onClick={() => handleHeaderClick(header.column.id)}
                className={[
                  'flex items-center px-2 py-2 font-medium text-xs border-r border-border/40 bg-muted/50',
                  'cursor-pointer hover:bg-muted/80 transition-colors select-none truncate',
                  selectedColumn === header.column.id
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'text-muted-foreground',
                ].join(' ')}
                style={{ width: header.getSize(), minWidth: 80 }}
              >
                {flexRender(header.column.columnDef.header, header.getContext())}
              </div>
            ))}
          </div>

          {/* Virtualised rows */}
          {virtualItems.map(virtualRow => {
            const row = table.getRowModel().rows[virtualRow.index];
            const style: React.CSSProperties = {
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
            };

            if (!row) {
              return (
                <div key={virtualRow.index} style={style}
                  className="flex items-center border-b border-border/30 text-xs text-muted-foreground/40 px-2">
                  —
                </div>
              );
            }

            return (
              <div
                key={row.id}
                style={style}
                className="flex border-b border-border/30 hover:bg-muted/20 transition-colors"
              >
                <div className="w-10 shrink-0 border-r border-border/30 flex items-center justify-center text-xs text-muted-foreground/50 select-none tabular-nums">
                  {virtualRow.index + 1}
                </div>
                {row.getVisibleCells().map(cell => (
                  <div
                    key={cell.id}
                    className="border-r border-border/30 flex items-center overflow-hidden"
                    style={{ width: cell.column.getSize(), minWidth: 80 }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* Sentinel — IntersectionObserver target for infinite scroll */}
        <div ref={sentinelRef} style={{ height: 1 }} aria-hidden />
      </div>
    </div>
  );
}
