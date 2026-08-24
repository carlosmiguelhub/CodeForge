import { PassThrough } from "node:stream";

import Docker from "dockerode";

export interface GuiSessionLogReader {
  streamLogs(containerRef: string): Promise<NodeJS.ReadableStream>;
}

// Docker's log API multiplexes stdout/stderr into one stream with an
// 8-byte frame header per chunk (since the container isn't created with
// `Tty: true`) — without demuxing, those header bytes would land in the
// Console panel's text as binary noise. This merges both streams into one
// plain text stream; the Console panel doesn't need to visually
// distinguish javac's stderr from the app's stdout.
export class DockerGuiSessionLogReader implements GuiSessionLogReader {
  constructor(private readonly docker: Docker = new Docker()) {}

  async streamLogs(containerRef: string): Promise<NodeJS.ReadableStream> {
    const container = this.docker.getContainer(containerRef);
    const raw = await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
      tail: 200,
    });
    const combined = new PassThrough();
    this.docker.modem.demuxStream(raw as never, combined, combined);
    return combined;
  }
}
