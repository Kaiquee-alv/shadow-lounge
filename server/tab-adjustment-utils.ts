export function planTabTotalAdjustment(input: {
  baseTotalCents: number;
  currentAdjustmentCents: number;
  newTotalCents: number;
  paidCents: number;
}) {
  const { baseTotalCents, currentAdjustmentCents, newTotalCents, paidCents } = input;
  if (!Number.isSafeInteger(newTotalCents) || newTotalCents < 0) {
    throw new Error("Informe um novo total válido");
  }
  const currentTotalCents = Math.max(0, baseTotalCents + currentAdjustmentCents);
  if (newTotalCents < paidCents) {
    throw new Error("O novo total não pode ficar abaixo do valor já pago");
  }
  return {
    currentTotalCents,
    newTotalCents,
    adjustmentCents: newTotalCents - baseTotalCents,
  };
}
