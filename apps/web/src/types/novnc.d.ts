// @novnc/novnc ships no types of its own, and the published
// @types/novnc__novnc package declares the module at the stale path
// "@novnc/novnc/lib/rfb" — this version's package.json "exports" field
// maps the bare specifier straight to "./core/rfb.js" instead, so that
// package's types never actually apply to what we import. This is a
// minimal, verified-against-source (node_modules/@novnc/novnc/core/rfb.js)
// declaration covering only what this app actually uses.
declare module "@novnc/novnc" {
  export interface RFBCredentials {
    username?: string;
    password?: string;
    target?: string;
  }

  export interface RFBOptions {
    shared?: boolean;
    credentials?: RFBCredentials;
    repeaterID?: string;
    wsProtocols?: string[];
  }

  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, urlOrChannel: string, options?: RFBOptions);

    viewOnly: boolean;
    clipViewport: boolean;
    scaleViewport: boolean;
    resizeSession: boolean;

    focus(options?: FocusOptions): void;
    blur(): void;
    disconnect(): void;
    sendCredentials(credentials: RFBCredentials): void;
    sendCtrlAltDel(): void;
    machineShutdown(): void;
    machineReboot(): void;
    machineReset(): void;
  }
}
