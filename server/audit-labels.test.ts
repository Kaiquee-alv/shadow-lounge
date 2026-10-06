import { describe, expect, it } from "vitest";
import { auditActionLabel, auditDescriptionInPortuguese, auditRoleLabel } from "../shared/audit-labels.js";

describe("rótulos da auditoria", () => {
  it("apresenta em português todas as ações conhecidas", () => {
    const actions = [
      "OPEN_TAB", "CLOSE_TAB", "ADD_ITEM", "UPDATE_ITEM", "REMOVE_ITEM", "PAYMENT",
      "TRANSFER_TAB", "ADJUST_STOCK", "UPDATE_TAB_CHARGES", "ADJUST_TAB_TOTAL", "SYNC_OFFLINE_TAB",
      "UPDATE_TAB_CUSTOMER", "CREATE_PRODUCT", "UPDATE_PRODUCT", "DELETE_PRODUCT", "DEACTIVATE_PRODUCT",
      "ACTIVATE_PRODUCT", "CREATE_CATEGORY", "CREATE_PRICE_RULE", "UPDATE_PRICE_RULE", "DELETE_PRICE_RULE",
      "ACTIVATE_PRICE_RULE", "DEACTIVATE_PRICE_RULE", "CREATE_EXPENSE", "CREATE_USER", "DELETE_USER",
      "UPDATE_ACCESS", "CREATE_CUSTOMER", "UPDATE_CUSTOMER", "DEACTIVATE_CUSTOMER", "UPDATE_TABLE_LIMIT",
      "UPDATE_SETTINGS",
    ];
    for (const action of actions) {
      expect(auditActionLabel(action), action).not.toBe("Ação registrada");
      expect(auditActionLabel(action)).not.toContain("_");
    }
  });

  it("traduz perfis em descrições históricas conhecidas sem alterar nomes ou texto livre", () => {
    expect(auditRoleLabel("administrator")).toBe("administrador");
    expect(auditRoleLabel("manager")).toBe("gerente");
    expect(auditRoleLabel("attendant")).toBe("atendente");
    expect(auditDescriptionInPortuguese("Criou o usuário Ana (administrator)")).toBe("Criou o usuário Ana (administrador)");
    expect(auditDescriptionInPortuguese("Atualizou permissão para attendant (inativo)")).toBe("Atualizou permissão para atendente (inativo)");
    expect(auditDescriptionInPortuguese("managerial report")).toBe("managerial report");
  });
});
