/** Worker restart restores the same-head report; never erase an earlier food result. */
export function initializeFoodReport(report){
 report.food??={};const food=report.food;
 for(const key of ['transactions','states','nativeStateCaptures','affectedHud'])food[key]??=[];
 food.sections??={};for(const key of ['recording','states','errors'])food.sections[key]??='not-run';
 food.qualification??='Inactive fixture-only preview; no visitor admission or full-stay claim';
 report.sections??={};report.sections.food=report.sections.food==='failed'||Object.values(food.sections).includes('failed')?'failed':'running';return food;
}
