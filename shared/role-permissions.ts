export const ACCESS_FEATURES = [
  { id: "dashboard", label: "Visão geral", description: "Indicadores e resumo da operação" },
  { id: "tables", label: "Mesas e comandas", description: "Abrir mesas, comandas, lançar itens e receber pagamentos" },
  { id: "customers", label: "Clientes", description: "Consultar, cadastrar e gerenciar clientes" },
  { id: "products", label: "Produtos", description: "Catálogo, categorias, preços e cadastro de produtos" },
  { id: "stock", label: "Estoque", description: "Consultar movimentos e ajustar entradas e saídas" },
  { id: "finance", label: "Financeiro", description: "Consultar e registrar despesas" },
  { id: "reports", label: "Relatórios", description: "Consultar relatórios de vendas e recebimentos" },
  { id: "settings", label: "Configurações", description: "Regras comerciais e parâmetros da operação" },
] as const;

export type AccessFeature = (typeof ACCESS_FEATURES)[number]["id"];
export type RolePermissions = {
  manager: AccessFeature[];
  attendant: AccessFeature[];
};

export const DEFAULT_ROLE_PERMISSIONS: RolePermissions = {
  manager: ACCESS_FEATURES.map(({ id }) => id),
  attendant: ["tables", "customers", "reports"],
};

export function canAccessFeature(
  role: string | undefined,
  permissions: RolePermissions | undefined,
  feature: AccessFeature,
): boolean {
  if (role === "administrator") return true;
  if (role !== "manager" && role !== "attendant") return false;
  return (permissions ?? DEFAULT_ROLE_PERMISSIONS)[role].includes(feature);
}
