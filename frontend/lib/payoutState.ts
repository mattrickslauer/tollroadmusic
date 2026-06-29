import type { PayoutStatus } from "./api/types";

export type PayoutUiState = "loading" | "not-connected" | "incomplete" | "ready";

export function derivePayoutState(status: PayoutStatus | null): PayoutUiState {
  if (!status) return "loading";
  if (!status.connected) return "not-connected";
  if (!status.payoutsEnabled) return "incomplete";
  return "ready";
}
