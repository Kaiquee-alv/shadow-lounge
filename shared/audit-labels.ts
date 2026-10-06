const labels: Record<string, string> = {
  OPEN_TAB: "Comanda aberta",
  CLOSE_TAB: "Comanda encerrada",
  ADD_ITEM: "Produto lançado",
  UPDATE_ITEM: "Item atualizado",
  REMOVE_ITEM: "Item removido",
  PAYMENT: "Pagamento recebido",
  TRANSFER_TAB: "Mesa transferida",
  ADJUST_STOCK: "Estoque ajustado",
  UPDATE_TAB_CHARGES: "Cobrança da comanda atualizada",
  ADJUST_TAB_TOTAL: "Total da comanda ajustado",
  SYNC_OFFLINE_TAB: "Comanda sincronizada",
  UPDATE_TAB_CUSTOMER: "Cliente da comanda atualizado",
  CREATE_PRODUCT: "Produto cadastrado",
  UPDATE_PRODUCT: "Produto atualizado",
  DELETE_PRODUCT: "Produto removido",
  DEACTIVATE_PRODUCT: "Produto desativado",
  ACTIVATE_PRODUCT: "Produto ativado",
  CREATE_CATEGORY: "Categoria criada",
  CREATE_PRICE_RULE: "Preço programado criado",
  UPDATE_PRICE_RULE: "Preço programado atualizado",
  DELETE_PRICE_RULE: "Preço programado excluído",
  ACTIVATE_PRICE_RULE: "Preço programado ativado",
  DEACTIVATE_PRICE_RULE: "Preço programado desativado",
  CREATE_EXPENSE: "Despesa registrada",
  CREATE_USER: "Usuário cadastrado",
  DELETE_USER: "Acesso de usuário removido",
  UPDATE_ACCESS: "Permissão atualizada",
  CREATE_CUSTOMER: "Cliente cadastrado",
  UPDATE_CUSTOMER: "Cliente atualizado",
  DEACTIVATE_CUSTOMER: "Cliente desativado",
  UPDATE_TABLE_LIMIT: "Limite de mesas atualizado",
  UPDATE_SETTINGS: "Configurações atualizadas",
};

const roleLabels: Record<string, string> = {
  administrator: "administrador",
  manager: "gerente",
  attendant: "atendente",
};

export function auditActionLabel(action: string): string {
  return labels[action] ?? "Ação registrada";
}

export function auditRoleLabel(role: string): string {
  return roleLabels[role] ?? "perfil não identificado";
}

/** Translates old English action/role fragments for display without modifying immutable stored events. */
export function auditDescriptionInPortuguese(description: string): string {
  return description
    .replace(/^(Criou o usuário .+ \()(administrator|manager|attendant)(\))$/i, (_match, prefix: string, role: string, suffix: string) => `${prefix}${auditRoleLabel(role)}${suffix}`)
    .replace(/^(Atualizou permissão para )(administrator|manager|attendant)( \((?:ativo|inativo)\))$/i, (_match, prefix: string, role: string, suffix: string) => `${prefix}${auditRoleLabel(role)}${suffix}`);
}
