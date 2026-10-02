/** Display copy only; transport/domain codes remain unchanged in saved intents and results. */
const messages={
  YARD_SCENE_FAILED:['The courtyard could not load. Your progress is saved. Refresh to try again.','Не удалось загрузить двор. Прогресс сохранён. Обновите страницу.'],
  YARD_BINDING_REQUIRED:['This action is not available in this courtyard yet. Nothing was spent.','Это действие пока недоступно в новом дворе. Ресурсы не потрачены.'],
  YARD_STATE_REQUIRES_REVIEW:['Your courtyard needs a save check. Its data has been preserved.','Сохранение двора требует проверки. Данные сохранены.'],
  'visitor is using this goodie':['Wait until the guest has finished with this item.','Подождите, пока гость освободит предмет.'],
  'placement intersects reserved visit path':['A guest is using this path. Choose another spot.','Гость сейчас пользуется этим проходом. Выберите другое место.'],
  'invalid placement':['This item blocks the path here. Choose another spot.','Здесь предмет мешает проходу. Выберите другое место.'],
  'not enough yard currency':['You need more treats for this.','Для этого нужно больше лакомств.'],
  'food not owned':['There is none of this food in your inventory.','Этого корма пока нет в запасе.'],
  'daily letter already claimed':['Today’s letter has already been opened.','Сегодняшнее письмо уже открыто.'],
};
export function yardFeedbackText(language,message){return messages[message]?.[language==='ru'?1:0]??message;}
