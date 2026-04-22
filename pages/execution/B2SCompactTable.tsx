import React from 'react';

interface CompactTableProps {
  headers: string[];
  rows: Array<Array<React.ReactNode>>;
}

export const B2SCompactTable: React.FC<CompactTableProps> = ({ headers, rows }) => {
  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-slate-100 text-slate-700">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-2 py-2 text-left font-semibold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, idx) => (
            <tr key={idx} className="border-t border-slate-100 hover:bg-slate-50">
              {cells.map((cell, i) => (
                <td key={i} className="px-2 py-2 align-top whitespace-nowrap">{cell}</td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="px-2 py-4 text-slate-400" colSpan={headers.length}>暂无数据</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
