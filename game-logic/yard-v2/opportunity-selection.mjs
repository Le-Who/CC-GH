/** Shared original lottery. Media support never filters this pool or retries selection. */
import {YARD_FOODS,YARD_VISITORS,getYardConditionProfile} from './catalog.mjs';
import {lookup,randomUnit,randomInt,hash32,digest,integer,compareText} from './util.mjs';
export function matchingVisitorCandidates(goodie, bowl, condition) {
  const food = lookup(YARD_FOODS, bowl.foodId), profile = getYardConditionProfile(goodie, condition);
  if (!food) return [];
  const tags = new Set([...(goodie.tags || []), ...(food.tags || [])]);
  return Object.values(YARD_VISITORS).filter((v) => !v.requires
    || v.requires.goodieId === goodie.id && v.requires.foodId === bowl.foodId).map((visitor) => {
    const matches = visitor.tags.filter((t) => tags.has(t)).length;
    return { visitor, matches, strict: !!visitor.requires,
      weight: Math.max(1, visitor.baseWeight * (visitor.requires ? 18 : 1) + matches * 4) * food.attraction * profile.attraction };
  }).filter((x) => x.matches || x.strict);
}
function chooseVisitor(pool, key) {
  const strict = pool.filter((p) => p.strict);
  if (strict.length && randomUnit(`${key}:strict`) < .82) return strict[hash32(`${key}:strict-pick`) % strict.length].visitor;
  let roll = randomUnit(key) * pool.reduce((sum, p) => sum + p.weight, 0);
  for (const p of pool) { roll -= p.weight; if (roll <= 0) return p.visitor; }
  return pool.at(-1)?.visitor;
}

export function selectOpportunity({seed,at,placed,goodie,available,bowls,n=0}) {
 const key=`${seed}:opportunity:${at}:${placed.slotId}:${n}`;
 const stock=bowls.filter(b=>lookup(YARD_FOODS,b.foodId)&&integer(b.servings)&&b.servings>0).sort((a,b)=>compareText(a.id,b.id));
 if(!stock.length||!available.length)return null;
 const bowl=stock[hash32(`${key}:bowl`)%stock.length],pool=matchingVisitorCandidates(goodie,bowl,placed.condition);
 if(!pool.length)return null;
 const chance=Math.max(.08,Math.min(.96,(pool.some(p=>p.strict)?.92:.42)*getYardConditionProfile(goodie,placed.condition).attraction));
 if(randomUnit(`${key}:chance`)>=chance)return null;
 const visitor=chooseVisitor(pool,`${key}:visitor`),poseMatches=available.filter(a=>visitor.poses.includes(a.pose));
 const activities=poseMatches.length?poseMatches:available,activity=activities[hash32(`${key}:activity`)%activities.length];
 const id=`visit_v2_${at.toString(36)}_${digest(`${key}:${visitor.id}:${activity.id}`).slice(0,32)}`;
 return {key,bowl,visitor,activity,id,leavesAt:at+randomInt(`${key}:duration`,45,110)*60000};
}
