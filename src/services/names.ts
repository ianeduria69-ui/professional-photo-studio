/** File-name stem that is safe on Windows, macOS and Linux. */
export function projectFileNameStem(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  return (cleaned || 'untitled').slice(0, 80);
}
