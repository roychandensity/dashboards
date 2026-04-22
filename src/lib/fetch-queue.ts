/** Simple concurrency limiter for fetch requests */
const MAX_CONCURRENT = 6;
let active = 0;
const queue: (() => void)[] = [];

function release() {
  active--;
  const next = queue.shift();
  if (next) {
    active++;
    next();
  }
}

export function queuedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const run = () => {
      fetch(input, init).then(resolve, reject).finally(release);
    };

    if (active < MAX_CONCURRENT) {
      active++;
      run();
    } else {
      queue.push(run);
    }
  });
}
