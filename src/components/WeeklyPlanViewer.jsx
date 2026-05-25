import React, { useState, useMemo, useCallback } from 'react';

const ChevronDownIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

const CalendarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="16" y1="2" x2="16" y2="6"></line>
    <line x1="8" y1="2" x2="8" y2="6"></line>
    <line x1="3" y1="10" x2="21" y2="10"></line>
  </svg>
);

const TargetIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <circle cx="12" cy="12" r="6"></circle>
    <circle cx="12" cy="12" r="2"></circle>
  </svg>
);

const DayCard = React.memo(({ item, index, isExpanded, onToggle }) => {
  // Rotate through brand-friendly colors for a nice visual accent on the left
  const borderColors = ['border-brand-500', 'border-coastal-teal', 'border-intern-500', 'border-tl-500', 'border-admin-500'];
  const accentColor = borderColors[index % borderColors.length];

  return (
    <div className={`relative bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow mb-4`}>
      <div className={`absolute top-0 left-0 bottom-0 w-1.5 bg-brand-500 ${accentColor}`}></div>
      
      <div className="pl-5 pr-4 py-4">
        {/* Header: Day and Topic */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-brand-50 text-brand-700 text-xs font-bold uppercase tracking-wider">
                <CalendarIcon />
                {item.day || `Day ${index + 1}`}
              </span>
            </div>
            <h3 className="text-lg font-bold text-slate-900 leading-tight">
              {item.topic || 'No topic provided'}
            </h3>
          </div>
        </div>

        {/* Outcome */}
        {item.outcome && (
          <div className="flex items-start gap-2 mb-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
            <div className="text-brand-600 mt-0.5"><TargetIcon /></div>
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Daily Outcome</div>
              <div className="text-sm text-slate-800 font-medium">{item.outcome}</div>
            </div>
          </div>
        )}

        {/* Activities Accordion */}
        {item.activities && (
          <div className="mt-2 border-t border-slate-100 pt-2">
            <button 
              onClick={() => onToggle(index)}
              className="flex items-center justify-between w-full py-2 text-sm font-semibold text-slate-700 hover:text-brand-600 transition-colors"
            >
              <span className="flex items-center gap-2">
                <span>Key Activities &amp; Exercises</span>
                <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full">
                  {isExpanded ? 'Hide' : 'Show'}
                </span>
              </span>
              <ChevronDownIcon className={`transform transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
            
            <div 
              className={`grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100 mt-2' : 'grid-rows-[0fr] opacity-0'}`}
            >
              <div className="overflow-hidden">
                <div className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed pb-3">
                  {item.activities}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
DayCard.displayName = 'DayCard';

const WeeklyPlanViewer = React.memo(({ planData, loading, weekTitle }) => {
  const [expandedIndices, setExpandedIndices] = useState(new Set([0])); // Expand first day by default

  const toggleExpand = useCallback((index) => {
    setExpandedIndices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  }, []);

  const hasData = useMemo(() => Array.isArray(planData) && planData.length > 0, [planData]);

  if (loading) {
    return (
      <div className="w-full space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-32 bg-slate-100 animate-pulse rounded-xl w-full"></div>
        ))}
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="w-full bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
        <div className="text-4xl mb-3">📅</div>
        <h3 className="text-lg font-semibold text-slate-700 mb-1">No learning plan available</h3>
        <p className="text-sm text-slate-500">The weekly schedule hasn't been published yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto">
      {/* Sticky Header */}
      {weekTitle && (
        <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-slate-200 px-1 py-3 mb-4">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <span className="text-brand-500">📘</span> {weekTitle}
          </h2>
        </div>
      )}

      {/* Timeline / Scrollable Container */}
      <div className="relative pl-2 sm:pl-4 max-h-[800px] overflow-y-auto pr-2 pb-4">
        {/* Timeline Line */}
        <div className="absolute left-[27px] sm:left-[35px] top-4 bottom-4 w-px bg-slate-200 -z-10 hidden sm:block"></div>
        
        {planData.map((item, index) => (
          <div key={index} className="relative sm:pl-10">
            {/* Timeline Dot */}
            <div className="absolute left-0 top-6 w-4 h-4 rounded-full bg-white border-4 border-brand-500 -ml-[7px] hidden sm:block"></div>
            
            <DayCard 
              item={item} 
              index={index} 
              isExpanded={expandedIndices.has(index)} 
              onToggle={toggleExpand} 
            />
          </div>
        ))}
      </div>
    </div>
  );
});
WeeklyPlanViewer.displayName = 'WeeklyPlanViewer';

export default WeeklyPlanViewer;
