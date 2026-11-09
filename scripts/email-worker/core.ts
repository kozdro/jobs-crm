export type DeliveryOutcome =
  "accepted" | "safe_failure" | "permanent_failure" | "unknown";

/** Transport implementations must classify any uncertain provider acceptance as unknown. */
export interface DeliveryTransport {
  send(message: {
    recipient: string;
    subject: string;
    text: string;
  }): Promise<DeliveryOutcome>;
}
