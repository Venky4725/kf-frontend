import React, { useState, useMemo } from 'react';

export function isRoadmapTask(task) {
  if (!task) return false;
  return task.task_type === 'roadmap' || 
         Boolean(Array.isArray(task.roadmap_entries) && task.roadmap_entries.length > 0) ||
         Boolean(task.description && task.description.startsWith('[ROADMAP]'));
}

const RoadmapEntryRow = ({ entry, isAdmin, onDelete }) => {
  const formatActivities = (text) => {
    if (!text || text === '—') return <span className="text-slate-500 italic">No activities</span>;
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    return (
      <ul className="list-disc pl-4 space-y-1 text-xs text-slate-300">
        {lines.map((line, idx) => (
          <li key={idx} className="leading-relaxed">{line.replace(/^-\s*/, '')}</li>
        ))}
      </ul>
    );
  };

  return (
    <tr className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors group">
      <td className="px-4 py-4 align-top">
        <div className="inline-flex items-center px-2 py-0.5 rounded bg-brand-500/10 border border-brand-500/20 text-brand-400 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">
          {entry.day || 'N/A'}
        </div>
      </td>
      <td className="px-4 py-4 align-top">
        <div className="text-sm font-bold text-white leading-tight">{entry.topic}</div>
      </td>
      <td className="px-4 py-4 align-top">
        <div className="max-h-32 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-600">
          {formatActivities(entry.activities)}
        </div>
      </td>
      <td className="px-4 py-4 align-top">
        {entry.outcome && entry.outcome !== '—' ? (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded p-2">
            <div className="text-[10px] font-semibold text-emerald-400 leading-relaxed flex items-start gap-1.5">
              <span className="shrink-0">🎯</span>
              <span>{entry.outcome}</span>
            </div>
          </div>
        ) : (
          <span className="text-slate-500 italic text-[10px]">No outcome</span>
        )}
      </td>
      {isAdmin && (
        <td className="px-4 py-4 align-top text-center">
          <button 
            onClick={() => onDelete(entry.id)}
            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-400/10 rounded transition-all opacity-0 group-hover:opacity-100"
            title="Delete Day"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </td>
      )}
    </tr>
  );
};

export default function RoadmapTaskCard({ tasks, isAdmin, onDelete, expanded: externalExpanded, onToggle, role }) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  
  const isExpanded = externalExpanded !== undefined ? externalExpanded : internalExpanded;
  const toggle = onToggle || (() => setInternalExpanded(!internalExpanded));

  const entries = useMemo(() => {
    if (!tasks) return [];
    const all = Array.isArray(tasks) ? tasks : [tasks];
    
    return all.flatMap(task => {
      if (Array.isArray(task.roadmap_entries) && task.roadmap_entries.length > 0) {
        return task.roadmap_entries.map(e => ({ ...e, id: task.id }));
      } else if (task.description && task.description.startsWith('[ROADMAP]')) {
        const parts = task.description.replace('[ROADMAP]', '').split('$$$');
        return [{
          id: task.id,
          activities: parts[0] || '—',
          outcome: parts[1] || '—',
          day: parts[2] || task.due_date || 'N/A',
          topic: task.title,
        }];
      } else {
        return [{
          id: task.id,
          day: task.day || task.due_date || 'N/A',
          topic: task.topic || task.title,
          activities: task.activities || task.description || '—',
          outcome: task.outcome || '—'
        }];
      }
    });
  }, [tasks]);

  if (entries.length === 0) return null;

  return (
    <div className="bg-slate-900 rounded-xl shadow-xl border border-slate-800 overflow-hidden mb-6">
      {/* Header */}
      <div 
        className="px-6 py-4 border-b border-slate-800 flex items-center justify-between cursor-pointer hover:bg-slate-800/50 transition-colors"
        onClick={toggle}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center text-brand-400">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
          </div>
          <div>
            <h3 className="text-lg font-black text-white tracking-tight leading-none">
              {role ? `${role} Training Roadmap` : 'Weekly Training Roadmap'}
            </h3>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Structured Learning Schedule • {entries.length} Days</p>
          </div>
        </div>
        <button className="flex items-center gap-2 text-xs font-black text-slate-400 hover:text-white transition-colors uppercase tracking-widest">
          {isExpanded ? 'Collapse' : 'Expand'}
          <svg className={`w-4 h-4 transform transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className={`transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800/50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <th className="px-4 py-3 border-b border-slate-800 w-24">Day</th>
                <th className="px-4 py-3 border-b border-slate-800 w-48">Topic / Theme</th>
                <th className="px-4 py-3 border-b border-slate-800">Key Activities</th>
                <th className="px-4 py-3 border-b border-slate-800 w-48">Outcome</th>
                {isAdmin && <th className="px-4 py-3 border-b border-slate-800 w-16 text-center">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, idx) => (
                <RoadmapEntryRow 
                  key={idx} 
                  entry={entry} 
                  isAdmin={isAdmin} 
                  onDelete={onDelete} 
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Mobile Stacked View (handled by table overflow and styling above, but can be further refined if needed) */}
      <div className="md:hidden bg-slate-800/20 px-4 py-2 text-[10px] font-bold text-slate-500 text-center border-t border-slate-800">
        Swipe left to view full schedule
      </div>
    </div>
  );
}