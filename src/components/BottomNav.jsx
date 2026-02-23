import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const TABS = [
  { id: 'trivia', icon: '🧠', label: 'Trivia' },
  { id: 'blox', icon: '🧱', label: 'Blox' },
  { id: 'farm', icon: '🌱', label: 'Farm' },
  { id: 'match3', icon: '💎', label: 'Match-3' },
  { id: 'merge', icon: '🧩', label: 'Merge' },
];

export default function BottomNav({ activeTab, onTabSelect }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 h-[68px] pb-safe z-50">
      <div className="absolute inset-0 bg-[#0D0F1A]/90 backdrop-blur-xl border-t border-white/10" />
      
      <div className="relative flex justify-around items-stretch h-full px-2">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          
          return (
            <button
              key={tab.id}
              onClick={() => onTabSelect(tab.id)}
              className={twMerge(
                clsx(
                  "relative flex flex-col items-center justify-center flex-1 transition-colors duration-300",
                  isActive ? "text-primary" : "text-white/40 hover:text-white/60"
                )
              )}
            >
              {/* Animated Background Pill */}
              {isActive && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute inset-x-2 inset-y-1 bg-primary/15 border border-primary/30 rounded-xl shadow-[0_0_12px_rgba(167,139,250,0.3)] z-0"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
              
              <motion.span 
                className="relative z-10 text-2xl mb-1"
                animate={{ 
                  y: isActive ? -4 : 0, 
                  scale: isActive ? 1.15 : 1,
                  filter: isActive ? 'drop-shadow(0 4px 8px rgba(167,139,250,0.6))' : 'none'
                }}
              >
                {tab.icon}
              </motion.span>
              <span className="relative z-10 text-[10px] uppercase tracking-wider font-bold">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
