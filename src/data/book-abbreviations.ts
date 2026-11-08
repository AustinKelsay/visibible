// Short book names (SBL-style) for tight spaces such as the phone header, keyed by USFM id.
export const BOOK_ABBREVIATIONS: Record<string, string> = {
  GEN: "Gen", EXO: "Exod", LEV: "Lev", NUM: "Num", DEU: "Deut", JOS: "Josh", JDG: "Judg", RUT: "Ruth",
  "1SA": "1 Sam", "2SA": "2 Sam", "1KI": "1 Kgs", "2KI": "2 Kgs", "1CH": "1 Chr", "2CH": "2 Chr",
  EZR: "Ezra", NEH: "Neh", EST: "Esth", JOB: "Job", PSA: "Ps", PRO: "Prov", ECC: "Eccl", SNG: "Song",
  ISA: "Isa", JER: "Jer", LAM: "Lam", EZK: "Ezek", DAN: "Dan", HOS: "Hos", JOL: "Joel", AMO: "Amos",
  OBA: "Obad", JON: "Jonah", MIC: "Mic", NAM: "Nah", HAB: "Hab", ZEP: "Zeph", HAG: "Hag", ZEC: "Zech",
  MAL: "Mal", MAT: "Matt", MRK: "Mark", LUK: "Luke", JHN: "John", ACT: "Acts", ROM: "Rom",
  "1CO": "1 Cor", "2CO": "2 Cor", GAL: "Gal", EPH: "Eph", PHP: "Phil", COL: "Col",
  "1TH": "1 Thess", "2TH": "2 Thess", "1TI": "1 Tim", "2TI": "2 Tim", TIT: "Titus", PHM: "Phlm",
  HEB: "Heb", JAS: "Jas", "1PE": "1 Pet", "2PE": "2 Pet", "1JN": "1 John", "2JN": "2 John",
  "3JN": "3 John", JUD: "Jude", REV: "Rev",
};

export function bookAbbreviation(id: string, fallbackName: string): string {
  return BOOK_ABBREVIATIONS[id] ?? fallbackName;
}
