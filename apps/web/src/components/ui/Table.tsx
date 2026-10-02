import React, { forwardRef } from "react";
import { cn } from "../../utils/cn";

export const Table = forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative w-full overflow-auto rounded-xl border border-white/[0.08] bg-slate-950/40">
      <table ref={ref} className={cn("w-full caption-bottom text-xs text-left", className)} {...props}>
        {children}
      </table>
    </div>
  ),
);
Table.displayName = "Table";

export const TableHeader = forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, children, ...props }, ref) => (
    <thead ref={ref} className={cn("bg-slate-900/80 border-b border-white/[0.08] font-mono text-slate-400 uppercase tracking-wider text-[11px]", className)} {...props}>
      {children}
    </thead>
  ),
);
TableHeader.displayName = "TableHeader";

export const TableBody = forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, children, ...props }, ref) => (
    <tbody ref={ref} className={cn("divide-y divide-white/[0.04]", className)} {...props}>
      {children}
    </tbody>
  ),
);
TableBody.displayName = "TableBody";

export const TableRow = forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, children, ...props }, ref) => (
    <tr ref={ref} className={cn("transition-colors hover:bg-white/[0.02] data-[state=selected]:bg-cyan-500/10", className)} {...props}>
      {children}
    </tr>
  ),
);
TableRow.displayName = "TableRow";

export const TableHead = forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, children, ...props }, ref) => (
    <th ref={ref} className={cn("h-10 px-4 text-left font-medium text-slate-400", className)} {...props}>
      {children}
    </th>
  ),
);
TableHead.displayName = "TableHead";

export const TableCell = forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, children, ...props }, ref) => (
    <td ref={ref} className={cn("p-4 align-middle text-slate-300", className)} {...props}>
      {children}
    </td>
  ),
);
TableCell.displayName = "TableCell";
