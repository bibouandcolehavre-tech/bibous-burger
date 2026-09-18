const applyProductStock = (product, catalog) => {
  const stock = catalog?.products?.find((entry) => entry.id === product.id);
  return stock ? { ...product, soldOut: !stock.available, stockReason: stock.reason } : product;
};

const availableOptionGroups = (groups, catalog) => groups.map((group) => ({
  ...group,
  options: group.options.map((option) => ({ ...option, soldOut: catalog?.options?.[`${group.id}:${option.id}`] === false }))
}));

const cartStockProblem = (items, catalog) => {
  for (const item of items || []) {
    const product = applyProductStock(item.product, catalog);
    if (product.soldOut) return product.stockReason || `${product.name} est momentanément indisponible.`;
    for (const selection of item.selections || []) {
      if (catalog?.options?.[`${selection.groupId}:${selection.id}`] === false) return `Une option de « ${product.name} » n’est plus disponible.`;
    }
  }
  return "";
};

module.exports = { applyProductStock, availableOptionGroups, cartStockProblem };
