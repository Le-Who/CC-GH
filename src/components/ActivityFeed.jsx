import React, { useEffect, useState } from 'react';
import { supabase } from '../vanilla/realtime';

export function ActivityFeed() {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!supabase) return;

    const channel = supabase
      .channel('public:player_events')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'player_events' },
        (payload) => {
          const newEvent = payload.new;
          setEvents((prev) => [newEvent, ...prev].slice(0, 10)); // Keep last 10
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (events.length === 0) return null;

  return (
    <div className="fixed bottom-20 left-4 z-[60] flex flex-col gap-2 pointer-events-none w-64 max-h-64 overflow-hidden">
      {events.map((ev) => {
        let msg = 'did something!';
        if (ev.event_type === 'harvest') {
          const meta = ev.metadata || {};
          msg = meta.is_rare ? 'found a rare crop! ✨' : 'harvested a crop!';
        }
        if (ev.event_type === 'plant') msg = 'planted a seed! 🌱';
        if (ev.event_type === 'sell') msg = 'sold crops for gold! 🪙';
        if (ev.event_type === 'buy_plot') msg = 'expanded their farm! 🚜';
        if (ev.event_type === 'feed_pet') msg = 'fed their pet! 🍖';

        return (
          <div 
            key={ev.id} 
            className="flex items-center bg-black/50 backdrop-blur-md text-white text-xs px-3 py-2 rounded shadow-lg animate-[fade-in-up_0.3s_ease-out]"
          >
            <span className="font-bold text-amber-300 mr-2">{ev.username}</span> 
            <span className="opacity-90">{msg}</span>
          </div>
        );
      })}
    </div>
  );
}
