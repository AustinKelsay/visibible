/** Project Gutenberg marks italics as _word_; show them as italics rather than underscores. */
export function withItalics(text: string) {
  return text.split(/_([^_\n]+)_/).map((part, index) => (index % 2 ? <em key={index}>{part}</em> : part));
}
