const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

const productName = (item) => {
  const id = String(item?.productId || "");
  const name = String(item?.name || id || "Article");
  const isMenu = id === "taurus" || id.endsWith("-menu");
  return isMenu && !/^menu\b/i.test(name) ? `Menu · ${name}` : name;
};

function orderProductInsights(orders = []) {
  const products = new Map();
  for (const order of orders) {
    for (const item of order.items || []) {
      const productId = String(item.productId || item.name || "unknown");
      const quantity = Math.max(1, Number(item.quantity) || 1);
      if (!products.has(productId)) products.set(productId, { productId, name: productName(item), quantity: 0, revenue: 0, orderIds: new Set(), customerIds: new Set() });
      const product = products.get(productId);
      product.quantity += quantity;
      product.revenue += (Number(item.price) || 0) * quantity;
      if (order.id) product.orderIds.add(order.id);
      if (order.customerId) product.customerIds.add(order.customerId);
    }
  }
  return [...products.values()].map((product) => ({
    productId: product.productId,
    name: product.name,
    quantity: product.quantity,
    orders: product.orderIds.size,
    customers: product.customerIds.size,
    revenue: money(product.revenue)
  })).sort((a, b) => b.quantity - a.quantity || b.orders - a.orders || a.name.localeCompare(b.name, "fr"));
}

module.exports = { orderProductInsights, productName };
