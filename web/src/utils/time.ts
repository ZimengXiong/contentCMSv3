export function formatRelativeTime(input: Date | string): string {
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) {
    return 'Unknown'
  }

  const diffSeconds = (date.getTime() - Date.now()) / 1000

  const divisions: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
    { amount: 60, unit: 'second' },
    { amount: 60, unit: 'minute' },
    { amount: 24, unit: 'hour' },
    { amount: 7, unit: 'day' },
    { amount: 4.34524, unit: 'week' },
    { amount: 12, unit: 'month' },
    { amount: Number.POSITIVE_INFINITY, unit: 'year' },
  ]

  let duration = diffSeconds
  for (const division of divisions) {
    if (Math.abs(duration) < division.amount) {
      const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
      return rtf.format(Math.round(duration), division.unit)
    }
    duration /= division.amount
  }

  return ''
}
