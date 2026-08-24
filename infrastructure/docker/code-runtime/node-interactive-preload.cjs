// Docker keeps the attached stdin pipe open for the lifetime of the container.
// Node 12's readline.close() pauses that stream but leaves its handle referenced,
// so an otherwise-complete beginner program never exits. Unref only after the
// student's readline interface closes; while it is active, stdin behaves
// normally and continues to keep the process alive for the next answer.
// --require preloads CommonJS modules, including on the image's Node 12.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const readline = require("readline");
const createInterface = readline.createInterface;

readline.createInterface = function patchedCreateInterface(...args) {
  const instance = createInterface.apply(this, args);
  instance.once("close", () => {
    const options = args[0];
    const input =
      options && typeof options === "object" && "input" in options
        ? options.input
        : options;
    if (input && typeof input.destroy === "function") {
      input.destroy();
    }
    if (input && input._handle && typeof input._handle.close === "function") {
      // Standard streams use autoClose=false, so destroy() alone deliberately
      // leaves fd 0 alive. Once readline is closed, close that process-local
      // pipe handle so Docker's still-open writer cannot keep Node running.
      input._handle.close();
    } else if (input && typeof input.unref === "function") {
      input.unref();
    } else if (
      input &&
      input._handle &&
      typeof input._handle.unref === "function"
    ) {
      // Node 12's ReadStream does not expose unref(), although its pipe handle
      // does. This is the runtime currently supplied by Ubuntu 22.04.
      input._handle.unref();
    }
  });
  return instance;
};
