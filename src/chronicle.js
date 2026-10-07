// The town chronicle: a short history of firsts, new eras, decisions and family generations, with the
// year each happened. Shown in the City panel. Saved in city.systems.chronicle (the latest 60 entries).

import { yearOf } from './eras.js';

const KEEP = 60;

export function addChronicle(city, text, at = null, kind = 'note') {
  const list = (city.systems.chronicle ||= []);
  const item = { year: yearOf(city), day: city.day, text, kind, x: at?.x ?? null, y: at?.y ?? null };
  list.push(item);
  if (list.length > KEEP) list.splice(0, list.length - KEEP);
  city.emit('chronicle', { item });
  return item;
}
