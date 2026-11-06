// PSEUDO
// TYPE_COLORS = { Work:{bg,ink}, Exam:{..}, Event, Hobby, Dating, None, Busy }   (TECHNICAL §9)
// USER_COLORS = ['#1C1917','#0F766E','#6D28D9','#B45309']   never a Type ink
// typeClass(type|null) -> 't-work' ... 't-none'
// blockColor(block, linkedItem?) -> linkedItem?.type ?? block.type ?? None    (FR-H11)
