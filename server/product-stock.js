const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { STOCK_CATALOG } = require("./catalog");

// Separate from customers/orders so an older order snapshot cannot erase a stock update.
// The file lives beside DATA_FILE_PATH, on the same persistent Render disk.
const createProductStockStore = (filePath) => {
  let queue = Promise.resolve();
  const read = async () => {
    try {
      const stock = JSON.parse(await fs.readFile(filePath, "utf8"));
      if (!stock || Array.isArray(stock) || typeof stock !== "object" || Object.entries(stock).some(([id, value]) => !Object.hasOwn(STOCK_CATALOG, id) || typeof value !== "boolean")) throw new Error("Invalid stock file");
      return stock;
    } catch (error) {
      if (error.code === "ENOENT") return {};
      throw error; // Fail closed; never replace an unreadable stock file with default values.
    }
  };
  const update = (id, available) => {
    const task = queue.then(async () => {
      if (!Object.hasOwn(STOCK_CATALOG, id) || typeof available !== "boolean") throw Object.assign(new Error("Produit ou disponibilité invalide."), { statusCode: 400 });
      const stock = { ...await read(), [id]: available };
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const temporary = `${filePath}.${crypto.randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporary, `${JSON.stringify(stock, null, 2)}\n`, { mode: 0o600 });
        await fs.rename(temporary, filePath);
      } finally {
        await fs.unlink(temporary).catch((error) => { if (error.code !== "ENOENT") throw error; });
      }
      return stock;
    });
    queue = task.catch(() => {});
    return task;
  };
  return { read, update };
};

module.exports = { createProductStockStore };
