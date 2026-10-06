// A separate lazy entry preserves the normal immutable Yard-data boundary.
import('./preview-app.jsx').catch(() => {
  const root = document.getElementById('root');
  root.textContent = 'Не удалось загрузить предпросмотр. Обновите страницу.';
});
