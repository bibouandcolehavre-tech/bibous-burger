// Single-process JSON store: protect the whole read/change/write cycle.
const createDatabaseLock = () => {
  let tail = Promise.resolve();
  return async () => {
    const previous = tail;
    let release;
    tail = new Promise(resolve => { release = resolve; });
    await previous;
    return release;
  };
};
module.exports = { createDatabaseLock };
