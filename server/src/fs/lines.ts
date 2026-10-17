/** Read a text file line by line without loading it all into memory. */
export async function* readLines(path: string): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buf = "";
  for await (const chunk of Bun.file(path).stream()) {
    buf += decoder.decode(chunk, { stream: true });
    let start = 0;
    let nl: number;
    while ((nl = buf.indexOf("\n", start)) >= 0) {
      yield buf.slice(start, nl);
      start = nl + 1;
    }
    buf = buf.slice(start);
  }
  buf += decoder.decode();
  if (buf) yield buf;
}
