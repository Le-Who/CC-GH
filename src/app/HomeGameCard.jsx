import {useEffect, useRef, useState} from 'react';
import {ArrowUpRight, Play, Square} from 'lucide-react';
import {homeThumbnailUrl} from './homeGameCopy.js';

const BUBBO_LOOP = '/games/home-thumbnails/bubbo-shot-preview.mp4';

function useMotionPreference() {
  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const update = () => setReduced(query.matches);
    update();query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

// Media only: selecting a game remains the parent's normal navigation path.
// One explicit preview selection belongs to Home, never one timer per card.
export function HomeGameCard({id, title, description, current, currentLabel, disabled, onChoose, language, previewActive, onPreviewStart, onPreviewStop}) {
  const thumbnail = useRef(null), video = useRef(null);
  const [visible, setVisible] = useState(false), [posterReady, setPosterReady] = useState(false);
  const [foreground, setForeground] = useState(() => typeof document === 'undefined' || !document.hidden);
  const [mediaFailed, setMediaFailed] = useState(false);
  const reducedMotion = useMotionPreference();
  useEffect(() => {
    const node = thumbnail.current;
    if (!node) return;
    if (typeof IntersectionObserver !== 'function') {setVisible(true);setPosterReady(true);return;}
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting && entry.intersectionRatio > 0.01);
      if (entry.isIntersecting) setPosterReady(true);
    }, {root: node.closest('.home-catalogue'), threshold: 0.01});
    observer.observe(node);return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const update = () => setForeground(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => {
    const player = video.current;
    if (!player) return;
    if (visible && foreground && previewActive && !reducedMotion) {
      player.play().catch(() => {setMediaFailed(true);onPreviewStop();});
    } else player.pause();
    return () => player.pause();
  }, [visible, foreground, previewActive, reducedMotion, onPreviewStop]);
  useEffect(() => {if (reducedMotion && previewActive) onPreviewStop();}, [reducedMotion, previewActive, onPreviewStop]);
  const canPreview = id === 'bubbo' && !reducedMotion && !mediaFailed;
  const previewLabel = language === 'ru' ? (previewActive ? 'Остановить превью Bubbo' : 'Посмотреть игру Bubbo') : (previewActive ? 'Stop Bubbo preview' : 'Preview Bubbo gameplay');
  return <article className={`home-game${current ? ' home-current' : ''}`}>
    <button type="button" data-home-game={id} className="home-game-open" aria-label={title} aria-current={current ? 'true' : undefined} disabled={disabled} onClick={onChoose}>
      <div className="home-thumbnail" ref={thumbnail}>
        {posterReady && <img src={homeThumbnailUrl(id)} alt="" width="400" height="300" loading="lazy" decoding="async" draggable="false" />}
        {canPreview && previewActive && <video ref={video} className="home-preview-video" src={BUBBO_LOOP} poster={homeThumbnailUrl(id)} muted playsInline loop preload="none" aria-hidden="true" onError={() => {setMediaFailed(true);onPreviewStop();}} />}
        {current && <span className="home-current-label">{currentLabel}</span>}
      </div>
      <div className="home-game-copy"><strong>{title}<ArrowUpRight size={17}/></strong><span>{description}</span></div>
    </button>
    {canPreview && <button type="button" className="home-preview-control" aria-label={previewLabel} aria-pressed={previewActive} disabled={disabled} onClick={previewActive ? onPreviewStop : onPreviewStart}>{previewActive ? <Square size={17}/> : <Play size={19}/>}</button>}
  </article>;
}
