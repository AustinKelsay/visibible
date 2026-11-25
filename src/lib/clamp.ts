/** `value` kept between `low` and `high`; `low` wins where the range is empty. */
export const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), Math.max(low, high));
