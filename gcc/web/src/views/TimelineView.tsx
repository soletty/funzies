import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import timelineData from '../data/timeline.json';
import type { TimelineData, HistoricalEvent } from '../types';

interface TimelineViewProps {
  onSelectEntity?: (type: string, id: string) => void;
}

const CATEGORY_MAP: Record<string, { label: string; color: string }> = {
  political: { label: 'Political', color: '#2C3E50' },
  military: { label: 'Military', color: '#C0392B' },
  treaty: { label: 'Diplomatic', color: '#C4643A' },
  founding: { label: 'Founding', color: '#1ABC9C' },
  discovery: { label: 'Cultural', color: '#8E44AD' },
  migration: { label: 'Migration', color: '#D4876A' },
  other: { label: 'Other', color: '#7f8c8d' },
};

const MILITARY_TYPES = new Set([
  'military', 'coup', 'palace_coup', 'political_coup', 'coup_attempt',
  'battle', 'tribal_battle', 'military_conflict', 'military_campaign',
  'military_conquest', 'military_victory', 'military_defeat', 'military_action',
  'military_occupation', 'military_alliance', 'conflict', 'civil_war', 'war',
  'conquest', 'rebellion', 'insurrection', 'resistance', 'assassination',
]);

const TREATY_TYPES = new Set([
  'treaty', 'diplomatic_treaty', 'diplomatic', 'diplomatic_visit',
  'diplomatic_mission', 'diplomatic_appointment', 'political_agreement',
]);

const FOUNDING_TYPES = new Set([
  'founding', 'political_founding', 'administrative_founding',
  'institutional_founding', 'organization_founding', 'federation',
  'independence', 'establishment',
]);

const CULTURAL_TYPES = new Set([
  'discovery', 'creative_work', 'educational', 'cultural', 'religious', 'religious_reform',
]);

function getCategory(eventType: string | null): string {
  if (!eventType) return 'other';
  if (eventType === 'political') return 'political';
  if (eventType === 'migration') return 'migration';
  if (MILITARY_TYPES.has(eventType)) return 'military';
  if (TREATY_TYPES.has(eventType)) return 'treaty';
  if (FOUNDING_TYPES.has(eventType)) return 'founding';
  if (CULTURAL_TYPES.has(eventType)) return 'discovery';
  return 'other';
}

function getColor(eventType: string | null): string {
  return CATEGORY_MAP[getCategory(eventType)]?.color ?? '#7f8c8d';
}

function parseYear(y: unknown): number | null {
  if (typeof y === 'number') return y;
  if (typeof y === 'string') {
    const n = parseInt(y, 10);
    return isNaN(n) ? null : n;
  }
  return null;
}

export default function TimelineView({ onSelectEntity }: TimelineViewProps) {
  const data = timelineData as TimelineData;
  const listRef = useRef<HTMLDivElement>(null);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(
    new Set(Object.keys(CATEGORY_MAP))
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [activeEra, setActiveEra] = useState<string | null>(null);
  const eraRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Filter events that have valid years
  const allEvents = useMemo(() => {
    return data.events
      .map(e => ({ ...e, parsedYear: parseYear(e.year) }))
      .filter((e): e is typeof e & { parsedYear: number } => e.parsedYear !== null)
      .sort((a, b) => a.parsedYear - b.parsedYear);
  }, [data.events]);

  const filteredEvents = useMemo(() => {
    return allEvents.filter(e => {
      const cat = getCategory(e.eventType);
      if (!activeFilters.has(cat)) return false;
      if (activeEra) {
        const era = data.eras.find(er => er.id === activeEra);
        if (era && (e.parsedYear < era.startYear || e.parsedYear > era.endYear)) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = e.title?.toLowerCase().includes(q);
        const matchDesc = e.description?.toLowerCase().includes(q);
        const matchParticipant = e.participants.some(p => p.entityId.replace(/_/g, ' ').toLowerCase().includes(q));
        if (!matchTitle && !matchDesc && !matchParticipant) return false;
      }
      return true;
    });
  }, [allEvents, activeFilters, activeEra, searchQuery, data.eras]);

  // Group events by decade
  const decades = useMemo(() => {
    const groups = new Map<number, typeof filteredEvents>();
    for (const event of filteredEvents) {
      const decade = Math.floor(event.parsedYear / 10) * 10;
      if (!groups.has(decade)) groups.set(decade, []);
      groups.get(decade)!.push(event);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);
  }, [filteredEvents]);

  const toggleFilter = useCallback((category: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  const scrollToEra = useCallback((eraId: string) => {
    setActiveEra(prev => prev === eraId ? null : eraId);
  }, []);

  // Scroll to decade when era filter changes
  useEffect(() => {
    if (activeEra && listRef.current) {
      const era = data.eras.find(e => e.id === activeEra);
      if (era) {
        const targetDecade = Math.floor(era.startYear / 10) * 10;
        const el = eraRefs.current.get(String(targetDecade));
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    }
  }, [activeEra, data.eras]);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Controls */}
      <div className="bg-bg/95 backdrop-blur-sm border-b border-border px-4 sm:px-6 py-3 sm:py-4 space-y-3 z-10">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-text">Timeline</h1>
            <p className="text-text-tertiary text-xs mt-0.5">
              {filteredEvents.length} of {allEvents.length} events
            </p>
          </div>

          {/* Search */}
          <div className="relative w-48 sm:w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search events..."
              className="w-full text-xs bg-bg-subtle border border-border rounded-lg px-3 py-2 text-text
                         focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-text-tertiary"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text text-xs"
              >
                &times;
              </button>
            )}
          </div>
        </div>

        {/* Era pills + filter pills on same row */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mr-1">Era</span>
          {data.eras.map(era => (
            <button
              key={era.id}
              onClick={() => scrollToEra(era.id)}
              className="px-2 py-1 text-[11px] font-medium rounded-md transition-all"
              style={{
                backgroundColor: activeEra === era.id ? era.color : era.color + '15',
                color: activeEra === era.id ? 'white' : era.color,
                border: `1px solid ${activeEra === era.id ? era.color : era.color + '30'}`,
              }}
            >
              {era.label}
            </button>
          ))}

          <div className="w-px h-5 bg-border mx-1" />

          <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mr-1">Type</span>
          {Object.entries(CATEGORY_MAP).map(([key, { label, color }]) => (
            <button
              key={key}
              onClick={() => toggleFilter(key)}
              className="px-2 py-1 text-[11px] font-medium rounded-md transition-all"
              style={{
                backgroundColor: activeFilters.has(key) ? color : 'transparent',
                color: activeFilters.has(key) ? 'white' : color,
                border: `1px solid ${color}50`,
                opacity: activeFilters.has(key) ? 1 : 0.4,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Vertical scrolling timeline */}
      <div ref={listRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6 sm:py-10 relative">
          {/* Central vertical line */}
          <div className="absolute left-[27px] sm:left-[35px] top-0 bottom-0 w-px bg-border" />

          {decades.map(([decade, events]) => (
            <div
              key={decade}
              ref={el => { if (el) eraRefs.current.set(String(decade), el); }}
            >
              {/* Decade marker */}
              <div className="relative flex items-center mb-4 mt-6 first:mt-0">
                <div
                  className="relative z-10 w-[18px] h-[18px] sm:w-[22px] sm:h-[22px] rounded-full border-2 border-accent bg-bg flex items-center justify-center flex-shrink-0"
                  style={{ marginLeft: '18px', marginRight: 0 }}
                >
                  <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-accent" />
                </div>
                <span className="ml-3 font-display text-base sm:text-lg font-bold text-text">
                  {decade}s
                </span>
                <span className="ml-2 text-xs text-text-tertiary">
                  {events.length} event{events.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Events in this decade */}
              {events.map(event => (
                <TimelineEvent
                  key={event.id}
                  event={event}
                  year={event.parsedYear}
                  isSelected={selectedEvent === event.id}
                  onSelect={() => setSelectedEvent(selectedEvent === event.id ? null : event.id)}
                  onSelectEntity={onSelectEntity}
                />
              ))}
            </div>
          ))}

          {filteredEvents.length === 0 && (
            <div className="text-center py-20 text-text-tertiary">
              <p className="text-lg font-display">No events match your filters</p>
              <p className="text-sm mt-1">Try adjusting your search or filter criteria</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface TimelineEventProps {
  event: HistoricalEvent;
  year: number;
  isSelected: boolean;
  onSelect: () => void;
  onSelectEntity?: (type: string, id: string) => void;
}

function TimelineEvent({ event, year, isSelected, onSelect, onSelectEntity }: TimelineEventProps) {
  const color = getColor(event.eventType);
  const cat = getCategory(event.eventType);
  const catInfo = CATEGORY_MAP[cat];

  return (
    <div className="relative pl-[52px] sm:pl-[62px] pb-3 group">
      {/* Dot on the line */}
      <div
        className="absolute left-[24px] sm:left-[32px] top-[10px] w-[7px] h-[7px] rounded-full z-10 ring-2 ring-bg transition-transform group-hover:scale-125"
        style={{ backgroundColor: color }}
      />

      {/* Card */}
      <motion.div
        onClick={onSelect}
        className="rounded-lg cursor-pointer overflow-hidden transition-shadow"
        style={{
          borderLeft: `3px solid ${color}`,
          backgroundColor: isSelected ? 'var(--color-bg-raised)' : 'var(--color-bg)',
          boxShadow: isSelected
            ? `0 2px 12px rgba(0,0,0,0.08), inset 0 0 0 1px ${color}20`
            : '0 1px 3px rgba(0,0,0,0.04)',
        }}
        whileHover={{ x: 2 }}
        transition={{ duration: 0.15 }}
      >
        <div className="px-3 py-2.5 sm:px-4 sm:py-3">
          {/* Top row: year + category */}
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-[11px] font-bold tabular-nums"
              style={{ color }}
            >
              {year}{event.endYear ? `–${event.endYear}` : ''}
            </span>
            <span
              className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{ backgroundColor: color + '12', color: color + 'cc' }}
            >
              {catInfo.label}
            </span>
          </div>

          {/* Title */}
          <h3 className="font-display text-sm sm:text-[15px] font-semibold text-text leading-snug">
            {event.title}
          </h3>

          {/* Description preview */}
          {event.description && !isSelected && (
            <p className="text-xs text-text-secondary mt-1 leading-relaxed line-clamp-2">
              {event.description}
            </p>
          )}

          {/* Participant count hint */}
          {event.participants.length > 0 && !isSelected && (
            <span className="text-[10px] text-text-tertiary mt-1 inline-block">
              {event.participants.length} participant{event.participants.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Expanded content */}
        <AnimatePresence>
          {isSelected && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3 sm:px-4 sm:pb-4 border-t border-border/50 pt-2.5 space-y-2.5">
                {/* Full description */}
                {event.description && (
                  <p className="text-xs text-text-secondary leading-relaxed">
                    {event.description}
                  </p>
                )}

                {/* Significance */}
                {event.significance && (
                  <blockquote
                    className="text-xs italic text-text-tertiary border-l-2 pl-3"
                    style={{ borderColor: color + '50' }}
                  >
                    {event.significance}
                  </blockquote>
                )}

                {/* Outcome */}
                {event.outcome && (
                  <p className="text-xs text-text-secondary">
                    <span className="font-semibold text-text">Outcome: </span>
                    {event.outcome}
                  </p>
                )}

                {/* Participants */}
                {event.participants.length > 0 && (
                  <div>
                    <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                      Participants
                    </span>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {event.participants.map((p, i) => (
                        <button
                          key={i}
                          onClick={e => {
                            e.stopPropagation();
                            onSelectEntity?.(p.entityType, p.entityId);
                          }}
                          className="text-[11px] px-2 py-1 rounded-md bg-bg-subtle text-text-secondary
                                     hover:bg-accent hover:text-white transition-colors"
                          title={p.role ?? undefined}
                        >
                          {p.entityId.replace(/_/g, ' ')}
                          {p.role && (
                            <span className="opacity-60 ml-1">({p.role})</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
