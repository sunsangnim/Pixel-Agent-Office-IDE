/** Strip ANSI/terminal control sequences so raw CLI output reads like plain chat text. */
export function stripAnsi(input: string): string {
  return input
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
    .replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
