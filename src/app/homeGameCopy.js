// Mechanics are derived from each game's existing instructions, not its cover art.
export const HOME_GAME_COPY = {
  en: {
    garden: { description: 'Grow plants, water them and collect gold.' },
    blox: { title: 'Blox', description: 'Place block shapes. Fill rows or columns to clear them.' },
    match3: { description: 'Swap gems to make matches of three or more.' },
    merge: { description: 'Combine matching items to discover new ones.' },
    bubbo: { title: 'Bubbo', description: 'Aim and shoot. Match three bubbles of one color.' },
    trivia: { description: 'Pick one of four answers. Play solo or with a friend.' },
    room: { description: 'Set out food and decorations. Welcome animal visitors.' },
  },
  ru: {
    garden: { description: 'Выращивайте и поливайте растения, собирайте золото.' },
    blox: { title: 'Blox · Блоки', description: 'Размещайте фигуры. Заполняйте строки или столбцы, чтобы убрать их.' },
    match3: { description: 'Меняйте камни местами и собирайте по три и больше.' },
    merge: { description: 'Объединяйте одинаковые предметы и открывайте новые.' },
    bubbo: { title: 'Bubbo', description: 'Цельтесь и стреляйте. Собирайте по три пузыря одного цвета.' },
    trivia: { description: 'Выбирайте один из четырёх ответов. Играйте соло или с другом.' },
    room: { description: 'Расставляйте корм и украшения. Принимайте зверят в гости.' },
  },
};
export function homeGameCopy(id, language, fallbackTitle = id) {
  const copy = (HOME_GAME_COPY[language] || HOME_GAME_COPY.en)[id] || {};
  return { title: copy.title || fallbackTitle, description: copy.description || '' };
}
