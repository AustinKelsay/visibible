// Static Bible structure data for KJV
// Enables navigation without API calls

export interface BibleBook {
  id: string;
  name: string;
  slug: string;
  testament: "old" | "new";
  chapters: number[]; // verse counts per chapter
}

export const BIBLE_BOOKS: BibleBook[] = [
  // Old Testament (39 books)
  {
    id: "GEN",
    name: "Genesis",
    slug: "genesis",
    testament: "old",
    chapters: [31, 25, 24, 26, 32, 22, 24, 22, 29, 32, 32, 20, 18, 24, 21, 16, 27, 33, 38, 18, 34, 24, 20, 67, 34, 35, 46, 22, 35, 43, 55, 32, 20, 31, 29, 43, 36, 30, 23, 23, 57, 38, 34, 34, 28, 34, 31, 22, 33, 26],
  },
  {
    id: "EXO",
    name: "Exodus",
    slug: "exodus",
    testament: "old",
    chapters: [22, 25, 22, 31, 23, 30, 25, 32, 35, 29, 10, 51, 22, 31, 27, 36, 16, 27, 25, 26, 36, 31, 33, 18, 40, 37, 21, 43, 46, 38, 18, 35, 23, 35, 35, 38, 29, 31, 43, 38],
  },
  {
    id: "LEV",
    name: "Leviticus",
    slug: "leviticus",
    testament: "old",
    chapters: [17, 16, 17, 35, 19, 30, 38, 36, 24, 20, 47, 8, 59, 57, 33, 34, 16, 30, 37, 27, 24, 33, 44, 23, 55, 46, 34],
  },
  {
    id: "NUM",
    name: "Numbers",
    slug: "numbers",
    testament: "old",
    chapters: [54, 34, 51, 49, 31, 27, 89, 26, 23, 36, 35, 16, 33, 45, 41, 50, 13, 32, 22, 29, 35, 41, 30, 25, 18, 65, 23, 31, 40, 16, 54, 42, 56, 29, 34, 13],
  },
  {
    id: "DEU",
    name: "Deuteronomy",
    slug: "deuteronomy",
    testament: "old",
    chapters: [46, 37, 29, 49, 33, 25, 26, 20, 29, 22, 32, 32, 18, 29, 23, 22, 20, 22, 21, 20, 23, 30, 25, 22, 19, 19, 26, 68, 29, 20, 30, 52, 29, 12],
  },
  {
    id: "JOS",
    name: "Joshua",
    slug: "joshua",
    testament: "old",
    chapters: [18, 24, 17, 24, 15, 27, 26, 35, 27, 43, 23, 24, 33, 15, 63, 10, 18, 28, 51, 9, 45, 34, 16, 33],
  },
  {
    id: "JDG",
    name: "Judges",
    slug: "judges",
    testament: "old",
    chapters: [36, 23, 31, 24, 31, 40, 25, 35, 57, 18, 40, 15, 25, 20, 20, 31, 13, 31, 30, 48, 25],
  },
  {
    id: "RUT",
    name: "Ruth",
    slug: "ruth",
    testament: "old",
    chapters: [22, 23, 18, 22],
  },
  {
    id: "1SA",
    name: "1 Samuel",
    slug: "1-samuel",
    testament: "old",
    chapters: [28, 36, 21, 22, 12, 21, 17, 22, 27, 27, 15, 25, 23, 52, 35, 23, 58, 30, 24, 42, 15, 23, 29, 22, 44, 25, 12, 25, 11, 31, 13],
  },
  {
    id: "2SA",
    name: "2 Samuel",
    slug: "2-samuel",
    testament: "old",
    chapters: [27, 32, 39, 12, 25, 23, 29, 18, 13, 19, 27, 31, 39, 33, 37, 23, 29, 33, 43, 26, 22, 51, 39, 25],
  },
  {
    id: "1KI",
    name: "1 Kings",
    slug: "1-kings",
    testament: "old",
    chapters: [53, 46, 28, 34, 18, 38, 51, 66, 28, 29, 43, 33, 34, 31, 34, 34, 24, 46, 21, 43, 29, 53],
  },
  {
    id: "2KI",
    name: "2 Kings",
    slug: "2-kings",
    testament: "old",
    chapters: [18, 25, 27, 44, 27, 33, 20, 29, 37, 36, 21, 21, 25, 29, 38, 20, 41, 37, 37, 21, 26, 20, 37, 20, 30],
  },
  {
    id: "1CH",
    name: "1 Chronicles",
    slug: "1-chronicles",
    testament: "old",
    chapters: [54, 55, 24, 43, 26, 81, 40, 40, 44, 14, 47, 40, 14, 17, 29, 43, 27, 17, 19, 8, 30, 19, 32, 31, 31, 32, 34, 21, 30],
  },
  {
    id: "2CH",
    name: "2 Chronicles",
    slug: "2-chronicles",
    testament: "old",
    chapters: [17, 18, 17, 22, 14, 42, 22, 18, 31, 19, 23, 16, 22, 15, 19, 14, 19, 34, 11, 37, 20, 12, 21, 27, 28, 23, 9, 27, 36, 27, 21, 33, 25, 33, 27, 23],
  },
  {
    id: "EZR",
    name: "Ezra",
    slug: "ezra",
    testament: "old",
    chapters: [11, 70, 13, 24, 17, 22, 28, 36, 15, 44],
  },
  {
    id: "NEH",
    name: "Nehemiah",
    slug: "nehemiah",
    testament: "old",
    chapters: [11, 20, 32, 23, 19, 19, 73, 18, 38, 39, 36, 47, 31],
  },
  {
    id: "EST",
    name: "Esther",
    slug: "esther",
    testament: "old",
    chapters: [22, 23, 15, 17, 14, 14, 10, 17, 32, 3],
  },
  {
    id: "JOB",
    name: "Job",
    slug: "job",
    testament: "old",
    chapters: [22, 13, 26, 21, 27, 30, 21, 22, 35, 22, 20, 25, 28, 22, 35, 22, 16, 21, 29, 29, 34, 30, 17, 25, 6, 14, 23, 28, 25, 31, 40, 22, 33, 37, 16, 33, 24, 41, 30, 24, 34, 17],
  },
  {
    id: "PSA",
    name: "Psalms",
    slug: "psalms",
    testament: "old",
    chapters: [6, 12, 8, 8, 12, 10, 17, 9, 20, 18, 7, 8, 6, 7, 5, 11, 15, 50, 14, 9, 13, 31, 6, 10, 22, 12, 14, 9, 11, 12, 24, 11, 22, 22, 28, 12, 40, 22, 13, 17, 13, 11, 5, 26, 17, 11, 9, 14, 20, 23, 19, 9, 6, 7, 23, 13, 11, 11, 17, 12, 8, 12, 11, 10, 13, 20, 7, 35, 36, 5, 24, 20, 28, 23, 10, 12, 20, 72, 13, 19, 16, 8, 18, 12, 13, 17, 7, 18, 52, 17, 16, 15, 5, 23, 11, 13, 12, 9, 9, 5, 8, 28, 22, 35, 45, 48, 43, 13, 31, 7, 10, 10, 9, 8, 18, 19, 2, 29, 176, 7, 8, 9, 4, 8, 5, 6, 5, 6, 8, 8, 3, 18, 3, 3, 21, 26, 9, 8, 24, 13, 10, 7, 12, 15, 21, 10, 20, 14, 9, 6],
  },
  {
    id: "PRO",
    name: "Proverbs",
    slug: "proverbs",
    testament: "old",
    chapters: [33, 22, 35, 27, 23, 35, 27, 36, 18, 32, 31, 28, 25, 35, 33, 33, 28, 24, 29, 30, 31, 29, 35, 34, 28, 28, 27, 28, 27, 33, 31],
  },
  {
    id: "ECC",
    name: "Ecclesiastes",
    slug: "ecclesiastes",
    testament: "old",
    chapters: [18, 26, 22, 16, 20, 12, 29, 17, 18, 20, 10, 14],
  },
  {
    id: "SNG",
    name: "Song of Solomon",
    slug: "song-of-solomon",
    testament: "old",
    chapters: [17, 17, 11, 16, 16, 13, 13, 14],
  },
  {
    id: "ISA",
    name: "Isaiah",
    slug: "isaiah",
    testament: "old",
    chapters: [31, 22, 26, 6, 30, 13, 25, 22, 21, 34, 16, 6, 22, 32, 9, 14, 14, 7, 25, 6, 17, 25, 18, 23, 12, 21, 13, 29, 24, 33, 9, 20, 24, 17, 10, 22, 38, 22, 8, 31, 29, 25, 28, 28, 25, 13, 15, 22, 26, 11, 23, 15, 12, 17, 13, 12, 21, 14, 21, 22, 11, 12, 19, 12, 25, 24],
  },
  {
    id: "JER",
    name: "Jeremiah",
    slug: "jeremiah",
    testament: "old",
    chapters: [19, 37, 25, 31, 31, 30, 34, 22, 26, 25, 23, 17, 27, 22, 21, 21, 27, 23, 15, 18, 14, 30, 40, 10, 38, 24, 22, 17, 32, 24, 40, 44, 26, 22, 19, 32, 21, 28, 18, 16, 18, 22, 13, 30, 5, 28, 7, 47, 39, 46, 64, 34],
  },
  {
    id: "LAM",
    name: "Lamentations",
    slug: "lamentations",
    testament: "old",
    chapters: [22, 22, 66, 22, 22],
  },
  {
    id: "EZK",
    name: "Ezekiel",
    slug: "ezekiel",
    testament: "old",
    chapters: [28, 10, 27, 17, 17, 14, 27, 18, 11, 22, 25, 28, 23, 23, 8, 63, 24, 32, 14, 49, 32, 31, 49, 27, 17, 21, 36, 26, 21, 26, 18, 32, 33, 31, 15, 38, 28, 23, 29, 49, 26, 20, 27, 31, 25, 24, 23, 35],
  },
  {
    id: "DAN",
    name: "Daniel",
    slug: "daniel",
    testament: "old",
    chapters: [21, 49, 30, 37, 31, 28, 28, 27, 27, 21, 45, 13],
  },
  {
    id: "HOS",
    name: "Hosea",
    slug: "hosea",
    testament: "old",
    chapters: [11, 23, 5, 19, 15, 11, 16, 14, 17, 15, 12, 14, 16, 9],
  },
  {
    id: "JOL",
    name: "Joel",
    slug: "joel",
    testament: "old",
    chapters: [20, 32, 21],
  },
  {
    id: "AMO",
    name: "Amos",
    slug: "amos",
    testament: "old",
    chapters: [15, 16, 15, 13, 27, 14, 17, 14, 15],
  },
  {
    id: "OBA",
    name: "Obadiah",
    slug: "obadiah",
    testament: "old",
    chapters: [21],
  },
  {
    id: "JON",
    name: "Jonah",
    slug: "jonah",
    testament: "old",
    chapters: [17, 10, 10, 11],
  },
  {
    id: "MIC",
    name: "Micah",
    slug: "micah",
    testament: "old",
    chapters: [16, 13, 12, 13, 15, 16, 20],
  },
  {
    id: "NAM",
    name: "Nahum",
    slug: "nahum",
    testament: "old",
    chapters: [15, 13, 19],
  },
  {
    id: "HAB",
    name: "Habakkuk",
    slug: "habakkuk",
    testament: "old",
    chapters: [17, 20, 19],
  },
  {
    id: "ZEP",
    name: "Zephaniah",
    slug: "zephaniah",
    testament: "old",
    chapters: [18, 15, 20],
  },
  {
    id: "HAG",
    name: "Haggai",
    slug: "haggai",
    testament: "old",
    chapters: [15, 23],
  },
  {
    id: "ZEC",
    name: "Zechariah",
    slug: "zechariah",
    testament: "old",
    chapters: [21, 13, 10, 14, 11, 15, 14, 23, 17, 12, 17, 14, 9, 21],
  },
  {
    id: "MAL",
    name: "Malachi",
    slug: "malachi",
    testament: "old",
    chapters: [14, 17, 18, 6],
  },
  // New Testament (27 books)
  {
    id: "MAT",
    name: "Matthew",
    slug: "matthew",
    testament: "new",
    chapters: [25, 23, 17, 25, 48, 34, 29, 34, 38, 42, 30, 50, 58, 36, 39, 28, 27, 35, 30, 34, 46, 46, 39, 51, 46, 75, 66, 20],
  },
  {
    id: "MRK",
    name: "Mark",
    slug: "mark",
    testament: "new",
    chapters: [45, 28, 35, 41, 43, 56, 37, 38, 50, 52, 33, 44, 37, 72, 47, 20],
  },
  {
    id: "LUK",
    name: "Luke",
    slug: "luke",
    testament: "new",
    chapters: [80, 52, 38, 44, 39, 49, 50, 56, 62, 42, 54, 59, 35, 35, 32, 31, 37, 43, 48, 47, 38, 71, 56, 53],
  },
  {
    id: "JHN",
    name: "John",
    slug: "john",
    testament: "new",
    chapters: [51, 25, 36, 54, 47, 71, 53, 59, 41, 42, 57, 50, 38, 31, 27, 33, 26, 40, 42, 31, 25],
  },
  {
    id: "ACT",
    name: "Acts",
    slug: "acts",
    testament: "new",
    chapters: [26, 47, 26, 37, 42, 15, 60, 40, 43, 48, 30, 25, 52, 28, 41, 40, 34, 28, 41, 38, 40, 30, 35, 27, 27, 32, 44, 31],
  },
  {
    id: "ROM",
    name: "Romans",
    slug: "romans",
    testament: "new",
    chapters: [32, 29, 31, 25, 21, 23, 25, 39, 33, 21, 36, 21, 14, 23, 33, 27],
  },
  {
    id: "1CO",
    name: "1 Corinthians",
    slug: "1-corinthians",
    testament: "new",
    chapters: [31, 16, 23, 21, 13, 20, 40, 13, 27, 33, 34, 31, 13, 40, 58, 24],
  },
  {
    id: "2CO",
    name: "2 Corinthians",
    slug: "2-corinthians",
    testament: "new",
    chapters: [24, 17, 18, 18, 21, 18, 16, 24, 15, 18, 33, 21, 14],
  },
  {
    id: "GAL",
    name: "Galatians",
    slug: "galatians",
    testament: "new",
    chapters: [24, 21, 29, 31, 26, 18],
  },
  {
    id: "EPH",
    name: "Ephesians",
    slug: "ephesians",
    testament: "new",
    chapters: [23, 22, 21, 32, 33, 24],
  },
  {
    id: "PHP",
    name: "Philippians",
    slug: "philippians",
    testament: "new",
    chapters: [30, 30, 21, 23],
  },
  {
    id: "COL",
    name: "Colossians",
    slug: "colossians",
    testament: "new",
    chapters: [29, 23, 25, 18],
  },
  {
    id: "1TH",
    name: "1 Thessalonians",
    slug: "1-thessalonians",
    testament: "new",
    chapters: [10, 20, 13, 18, 28],
  },
  {
    id: "2TH",
    name: "2 Thessalonians",
    slug: "2-thessalonians",
    testament: "new",
    chapters: [12, 17, 18],
  },
  {
    id: "1TI",
    name: "1 Timothy",
    slug: "1-timothy",
    testament: "new",
    chapters: [20, 15, 16, 16, 25, 21],
  },
  {
    id: "2TI",
    name: "2 Timothy",
    slug: "2-timothy",
    testament: "new",
    chapters: [18, 26, 17, 22],
  },
  {
    id: "TIT",
    name: "Titus",
    slug: "titus",
    testament: "new",
    chapters: [16, 15, 15],
  },
  {
    id: "PHM",
    name: "Philemon",
    slug: "philemon",
    testament: "new",
    chapters: [25],
  },
  {
    id: "HEB",
    name: "Hebrews",
    slug: "hebrews",
    testament: "new",
    chapters: [14, 18, 19, 16, 14, 20, 28, 13, 28, 39, 40, 29, 25],
  },
  {
    id: "JAS",
    name: "James",
    slug: "james",
    testament: "new",
    chapters: [27, 26, 18, 17, 20],
  },
  {
    id: "1PE",
    name: "1 Peter",
    slug: "1-peter",
    testament: "new",
    chapters: [25, 25, 22, 19, 14],
  },
  {
    id: "2PE",
    name: "2 Peter",
    slug: "2-peter",
    testament: "new",
    chapters: [21, 22, 18],
  },
  {
    id: "1JN",
    name: "1 John",
    slug: "1-john",
    testament: "new",
    chapters: [10, 29, 24, 21, 21],
  },
  {
    id: "2JN",
    name: "2 John",
    slug: "2-john",
    testament: "new",
    chapters: [13],
  },
  {
    id: "3JN",
    name: "3 John",
    slug: "3-john",
    testament: "new",
    chapters: [14],
  },
  {
    id: "JUD",
    name: "Jude",
    slug: "jude",
    testament: "new",
    chapters: [25],
  },
  {
    id: "REV",
    name: "Revelation",
    slug: "revelation",
    testament: "new",
    chapters: [20, 29, 22, 11, 14, 17, 17, 13, 21, 11, 19, 17, 18, 20, 8, 21, 18, 24, 21, 15, 27, 21],
  },
];

// Lookup maps for fast access
export const BOOK_BY_SLUG: Record<string, BibleBook> = Object.fromEntries(
  BIBLE_BOOKS.map((book) => [book.slug, book])
);

export const BOOK_BY_ID: Record<string, BibleBook> = Object.fromEntries(
  BIBLE_BOOKS.map((book) => [book.id, book])
);

// Helper to get total verses in a book
export function getTotalVerses(book: BibleBook): number {
  return book.chapters.reduce((sum, count) => sum + count, 0);
}

// Helper to check if verse location is valid
export function isValidLocation(
  book: BibleBook,
  chapter: number,
  verse: number
): boolean {
  if (!Number.isSafeInteger(chapter) || !Number.isSafeInteger(verse)) return false;
  if (chapter < 1 || chapter > book.chapters.length) return false;
  if (verse < 1 || verse > book.chapters[chapter - 1]) return false;
  return true;
}
