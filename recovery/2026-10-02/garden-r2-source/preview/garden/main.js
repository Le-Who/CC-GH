import { installGardenIsolation } from './isolation.js';
try {
  if (!__OFFLINE_PREVIEW__) throw new Error('Garden preview requires its dedicated offline build');
  if (window.self === window.top) window.location.replace(`./index.html${window.location.search}`);
  else {
    installGardenIsolation();
    await import('./host.jsx');
  }
} catch (error) {
  const root = document.getElementById('root');
  root.textContent = `Garden local preview could not start: ${error.message}`;
  root.setAttribute('role', 'alert');
  console.error(error);
}
