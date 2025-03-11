import * as nacl from "tweetnacl";
import { Buffer } from "node:buffer";

export function verifySignature(props: {
  publicKey: string;
  signature: string;
  timestamp: string;
  rawBody: string;
}): boolean {
  try {
    return nacl.sign.detached.verify(
      Buffer.from(props.timestamp + props.rawBody),
      Buffer.from(props.signature, "hex"),
      Buffer.from(props.publicKey, "hex"),
    );
  } catch (_e) {
    return false;
  }
}
